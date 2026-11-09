import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DateTime } from 'luxon';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import type Stripe from 'stripe';
import { resetDbForTests, getBooking, busyBetween } from '@/lib/db';
import { setStripeForTests } from '@/lib/stripe';
import { setMailerForTests, type Mail } from '@/lib/mail';
import { startCheckout, handleStripeEvent, BookingError, setInvoiceWaitForTests } from '@/lib/booking';

const now = DateTime.fromISO('2026-11-09T06:00:00Z') as DateTime<true>;
const slot = '2026-11-10T16:00:00Z'; // martes 17:00 Madrid

let sent: Mail[];
let createdSessions: Stripe.Checkout.SessionCreateParams[];
let sessionStore: Record<string, Partial<Stripe.Checkout.Session>>;

function fakeStripe() {
  return {
    customers: { create: vi.fn(async () => ({ id: 'cus_1' })) },
    checkout: {
      sessions: {
        create: vi.fn(async (p: Stripe.Checkout.SessionCreateParams) => {
          createdSessions.push(p);
          const id = `cs_${createdSessions.length}`;
          sessionStore[id] = { id, metadata: p.metadata as Record<string, string>, payment_status: 'unpaid' };
          return { id, url: `https://checkout.stripe.test/${id}` };
        }),
        retrieve: vi.fn(async (id: string) => ({
          ...sessionStore[id],
          invoice: { id: 'in_1', invoice_pdf: null, hosted_invoice_url: 'https://invoice.stripe.test/in_1' },
        })),
      },
    },
    invoices: { retrieve: vi.fn() },
    paymentIntents: {
      retrieve: vi.fn(async () => ({
        next_action: {
          display_bank_transfer_instructions: { hosted_instructions_url: 'https://pay.stripe.test/instr' },
        },
      })),
    },
  } as unknown as Stripe;
}

const input = {
  serviceId: 'pro-informativa',
  quantity: 2,
  startUtc: slot,
  name: 'Ana López',
  email: 'ana@example.com',
  consent: true as const,
};

function event(type: string, sessionId: string, extra: Partial<Stripe.Checkout.Session> = {}): Stripe.Event {
  sessionStore[sessionId] = { ...sessionStore[sessionId], ...extra };
  return { type, data: { object: { ...sessionStore[sessionId] } } } as unknown as Stripe.Event;
}

beforeEach(() => {
  setInvoiceWaitForTests(0);
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'phisio-')), 'test.db');
  resetDbForTests(`file:${file}`);
  sent = [];
  createdSessions = [];
  sessionStore = {};
  setStripeForTests(fakeStripe());
  setMailerForTests(async (m) => {
    sent.push(m);
  });
  delete process.env.ZOOM_ACCOUNT_ID;
});

