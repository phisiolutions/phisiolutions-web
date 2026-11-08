// Tarjetas regalo: quien compra paga y recibe un código; la persona que lo recibe elige día y hora al canjearlo.
import type Stripe from 'stripe';
import { DateTime } from 'luxon';
import { randomInt, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { AGENDA, isSlotAvailable } from './availability';
import {
  BookingError,
  createCheckoutSession,
  finalizeBooking,
  invoiceAttachment,
  layout,
  invoiceDataParams,
  invoiceFields,
  paymentMethodParams,
  sessionInvoice,
  siteUrl,
  transferInstructionsUrl,
} from './booking';
import { busyBetween, createPendingBooking, db, ensureSchema, transitionStatus } from './db';
import { adminEmail, escapeHtml, sendMail } from './mail';
import {
  formatEuros,
  getService,
  GIFT_MAX_CENTS,
  GIFT_MIN_CENTS,
  GIFT_VALID_MONTHS,
  isBookable,
  isListed,
  SERVICES,
  type Service,
} from './services';
import { getStripe } from './stripe';

export type GiftStatus = 'pending' | 'awaiting_transfer' | 'paid' | 'redeemed' | 'cancelled';

export interface Gift {
  id: string;
  code: string;
  serviceId: string;
  buyerName: string;
  buyerEmail: string;
  recipientName: string;
  message: string | null;
  /** Servicios que quien regala ha sumado para fijar el importe (texto informativo). */
  items: string | null;
  amountCents: number;
  status: GiftStatus;
  stripeSessionId: string | null;
  invoicePdfUrl: string | null;
  invoiceUrl: string | null;
  bookingId: string | null;
  emailSent: number;
  createdAt: string;
  paidAt: string | null;
  expiresAt: string | null;
}

/** El servicio que se vende como regalo (si tiene precio publicado). */
export function giftService(): Service | null {
  return SERVICES.find((x) => x.gift && isListed(x)) ?? null;
}

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // sin 0/O ni 1/I/L para que no haya confusiones
function newCode(): string {
  const part = () => Array.from({ length: 4 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');
  return `PHI-${part()}-${part()}`;
}

export function normalizeCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, '');
}

function rowToGift(r: Record<string, unknown>): Gift {
  const str = (v: unknown) => (v === null || v === undefined ? null : String(v));
  return {
    id: String(r.id),
    code: String(r.code),
    serviceId: String(r.service_id),
    buyerName: String(r.buyer_name),
    buyerEmail: String(r.buyer_email),
    recipientName: String(r.recipient_name),
    message: str(r.message),
    items: str(r.items),
    amountCents: Number(r.amount_cents),
    status: r.status as GiftStatus,
    stripeSessionId: str(r.stripe_session_id),
    invoicePdfUrl: str(r.invoice_pdf_url),
    invoiceUrl: str(r.invoice_url),
    bookingId: str(r.booking_id),
    emailSent: Number(r.email_sent),
    createdAt: String(r.created_at),
    paidAt: str(r.paid_at),
    expiresAt: str(r.expires_at),
  };
}

async function query(sql: string, args: (string | number | null)[]): Promise<Gift | null> {
  await ensureSchema();
  const res = await db().execute({ sql, args });
  return res.rows[0] ? rowToGift(res.rows[0] as Record<string, unknown>) : null;
}

export const getGift = (id: string) => query(`SELECT * FROM gifts WHERE id = ?`, [id]);
export const getGiftByCode = (code: string) => query(`SELECT * FROM gifts WHERE code = ?`, [normalizeCode(code)]);
export const getGiftBySession = (sid: string) => query(`SELECT * FROM gifts WHERE stripe_session_id = ?`, [sid]);

async function exec(sql: string, args: (string | number | null)[]): Promise<number> {
  await ensureSchema();
  return (await db().execute({ sql, args })).rowsAffected;
}

export const GiftInput = z.object({
  buyerName: z.string().trim().min(2).max(120),
  buyerEmail: z.string().trim().email().max(200),
  recipientName: z.string().trim().min(2).max(120),
  message: z.string().trim().max(500).optional(),
  amountCents: z.number().int().min(GIFT_MIN_CENTS).max(GIFT_MAX_CENTS),
  serviceIds: z.array(z.string()).max(20).optional(),
  consent: z.literal(true),
});

/** Crea la tarjeta regalo (pendiente de pago) y la sesión de pago de Stripe. */
export async function startGiftCheckout(raw: unknown, now = DateTime.utc()): Promise<{ url: string; giftId: string }> {
  const parsed = GiftInput.safeParse(raw);
  if (!parsed.success) {
    const amount = (raw as { amountCents?: unknown })?.amountCents;
    if (typeof amount === 'number' && (amount < GIFT_MIN_CENTS || amount > GIFT_MAX_CENTS)) {
      throw new BookingError(
        `El importe debe estar entre ${formatEuros(GIFT_MIN_CENTS)} y ${formatEuros(GIFT_MAX_CENTS)}.`,
      );
    }
    throw new BookingError('Revisa los datos del formulario.');
  }
  const input = parsed.data;
  const items =
    (input.serviceIds ?? [])
      .map((sid) => getService(sid))
      .filter((s): s is Service => Boolean(s && isBookable(s)))
      .map((s) => s.name)
      .join(' + ') || null;
  const service = giftService();
  if (!service) throw new BookingError('La tarjeta regalo todavía no está disponible.');

  const id = randomUUID();
  const code = newCode();
  await exec(
    `INSERT INTO gifts (id, code, service_id, buyer_name, buyer_email, recipient_name, message, items, amount_cents, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
    [
      id,
      code,
      service.id,
      input.buyerName,
      input.buyerEmail,
      input.recipientName,
      input.message || null,
      items,
      input.amountCents,
      now.toISO()!,
    ],
  );

  try {
    const customer = await getStripe().customers.create({
      name: input.buyerName,
      email: input.buyerEmail,
      preferred_locales: ['es'],
      metadata: { gift_id: id },
    });
    const session = await createCheckoutSession({
      ...paymentMethodParams(),
      ...invoiceDataParams(),
      mode: 'payment',
      customer: customer.id,
      locale: 'es',
      currency: 'eur',
      client_reference_id: id,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: 'eur',
            unit_amount: input.amountCents,
            product_data: {
              name: `Tarjeta regalo: ${service.name}`,
              description: `Para ${input.recipientName}.${items ? ` Incluye: ${items}.` : ''} Válida ${GIFT_VALID_MONTHS} meses desde el pago.`,
            },
          },
        },
      ],
      invoice_creation: {
        enabled: true,
        invoice_data: {
          description: `Tarjeta regalo: ${service.name} (para ${input.recipientName})${items ? `. Incluye: ${items}` : ''}.`,
          ...invoiceFields(),
          metadata: { gift_id: id },
        },
      },
      metadata: { gift_id: id },
      payment_intent_data: { metadata: { gift_id: id } },
      success_url: `${siteUrl()}/regalo/confirmado?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteUrl()}/regalo?cancelada=1`,
    });
    await exec(`UPDATE gifts SET stripe_session_id = ? WHERE id = ?`, [session.id, id]);
    return { url: session.url!, giftId: id };
  } catch (e) {
    await exec(`UPDATE gifts SET status = 'cancelled' WHERE id = ? AND status = 'pending'`, [id]);
    throw e;
  }
}

export async function handleGiftEvent(type: string, session: Stripe.Checkout.Session): Promise<void> {
  const id = session.metadata?.gift_id;
  if (!id) return;
  switch (type) {
    case 'checkout.session.completed':
      if (session.payment_status === 'paid') return confirmGift(id, session.id);
      if ((await exec(`UPDATE gifts SET status = 'awaiting_transfer' WHERE id = ? AND status = 'pending'`, [id])) > 0) {
        await sendGiftTransferEmail(id, session);
      }
      return;
    case 'checkout.session.async_payment_succeeded':
      return confirmGift(id, session.id);
    case 'checkout.session.async_payment_failed':
    case 'checkout.session.expired':
      await exec(`UPDATE gifts SET status = 'cancelled' WHERE id = ? AND status IN ('pending','awaiting_transfer')`, [
        id,
      ]);
      return;
  }
}

/** Marca la tarjeta como pagada y envía al comprador la tarjeta con el código y la factura. Idempotente. */
export async function confirmGift(id: string, sessionId: string, now = DateTime.utc()): Promise<void> {
  await exec(
    `UPDATE gifts SET status = 'paid', paid_at = ?, expires_at = ?
     WHERE id = ? AND status IN ('pending','awaiting_transfer','cancelled')`,
    [now.toISO()!, now.plus({ months: GIFT_VALID_MONTHS }).toISO()!, id],
  );
  let gift = await getGift(id);
  if (!gift || gift.emailSent) return;
  if (!gift.invoiceUrl) {
    const invoice = await sessionInvoice(sessionId);
    if (invoice) {
      await exec(`UPDATE gifts SET invoice_pdf_url = ?, invoice_url = ? WHERE id = ?`, [
        invoice.invoice_pdf ?? null,
        invoice.hosted_invoice_url ?? null,
        id,
      ]);
      gift = (await getGift(id))!;
    }
  }
  await sendGiftEmails(gift);
  await exec(`UPDATE gifts SET email_sent = 1 WHERE id = ?`, [id]);
}

export function redeemUrl(code: string): string {
  return `${siteUrl()}/reservar?codigo=${encodeURIComponent(code)}`;
}

function giftCardHtml(g: Gift): string {
  const service = getService(g.serviceId);
  const until = g.expiresAt ? DateTime.fromISO(g.expiresAt).setLocale('es').toFormat("d 'de' LLLL 'de' yyyy") : '';
  return `<div style="border:2px solid #FFA514;border-radius:16px;padding:24px;background:#EAF9FD;margin:16px 0">
    <p style="margin:0;font-size:13px;letter-spacing:1px;color:#0B6E8A;font-weight:bold">TARJETA REGALO</p>
    <p style="margin:8px 0;font-size:20px;font-weight:bold">${escapeHtml(service?.name ?? 'Estudio de negocio')}</p>
    <p style="margin:0">Para: <strong>${escapeHtml(g.recipientName)}</strong><br>De: ${escapeHtml(g.buyerName)}</p>
    <p style="margin:8px 0 0">Valor: <strong>${formatEuros(g.amountCents)}</strong>${g.items ? `<br>Incluye: ${escapeHtml(g.items)}` : ''}</p>
    ${g.message ? `<p style="font-style:italic">“${escapeHtml(g.message)}”</p>` : ''}
    <p style="margin:16px 0 4px">Código:</p>
    <p style="margin:0;font-size:26px;font-weight:bold;letter-spacing:2px">${escapeHtml(g.code)}</p>
    <p style="margin:16px 0"><a href="${escapeHtml(redeemUrl(g.code))}" style="background:#FFA514;color:#0F2A3A;padding:12px 20px;border-radius:999px;text-decoration:none;font-weight:bold">Canjear y elegir día y hora</a></p>
    <p style="margin:0;font-size:13px">Sesión online por videollamada. Válida hasta el ${escapeHtml(until)}. También se puede canjear en ${escapeHtml(siteUrl())}/regalo</p>
  </div>`;
}

async function sendGiftEmails(g: Gift) {
  const attachments = await invoiceAttachment(g.invoicePdfUrl);
  const service = getService(g.serviceId);
  await sendMail({
    to: g.buyerEmail,
    subject: `Tu tarjeta regalo para ${g.recipientName}`,
    html: layout(`<p>Hola ${escapeHtml(g.buyerName)},</p>
      <p>Gracias por tu compra. Aquí tienes la tarjeta regalo: reenvía este email o comparte el código con
      ${escapeHtml(g.recipientName)}. Con él podrá elegir el día y la hora de su sesión.</p>
      ${giftCardHtml(g)}
      ${g.invoiceUrl ? `<p>Tu factura: <a href="${escapeHtml(g.invoiceUrl)}">ver factura</a>. También va adjunta en PDF.</p>` : ''}`),
    attachments,
  });
  await sendMail({
    to: adminEmail(),
    subject: `Tarjeta regalo vendida: ${service?.name ?? g.serviceId} (${g.buyerName} → ${g.recipientName})`,
    html: layout(`<p>Se ha vendido una tarjeta regalo (copia de la factura adjunta).</p>
      <p>Comprador: ${escapeHtml(g.buyerName)} &lt;${escapeHtml(g.buyerEmail)}&gt;<br>
      Para: ${escapeHtml(g.recipientName)}<br>Código: ${escapeHtml(g.code)}<br>Importe: ${formatEuros(g.amountCents)}${g.items ? `<br>Incluye: ${escapeHtml(g.items)}` : ''}</p>`),
    attachments,
  });
}

async function sendGiftTransferEmail(id: string, session: Stripe.Checkout.Session) {
  const g = await getGift(id);
  if (!g) return;
  const url = await transferInstructionsUrl(session);
  await sendMail({
    to: g.buyerEmail,
    subject: 'Tarjeta regalo pendiente de transferencia',
    html: layout(`<p>Hola ${escapeHtml(g.buyerName)},</p>
      <p>Hemos recibido tu pedido de tarjeta regalo para ${escapeHtml(g.recipientName)}. En cuanto llegue tu transferencia de
      ${formatEuros(g.amountCents)} te enviaremos la tarjeta con el código y la factura.</p>
      ${url ? `<p><a href="${escapeHtml(url)}">Ver los datos bancarios para la transferencia</a></p>` : ''}`),
  });
}

/** Comprueba si un código se puede canjear. Devuelve la tarjeta o un mensaje de error. */
export async function checkCode(raw: string, now = DateTime.utc()): Promise<{ gift: Gift } | { error: string }> {
  const gift = raw ? await getGiftByCode(raw) : null;
  if (!gift || gift.status === 'pending' || gift.status === 'cancelled') return { error: 'Código no válido.' };
  if (gift.status === 'awaiting_transfer') return { error: 'Esta tarjeta regalo aún está pendiente de pago.' };
  if (gift.status === 'redeemed') return { error: 'Este código ya se ha usado.' };
  if (gift.expiresAt && DateTime.fromISO(gift.expiresAt) < now) return { error: 'Este código ha caducado.' };
  return { gift };
}

export const RedeemInput = z.object({
  code: z.string().min(4).max(40),
  startUtc: z.string(),
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(200),
  phone: z.string().trim().max(40).optional(),
  notes: z.string().trim().max(1000).optional(),
  consent: z.literal(true),
});

/** Canjea el código: reserva la hora y confirma la cita sin pago. */
export async function redeemGift(raw: unknown, now = DateTime.utc()): Promise<{ bookingId: string }> {
  const parsed = RedeemInput.safeParse(raw);
  if (!parsed.success) throw new BookingError('Revisa los datos del formulario.');
  const input = parsed.data;
  const checked = await checkCode(input.code, now);
  if ('error' in checked) throw new BookingError(checked.error);
  const gift = checked.gift;
  const service = getService(gift.serviceId);
  if (!service) throw new BookingError('Servicio no válido.');

  const start = DateTime.fromISO(input.startUtc, { zone: 'utc' });
  if (!start.isValid) throw new BookingError('Hora no válida.');
  const startUtc = start.toISO({ suppressMilliseconds: true })!;
  const endUtc = start.plus({ minutes: service.durationMinutes }).toISO({ suppressMilliseconds: true })!;
  const busy = await busyBetween(start.minus({ days: 1 }).toISO()!, start.plus({ days: 1 }).toISO()!, now.toISO()!);
  const taken = new BookingError('Esa hora ya no está disponible. Elige otra, por favor.', 409);
  if (!isSlotAvailable(startUtc, service.durationMinutes, busy, now)) throw taken;

  const booking = await createPendingBooking(
    {
      serviceId: service.id,
      quantity: 1,
      startUtc,
      endUtc,
      name: input.name,
      email: input.email,
      phone: input.phone || null,
      notes: [
        `Tarjeta regalo ${gift.code} de ${gift.buyerName}, valor ${formatEuros(gift.amountCents)}${gift.items ? ` (${gift.items})` : ''}`,
        input.notes,
      ]
        .filter(Boolean)
        .join('. '),
      amountCents: 0,
      holdExpiresUtc: now.plus({ minutes: 5 }).toISO()!,
    },
    now.toISO()!,
    AGENDA.bufferMinutes,
  );
  if (!booking) throw taken;

  // Solo un canje por código, aunque lleguen dos a la vez.
  const claimed = await exec(`UPDATE gifts SET status = 'redeemed', booking_id = ? WHERE id = ? AND status = 'paid'`, [
    booking.id,
    gift.id,
  ]);
  if (!claimed) {
    await transitionStatus(booking.id, ['pending'], 'cancelled');
    throw new BookingError('Este código ya se ha usado.');
  }
  await transitionStatus(booking.id, ['pending'], 'confirmed');
  try {
    await finalizeBooking(booking.id);
  } catch (e) {
    // La cita ya está confirmada; solo ha fallado el email.
    console.error('Canje confirmado pero sin email', e);
  }
  return { bookingId: booking.id };
}
