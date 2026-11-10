import type Stripe from 'stripe';
import { DateTime } from 'luxon';
import { z } from 'zod';
import { AGENDA, formatLocal, isSlotAvailable } from './availability';
import {
  busyBetween,
  createPendingBooking,
  getBooking,
  getBookingBySession,
  transitionStatus,
  updateBooking,
  type Booking,
} from './db';
import { adminEmail, escapeHtml, sendMail } from './mail';
import { formatEuros, getService, isBookable, MAX_QUANTITY, type Service } from './services';
import { bankTransferEnabled, getStripe } from './stripe';
import { createZoomMeeting, jitsiMeetingUrl, zoomConfigured } from './zoom';
import { COMPANY } from './company';
import { handleGiftEvent } from './gift';
import { handlePaymentEvent } from './payment';

export const CHECKOUT_HOLD_MINUTES = 31; // Stripe exige al menos 30 min de validez.
export const TRANSFER_HOLD_DAYS = 3; // Tiempo que guardamos el hueco esperando la transferencia.

export const BookingInput = z.object({
  serviceId: z.string(),
  quantity: z.number().int().min(1).max(MAX_QUANTITY),
  startUtc: z.string(),
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(200),
  phone: z.string().trim().max(40).optional(),
  notes: z.string().trim().max(1000).optional(),
  consent: z.literal(true),
});
export type BookingInput = z.infer<typeof BookingInput>;

export class BookingError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

export function siteUrl(): string {
  return (process.env.SITE_URL ?? 'http://localhost:3000').replace(/\/$/, '');
}

/** Reserva el hueco y crea la sesión de pago de Stripe. Devuelve la URL de pago. */
export async function startCheckout(raw: unknown, now = DateTime.utc()): Promise<{ url: string; bookingId: string }> {
  const parsed = BookingInput.safeParse(raw);
  if (!parsed.success) throw new BookingError('Revisa los datos del formulario.');
  const input = parsed.data;
  const service = getService(input.serviceId);
  if (!service || !isBookable(service)) throw new BookingError('Servicio no válido.');

  const start = DateTime.fromISO(input.startUtc, { zone: 'utc' });
  if (!start.isValid) throw new BookingError('Hora no válida.');
  const startUtc = start.toISO({ suppressMilliseconds: true })!;
  const endUtc = start.plus({ minutes: service.durationMinutes }).toISO({ suppressMilliseconds: true })!;
  const nowIso = now.toISO()!;

  const busy = await busyBetween(start.minus({ days: 1 }).toISO()!, start.plus({ days: 1 }).toISO()!, nowIso);
  if (!isSlotAvailable(startUtc, service.durationMinutes, busy, now)) {
    throw new BookingError('Esa hora ya no está disponible. Elige otra, por favor.', 409);
  }

  const booking = await createPendingBooking(
    {
      serviceId: service.id,
      quantity: input.quantity,
      startUtc,
      endUtc,
      name: input.name,
      email: input.email,
      phone: input.phone || null,
      notes: input.notes || null,
      amountCents: service.priceCents * input.quantity,
      holdExpiresUtc: now.plus({ minutes: CHECKOUT_HOLD_MINUTES + 5 }).toISO()!,
    },
    nowIso,
    AGENDA.bufferMinutes,
  );
  if (!booking) throw new BookingError('Esa hora ya no está disponible. Elige otra, por favor.', 409);

  try {
    return await createStripeSession(booking, input, service, startUtc, now);
  } catch (e) {
    // Si Stripe falla, liberamos la hora para que no quede bloqueada.
    await transitionStatus(booking.id, ['pending'], 'cancelled');
    throw e;
  }
}