describe('reserva y pago', () => {
  it('crea la sesión de Stripe con tarjeta, transferencia en EUR y factura', async () => {
    const { url, bookingId } = await startCheckout(input, now);
    expect(url).toContain('checkout.stripe.test');
    const p = createdSessions[0];
    expect(p.currency).toBe('eur');
    expect(p.payment_method_types).toEqual(['card', 'customer_balance']);
    expect(p.invoice_creation?.enabled).toBe(true);
    expect(p.line_items?.[0]).toMatchObject({ quantity: 2, price_data: { unit_amount: 10000 } });
    const b = await getBooking(bookingId);
    expect(b?.status).toBe('pending');
    expect(b?.amountCents).toBe(20000);
  });

  it('impide reservar dos veces la misma hora', async () => {
    await startCheckout(input, now);
    await expect(startCheckout({ ...input, email: 'otro@example.com' }, now)).rejects.toBeInstanceOf(BookingError);
  });

  it('pago con tarjeta: confirma y envía factura al cliente y copia a Phisiolutions, una sola vez', async () => {
    const { bookingId } = await startCheckout(input, now);
    const ev = event('checkout.session.completed', 'cs_1', { payment_status: 'paid' });
    await handleStripeEvent(ev);
    await handleStripeEvent(ev); // Stripe puede reenviar el evento
    const b = await getBooking(bookingId);
    expect(b?.status).toBe('confirmed');
    expect(b?.invoiceUrl).toBe('https://invoice.stripe.test/in_1');
    expect(sent.map((m) => m.to)).toEqual(['ana@example.com', 'phisiolutions@gmail.com']);
    expect(sent[0].html).toContain('https://invoice.stripe.test/in_1');
    expect(sent[0].html).toContain('2 sesiones');
    // Sin Zoom configurado, la cita lleva una sala de Jitsi Meet única, en el email del cliente y en la copia.
    expect(b?.zoomJoinUrl).toMatch(/^https:\/\/meet\.jit\.si\/Phisiolutions-[0-9a-f]{24}$/);
    expect(sent[0].html).toContain(b!.zoomJoinUrl!);
    expect(sent[1].html).toContain(b!.zoomJoinUrl!);
  });

  it('transferencia: guarda el hueco, envía instrucciones y confirma al recibir el pago', async () => {
    const { bookingId } = await startCheckout(input, now);
    await handleStripeEvent(
      event('checkout.session.completed', 'cs_1', { payment_status: 'unpaid', payment_intent: 'pi_1' }),
    );
    let b = await getBooking(bookingId);
    expect(b?.status).toBe('awaiting_transfer');
    expect(sent).toHaveLength(1);
    expect(sent[0].html).toContain('https://pay.stripe.test/instr');
    const busy = await busyBetween('2026-11-10T00:00:00Z', '2026-11-11T00:00:00Z', DateTime.utc().toISO()!);
    expect(busy).toHaveLength(1);

    await handleStripeEvent(event('checkout.session.async_payment_succeeded', 'cs_1', { payment_status: 'paid' }));
    b = await getBooking(bookingId);
    expect(b?.status).toBe('confirmed');
    expect(sent.map((m) => m.to)).toEqual(['ana@example.com', 'ana@example.com', 'phisiolutions@gmail.com']);
  });

  it('si el pago caduca, libera la hora', async () => {
    const { bookingId } = await startCheckout(input, now);
    await handleStripeEvent(event('checkout.session.expired', 'cs_1'));
    expect((await getBooking(bookingId))?.status).toBe('cancelled');
    await expect(startCheckout({ ...input, email: 'otro@example.com' }, now)).resolves.toBeTruthy();
  });

  it('no deja reservar directamente la tarjeta regalo ni servicios de pacientes (ocultos)', async () => {
    await expect(startCheckout({ ...input, serviceId: 'pro-regalo' }, now)).rejects.toBeInstanceOf(BookingError);
    await expect(startCheckout({ ...input, serviceId: 'pac-fisio-60' }, now)).rejects.toBeInstanceOf(BookingError);
  });

  it('rechaza datos incompletos o sin consentimiento', async () => {
    await expect(startCheckout({ ...input, consent: false }, now)).rejects.toBeInstanceOf(BookingError);
    await expect(startCheckout({ ...input, email: 'no-es-email' }, now)).rejects.toBeInstanceOf(BookingError);
  });
});

describe('errores de Stripe', () => {
  it('si Stripe falla, la hora queda libre', async () => {
    const s = fakeStripe();
    (s.checkout.sessions.create as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('boom'));
    setStripeForTests(s);
    await expect(startCheckout(input, now)).rejects.toThrow('boom');
    setStripeForTests(fakeStripe());
    await expect(startCheckout(input, now)).resolves.toBeTruthy();
  });

  it('si la transferencia no está disponible, reintenta solo con tarjeta', async () => {
    const s = fakeStripe();
    const create = s.checkout.sessions.create as unknown as ReturnType<typeof vi.fn>;
    const ok = create.getMockImplementation()!;
    create.mockImplementationOnce(async () => {
      throw new Error('customer_balance not available');
    });
    create.mockImplementation(ok);
    setStripeForTests(s);
    const { url } = await startCheckout(input, now);
    expect(url).toContain('checkout.stripe.test');
    expect(createdSessions.at(-1)?.payment_method_types).toEqual(['card']);
  });
});
