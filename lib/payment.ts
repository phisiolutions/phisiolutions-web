// Pago libre: el cliente indica importe y concepto, sin reserva asociada. Genera factura y emails igual que una reserva.
import type Stripe from 'stripe';
import { DateTime } from 'luxon';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  BookingError,
  createCheckoutSession,
  invoiceAttachment,
  layout,
  paymentMethodParams,
  sessionInvoice,
  siteUrl,
  transferInstructionsUrl,
} from './booking';
import { db, ensureSchema } from './db';
import { adminEmail, escapeHtml, sendMail } from './mail';
import { formatEuros } from './services';
import { getStripe } from './stripe';

export const MIN_PAYMENT_CENTS = 100; // 1 €
export const MAX_PAYMENT_CENTS = 1_000_000; // 10.000 €

export type PaymentStatus = 'pending' | 'awaiting_transfer' | 'paid' | 'cancelled';

export interface Payment {
  id: string;
  concept: string;
  name: string;
  email: string;
  amountCents: number;
  status: PaymentStatus;
  stripeSessionId: string | null;
  invoicePdfUrl: string | null;
  invoiceUrl: string | null;
  emailSent: number;
  createdAt: string;
}

function rowToPayment(r: Record<string, unknown>): Payment {
  const str = (v: unknown) => (v === null || v === undefined ? null : String(v));
  return {
    id: String(r.id),
    concept: String(r.concept),
    name: String(r.name),
    email: String(r.email),
    amountCents: Number(r.amount_cents),
    status: r.status as PaymentStatus,
    stripeSessionId: str(r.stripe_session_id),
    invoicePdfUrl: str(r.invoice_pdf_url),
    invoiceUrl: str(r.invoice_url),
    emailSent: Number(r.email_sent),
    createdAt: String(r.created_at),
  };
}

async function exec(sql: string, args: (string | number | null)[]) {
  await ensureSchema();
  return db().execute({ sql, args });
}

export async function getPayment(id: string): Promise<Payment | null> {
  const r = await exec(`SELECT * FROM payments WHERE id = ?`, [id]);
  return r.rows[0] ? rowToPayment(r.rows[0] as Record<string, unknown>) : null;
}

export async function getPaymentBySession(sid: string): Promise<Payment | null> {
  const r = await exec(`SELECT * FROM payments WHERE stripe_session_id = ?`, [sid]);
  return r.rows[0] ? rowToPayment(r.rows[0] as Record<string, unknown>) : null;
}

export const PaymentInput = z.object({
  amountCents: z.number().int().min(MIN_PAYMENT_CENTS).max(MAX_PAYMENT_CENTS),
  concept: z.string().trim().min(3).max(200),
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(200),
  consent: z.literal(true),
});

export async function startPaymentCheckout(raw: unknown, now = DateTime.utc()): Promise<{ url: string; paymentId: string }> {
  const parsed = PaymentInput.safeParse(raw);
  if (!parsed.success) {
    const amount = (raw as { amountCents?: unknown })?.amountCents;
    if (typeof amount === 'number' && (amount < MIN_PAYMENT_CENTS || amount > MAX_PAYMENT_CENTS)) {
      throw new BookingError(
        `El importe debe estar entre ${formatEuros(MIN_PAYMENT_CENTS)} y ${formatEuros(MAX_PAYMENT_CENTS)}.`,
      );
    }
    throw new BookingError('Revisa los datos del formulario.');
  }
  const input = parsed.data;
  const id = randomUUID();
  await exec(
    `INSERT INTO payments (id, concept, name, email, amount_cents, status, created_at) VALUES (?, ?, ?, ?, ?, 'pending', ?)`,
    [id, input.concept, input.name, input.email, input.amountCents, now.toISO()!],
  );
  try {
    const customer = await getStripe().customers.create({
      name: input.name,
      email: input.email,
      preferred_locales: ['es'],
      metadata: { payment_id: id },
    });
    const session = await createCheckoutSession({
      ...paymentMethodParams(),
      mode: 'payment',
      customer: customer.id,
      locale: 'es',
      currency: 'eur',
      client_reference_id: id,
      line_items: [
        {
          quantity: 1,
          price_data: { currency: 'eur', unit_amount: input.amountCents, product_data: { name: input.concept } },
        },
      ],
      invoice_creation: {
        enabled: true,
        invoice_data: {
          description: input.concept,
          footer: process.env.INVOICE_FOOTER ?? 'Phisiolutions LLC',
          metadata: { payment_id: id },
        },
      },
      metadata: { payment_id: id },
      payment_intent_data: { metadata: { payment_id: id } },
      success_url: `${siteUrl()}/pagar/confirmado?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteUrl()}/pagar?cancelado=1`,
    });
    await exec(`UPDATE payments SET stripe_session_id = ? WHERE id = ?`, [session.id, id]);
    return { url: session.url!, paymentId: id };
  } catch (e) {
    await exec(`UPDATE payments SET status = 'cancelled' WHERE id = ? AND status = 'pending'`, [id]);
    throw e;
  }
}