async function createStripeSession(
  booking: Booking,
  input: BookingInput,
  service: Service & { priceCents: number },
  startUtc: string,
  now: DateTime,
): Promise<{ url: string; bookingId: string }> {
  const stripe = getStripe();
  const customer = await stripe.customers.create({
    name: input.name,
    email: input.email,
    phone: input.phone || undefined,
    preferred_locales: ['es'],
    metadata: { booking_id: booking.id },
  });

  const when = formatLocal(startUtc);
  const params: Stripe.Checkout.SessionCreateParams = {
    ...paymentMethodParams(),
    ...invoiceDataParams(),
    mode: 'payment',
    customer: customer.id,
    locale: 'es',
    currency: 'eur',
    client_reference_id: booking.id,
    line_items: [
      {
        quantity: input.quantity,
        price_data: {
          currency: 'eur',
          unit_amount: service.priceCents,
          product_data: {
            name: service.name,
            description: `Sesión online por videollamada. Primera sesión: ${when} (hora de Madrid).`,
          },
        },
      },
    ],
    invoice_creation: {
      enabled: true,
      invoice_data: {
        description: `${service.name} × ${input.quantity}. Primera sesión: ${when}.`,
        ...invoiceFields(),
        metadata: { booking_id: booking.id },
      },
    },
    metadata: { booking_id: booking.id },
    payment_intent_data: { metadata: { booking_id: booking.id } },
    expires_at: Math.floor(now.plus({ minutes: CHECKOUT_HOLD_MINUTES }).toSeconds()),
    success_url: `${siteUrl()}/reserva/confirmada?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${siteUrl()}/reservar?cancelada=1`,
  };

  const session = await createCheckoutSession(params);
  await updateBooking(booking.id, { stripeSessionId: session.id });
  return { url: session.url!, bookingId: booking.id };
}

/**
 * Datos fiscales en la factura: el EIN de la LLC y, del cliente, solo si quiere (casilla "Compro como empresa"),
 * su razón social y NIF/CIF. El pago rápido no obliga a rellenar la dirección.
 */
export function invoiceDataParams() {
  return {
    billing_address_collection: 'auto' as const,
    tax_id_collection: { enabled: true },
    customer_update: { name: 'auto' as const, address: 'auto' as const },
  };
}

export function invoiceFields() {
  return {
    footer: process.env.INVOICE_FOOTER ?? `${COMPANY.name} · EIN ${COMPANY.ein}`,
    custom_fields: [{ name: 'EIN', value: COMPANY.ein }],
  };
}

/** Tarjeta y, si está activada, transferencia bancaria en EUR. */
export function paymentMethodParams(): Pick<
  Stripe.Checkout.SessionCreateParams,
  'payment_method_types' | 'payment_method_options'
> {
  const transfer = bankTransferEnabled();
  return {
    payment_method_types: transfer ? ['card', 'customer_balance'] : ['card'],
    payment_method_options: transfer
      ? {
          customer_balance: {
            funding_type: 'bank_transfer',
            bank_transfer: {
              type: 'eu_bank_transfer',
              eu_bank_transfer: { country: process.env.STRIPE_EU_BANK_COUNTRY ?? 'IE' },
            },
          },
        }
      : undefined,
  };
}

/** Crea la sesión de pago; si la transferencia no está disponible en la cuenta, sigue solo con tarjeta. */
export async function createCheckoutSession(params: Stripe.Checkout.SessionCreateParams) {
  const stripe = getStripe();
  try {
    return await stripe.checkout.sessions.create(params);
  } catch (e) {
    if (!params.payment_method_types?.includes('customer_balance')) throw e;
    console.error('Stripe rechazó la transferencia; reintento solo con tarjeta:', (e as Error).message);
    return stripe.checkout.sessions.create({
      ...params,
      payment_method_types: ['card'],
      payment_method_options: undefined,
    });
  }
}

/** Factura de una sesión de pago (si Stripe la ha generado). */
export async function sessionInvoice(sessionId: string, waitMs = INVOICE_WAIT_MS): Promise<Stripe.Invoice | null> {
  const stripe = getStripe();
  const session = await stripe.checkout.sessions.retrieve(sessionId, { expand: ['invoice'] });
  let invoice = session.invoice as Stripe.Invoice | string | null;
  if (typeof invoice === 'string') invoice = await stripe.invoices.retrieve(invoice);
  // Stripe crea la factura y la marca como pagada unos segundos después del pago. Si enviamos el PDF antes,
  // sale como "Importe adeudado". Esperamos un poco a que figure como pagada.
  const deadline = Date.now() + waitMs;
  while (
    invoice &&
    invoice.id &&
    invoice.status !== 'paid' &&
    session.payment_status === 'paid' &&
    Date.now() < deadline
  ) {
    await new Promise((r) => setTimeout(r, 1500));
    invoice = await stripe.invoices.retrieve(invoice.id);
  }
  return invoice;
}

/** URL del PDF solo si la factura ya figura como pagada; si no, el PDF diría "Importe adeudado". */
export function paidPdf(invoice: Stripe.Invoice): string | null {
  return invoice.status === 'paid' ? (invoice.invoice_pdf ?? null) : null;
}

/** Tiempo máximo de espera a que la factura figure como pagada (los tests lo ponen a 0). */
export let INVOICE_WAIT_MS = 4500; // corto: las funciones de Netlify cortan a los 10 s
export function setInvoiceWaitForTests(ms: number) {
  INVOICE_WAIT_MS = ms;
}

/** Instrucciones de transferencia de una sesión pendiente. */
export async function transferInstructionsUrl(session: Stripe.Checkout.Session): Promise<string | null> {
  try {
    if (typeof session.payment_intent === 'string') {
      const pi = await getStripe().paymentIntents.retrieve(session.payment_intent);
      return pi.next_action?.display_bank_transfer_instructions?.hosted_instructions_url ?? null;
    }
  } catch (e) {
    console.error('No se pudieron leer las instrucciones de transferencia', e);
  }
  return null;
}

async function bookingFromSession(session: Stripe.Checkout.Session): Promise<Booking | null> {
  const id = session.metadata?.booking_id ?? session.client_reference_id;
  if (id) return getBooking(id);
  return getBookingBySession(session.id);
}

/** Procesa los eventos del webhook de Stripe. Es seguro recibir el mismo evento varias veces. */
export async function handleStripeEvent(event: Stripe.Event): Promise<void> {
  if (event.type.startsWith('checkout.session.')) {
    const session = event.data.object as Stripe.Checkout.Session;
    if (session.metadata?.gift_id) return handleGiftEvent(event.type, session);
    if (session.metadata?.payment_id) return handlePaymentEvent(event.type, session);
  }
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      const booking = await bookingFromSession(session);
      if (!booking) return;
      if (session.payment_status === 'paid') {
        await confirmBooking(booking.id, session.id);
      } else {
        // Transferencia: el pago llega más tarde. Guardamos el hueco unos días.
        const moved = await transitionStatus(booking.id, ['pending'], 'awaiting_transfer');
        if (moved) {
          await updateBooking(booking.id, {
            holdExpiresUtc: DateTime.utc().plus({ days: TRANSFER_HOLD_DAYS }).toISO()!,
          });
          await sendTransferPendingEmail(booking.id, session);
        }
      }
      return;
    }
    case 'checkout.session.async_payment_succeeded': {
      const session = event.data.object as Stripe.Checkout.Session;
      const booking = await bookingFromSession(session);
      if (booking) await confirmBooking(booking.id, session.id);
      return;
    }
    case 'checkout.session.async_payment_failed':
    case 'checkout.session.expired': {
      const session = event.data.object as Stripe.Checkout.Session;
      const booking = await bookingFromSession(session);
      if (booking) await transitionStatus(booking.id, ['pending', 'awaiting_transfer'], 'cancelled');
      return;
    }
    default:
      return;
  }
}