export async function handlePaymentEvent(type: string, session: Stripe.Checkout.Session): Promise<void> {
  const id = session.metadata?.payment_id;
  if (!id) return;
  switch (type) {
    case 'checkout.session.completed':
      if (session.payment_status === 'paid') return confirmPayment(id, session.id);
      if ((await exec(`UPDATE payments SET status = 'awaiting_transfer' WHERE id = ? AND status = 'pending'`, [id])).rowsAffected) {
        await sendTransferEmail(id, session);
      }
      return;
    case 'checkout.session.async_payment_succeeded':
      return confirmPayment(id, session.id);
    case 'checkout.session.async_payment_failed':
    case 'checkout.session.expired':
      await exec(`UPDATE payments SET status = 'cancelled' WHERE id = ? AND status IN ('pending','awaiting_transfer')`, [id]);
      return;
  }
}

/** Marca el pago como cobrado y envía la factura al cliente y a Phisiolutions. Idempotente. */
export async function confirmPayment(id: string, sessionId: string): Promise<void> {
  await exec(`UPDATE payments SET status = 'paid' WHERE id = ? AND status IN ('pending','awaiting_transfer','cancelled')`, [id]);
  let p = await getPayment(id);
  if (!p || p.emailSent) return;
  if (!p.invoiceUrl) {
    const invoice = await sessionInvoice(sessionId);
    if (invoice) {
      await exec(`UPDATE payments SET invoice_pdf_url = ?, invoice_url = ? WHERE id = ?`, [
        invoice.invoice_pdf ?? null,
        invoice.hosted_invoice_url ?? null,
        id,
      ]);
      p = (await getPayment(id))!;
    }
  }
  const attachments = await invoiceAttachment(p.invoicePdfUrl);
  const invoiceLink = p.invoiceUrl
    ? `<p>Puedes ver y descargar tu factura aquí: <a href="${escapeHtml(p.invoiceUrl)}">factura</a>. También va adjunta en PDF.</p>`
    : '';
  await sendMail({
    to: p.email,
    subject: `Pago recibido: ${p.concept}`,
    html: layout(`<p>Hola ${escapeHtml(p.name)},</p>
      <p>Hemos recibido tu pago. Gracias.</p>
      <p>Concepto: <strong>${escapeHtml(p.concept)}</strong><br>Importe: ${formatEuros(p.amountCents)}</p>${invoiceLink}`),
    attachments,
  });
  await sendMail({
    to: adminEmail(),
    subject: `Pago recibido: ${p.name}, ${formatEuros(p.amountCents)} (${p.concept})`,
    html: layout(`<p>Nuevo pago libre (copia de la factura adjunta).</p>
      <p>Cliente: ${escapeHtml(p.name)} &lt;${escapeHtml(p.email)}&gt;<br>Concepto: ${escapeHtml(p.concept)}<br>
      Importe: ${formatEuros(p.amountCents)}</p>`),
    attachments,
  });
  await exec(`UPDATE payments SET email_sent = 1 WHERE id = ?`, [id]);
}

async function sendTransferEmail(id: string, session: Stripe.Checkout.Session) {
  const p = await getPayment(id);
  if (!p) return;
  const url = await transferInstructionsUrl(session);
  await sendMail({
    to: p.email,
    subject: `Pago pendiente de transferencia: ${p.concept}`,
    html: layout(`<p>Hola ${escapeHtml(p.name)},</p>
      <p>Hemos registrado tu pago de ${formatEuros(p.amountCents)} (${escapeHtml(p.concept)}). En cuanto llegue tu
      transferencia te enviaremos la factura.</p>
      ${url ? `<p><a href="${escapeHtml(url)}">Ver los datos bancarios para la transferencia</a></p>` : ''}`),
  });
}