/** Marca la reserva como pagada, crea la videollamada y envía la factura al cliente y a Phisiolutions. */
export async function confirmBooking(bookingId: string, sessionId: string): Promise<void> {
  // Una reserva cancelada por tiempo también se confirma si el pago llega: el dinero ya está cobrado.
  const before = await getBooking(bookingId);
  const lateAfterCancel = before?.status === 'cancelled';
  const moved = await transitionStatus(bookingId, ['pending', 'awaiting_transfer', 'cancelled'], 'confirmed');
  const booking = await getBooking(bookingId);
  if (!booking) return;
  if (!moved && booking.confirmationSent) return;

  const invoice = await sessionInvoice(sessionId);
  const patch: Partial<Booking> = { holdExpiresUtc: null };
  if (invoice) {
    patch.stripeInvoiceId = invoice.id ?? null;
    patch.invoicePdfUrl = paidPdf(invoice);
    patch.invoiceUrl = invoice.hosted_invoice_url ?? null;
  }
  await finalizeBooking(bookingId, patch, lateAfterCancel);
}

/** Crea la videollamada (Zoom si está configurado; si no, Jitsi Meet) y envía los emails de confirmación una sola vez. */
export async function finalizeBooking(bookingId: string, patch: Partial<Booking> = {}, checkOverlap = false) {
  const booking = (await getBooking(bookingId))!;
  const service = getService(booking.serviceId);
  if (!booking.zoomJoinUrl && zoomConfigured()) {
    try {
      const meeting = await createZoomMeeting({
        topic: `Phisiolutions: ${service?.name ?? 'Sesión'} (${booking.name})`,
        startUtc: booking.startUtc,
        durationMinutes: service?.durationMinutes ?? 60,
      });
      patch.zoomJoinUrl = meeting.joinUrl;
      patch.zoomMeetingId = meeting.id;
    } catch (e) {
      console.error('No se pudo crear la reunión de Zoom', e);
    }
  }
  // Sin Zoom (o si falla), sala de Jitsi Meet gratuita con un enlace único e imposible de adivinar.
  if (!booking.zoomJoinUrl && !patch.zoomJoinUrl) patch.zoomJoinUrl = jitsiMeetingUrl();
  await updateBooking(bookingId, { holdExpiresUtc: null, ...patch });

  const fresh = (await getBooking(bookingId))!;
  if (fresh.confirmationSent) return;
  try {
    await sendConfirmationEmails(fresh, checkOverlap);
    await updateBooking(bookingId, { confirmationSent: 1 });
  } catch (e) {
    // La reserva sigue confirmada; el email se reintentará cuando Stripe reenvíe el evento.
    console.error('No se pudieron enviar los emails de confirmación', e);
    throw e;
  }
}

export async function invoiceAttachment(pdfUrl: string | null) {
  if (!pdfUrl) return [];
  try {
    const res = await fetch(pdfUrl);
    if (!res.ok) return [];
    return [
      {
        filename: 'factura-phisiolutions.pdf',
        content: Buffer.from(await res.arrayBuffer()),
        contentType: 'application/pdf',
      },
    ];
  } catch {
    return [];
  }
}

export function layout(body: string): string {
  return `<div style="font-family:Arial,sans-serif;color:#0F2A3A;max-width:560px;margin:0 auto;line-height:1.5">
    <p style="font-size:22px;font-weight:bold;color:#0B6E8A;margin:0 0 16px">Phisiolutions</p>${body}
    <p style="font-size:13px;color:#33505F;margin-top:32px">Phisiolutions LLC</p></div>`;
}

export async function sendConfirmationEmails(b: Booking, checkOverlap = false): Promise<void> {
  const service = getService(b.serviceId);
  const when = formatLocal(b.startUtc);
  const attachments = await invoiceAttachment(b.invoicePdfUrl);
  const name = escapeHtml(b.name);
  const serviceName = escapeHtml(service?.name ?? b.serviceId);
  const zoom = b.zoomJoinUrl
    ? `<p><a href="${escapeHtml(b.zoomJoinUrl)}" style="background:#FFA514;color:#0F2A3A;padding:12px 20px;border-radius:999px;text-decoration:none;font-weight:bold">Entrar en la videollamada</a></p><p style="font-size:13px;color:#33505F">Se abre en el navegador, sin instalar nada. Desde el móvil puede pedirte instalar la app gratuita Jitsi Meet.</p>`
    : `<p>Te enviaremos el enlace de la videollamada antes de la sesión.</p>`;
  const invoiceLink = b.invoiceUrl
    ? `<p>Puedes ver y descargar tu factura aquí: <a href="${escapeHtml(b.invoiceUrl)}">factura</a>.${b.invoicePdfUrl ? ' También va adjunta en PDF.' : ''}</p>`
    : '';
  const isGift = b.amountCents === 0;
  const paidLine = isGift ? 'Pagado con tarjeta regalo' : `Total pagado: ${formatEuros(b.amountCents)}`;
  const more =
    b.quantity > 1
      ? `<p>Has contratado ${b.quantity} sesiones. Responde a este email para agendar las siguientes.</p>`
      : '';

  await sendMail({
    to: b.email,
    subject: `Reserva confirmada: ${service?.name ?? 'sesión'} el ${when}`,
    html: layout(`<p>Hola ${name},</p>
      <p>Tu reserva está confirmada${isGift ? '' : ' y pagada'}.</p>
      <p><strong>${serviceName}</strong> × ${b.quantity}<br>Primera sesión: ${escapeHtml(when)} (hora de Madrid)<br>
      ${paidLine}</p>${zoom}${more}${invoiceLink}
      <p>Si necesitas cambiar la cita, responde a este email.</p>`),
    attachments,
  });

  await sendMail({
    to: adminEmail(),
    subject: `${checkOverlap ? 'REVISAR posible solape. ' : ''}${isGift ? 'Nueva reserva con tarjeta regalo' : 'Nueva reserva pagada'}: ${b.name}, ${service?.name ?? b.serviceId}, ${when}`,
    html: layout(`${checkOverlap ? '<p><strong>El pago llegó después de que la hora se liberara. Comprueba que nadie más la haya reservado.</strong></p>' : ''}<p>${isGift ? 'Nueva reserva canjeando una tarjeta regalo (la factura se emitió al comprarla).' : 'Nueva reserva pagada (copia de la factura adjunta).'}</p>
      <p>Cliente: ${name} &lt;${escapeHtml(b.email)}&gt;${b.phone ? `, tel. ${escapeHtml(b.phone)}` : ''}<br>
      Servicio: ${serviceName} × ${b.quantity}<br>Primera sesión: ${escapeHtml(when)}<br>
      ${isGift ? 'Pago: tarjeta regalo' : `Total: ${formatEuros(b.amountCents)}`}<br>Videollamada: ${b.zoomJoinUrl ? escapeHtml(b.zoomJoinUrl) : 'sin crear'}</p>
      ${b.notes ? `<p>Notas del cliente: ${escapeHtml(b.notes)}</p>` : ''}
      ${b.invoiceUrl ? `<p><a href="${escapeHtml(b.invoiceUrl)}">Ver factura</a></p>` : ''}`),
    attachments,
  });
}

async function sendTransferPendingEmail(bookingId: string, session: Stripe.Checkout.Session) {
  const b = await getBooking(bookingId);
  if (!b) return;
  const instructionsUrl = await transferInstructionsUrl(session);
  const service = getService(b.serviceId);
  const when = formatLocal(b.startUtc);
  await sendMail({
    to: b.email,
    subject: `Reserva pendiente de transferencia: ${service?.name ?? 'sesión'}`,
    html: layout(`<p>Hola ${escapeHtml(b.name)},</p>
      <p>Hemos guardado tu cita del ${escapeHtml(when)} durante ${TRANSFER_HOLD_DAYS} días mientras llega tu transferencia
      de ${formatEuros(b.amountCents)}.</p>
      ${instructionsUrl ? `<p><a href="${escapeHtml(instructionsUrl)}">Ver los datos bancarios para la transferencia</a></p>` : ''}
      <p>En cuanto la recibamos te enviaremos la confirmación, el enlace de la videollamada y la factura.</p>`),
  });
}
