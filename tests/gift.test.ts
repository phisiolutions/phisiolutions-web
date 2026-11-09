import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DateTime } from 'luxon';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import type Stripe from 'stripe';
import { resetDbForTests, getBooking } from '@/lib/db';
import { setStripeForTests } from '@/lib/stripe';
import { setMailerForTests, type Mail } from '@/lib/mail';
import { handleStripeEvent, BookingError, setInvoiceWaitForTests } from '@/lib/booking';
import { startGiftCheckout, redeemGift, getGift, checkCode } from '@/lib/gift';

const now = DateTime.fromISO('2026-11-09T06:00:00Z') as DateTime<true>;
const slot = '2026-11-10T16:00:00Z';

let sent: Mail[];
let sessions: Record<string, Partial<Stripe.Checkout.Session>>;

function fakeStripe() {
  let n = 0;
  return {
    customers: { create: vi.fn(async () => ({ id: 'cus_1' })) },
    checkout: {
      sessions: {
        create: vi.fn(async (p: Stripe.Checkout.SessionCreateParams) => {
          const id = `cs_${++n}`;
          sessions[id] = { id, metadata: p.metadata as Record<string, string>, payment_status: 'unpaid' };
          return { id, url: `https://checkout.stripe.test/${id}` };
        }),
        retrieve: vi.fn(async (id: string) => ({
          ...sessions[id],
          invoice: { id: 'in_1', invoice_pdf: null, hosted_invoice_url: 'https://invoice.stripe.test/in_1' },
        })),
      },
    },
    invoices: { retrieve: vi.fn() },
    paymentIntents: { retrieve: vi.fn(async () => ({ next_action: null })) },
  } as unknown as Stripe;
}

function event(type: string, id: string, extra: Partial<Stripe.Checkout.Session> = {}): Stripe.Event {
  sessions[id] = { ...sessions[id], ...extra };
  return { type, data: { object: { ...sessions[id] } } } as unknown as Stripe.Event;
}

const buyer = {
  buyerName: 'Luis Pérez',
  buyerEmail: 'luis@example.com',
  recipientName: 'Marta Gil',
  amountCents: 13000,
  serviceIds: ['pro-formacion', 'pro-marketing'],
  consent: true as const,
};
const redeem = { startUtc: slot, name: 'Marta Gil', email: 'marta@example.com', consent: true as const };

beforeEach(() => {
  setInvoiceWaitForTests(0);
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'phisio-')), 'test.db');
  resetDbForTests(`file:${file}`);
  sent = [];
  sessions = {};
  setStripeForTests(fakeStripe());
  setMailerForTests(async (m) => {
    sent.push(m);
  });
});

async function paidGift() {
  const { giftId } = await startGiftCheckout(buyer, now);
  await handleStripeEvent(event('checkout.session.completed', 'cs_1', { payment_status: 'paid' }));
  return (await getGift(giftId))!;
}

describe('tarjeta regalo', () => {
  it('rechaza importes fuera de rango', async () => {
    await expect(startGiftCheckout({ ...buyer, amountCents: 1000 }, now)).rejects.toBeInstanceOf(BookingError);
  });

  it('al pagar envía la tarjeta con el código al comprador y copia a Phisiolutions, una vez', async () => {
    const gift = await paidGift();
    expect(gift.status).toBe('paid');
    expect(gift.code).toMatch(/^PHI-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    await handleStripeEvent(event('checkout.session.completed', 'cs_1'));
    expect(sent.map((m) => m.to)).toEqual(['luis@example.com', 'phisiolutions@gmail.com']);
    expect(sent[0].html).toContain(gift.code);
    expect(gift.amountCents).toBe(13000);
    expect(gift.items).toBe('Mejora tus resultados + Date a conocer');
    expect(sent[0].html).toContain('130 €');
  });

  it('un código sin pagar no se puede canjear', async () => {
    const { giftId } = await startGiftCheckout(buyer, now);
    const g = (await getGift(giftId))!;
    await expect(redeemGift({ ...redeem, code: g.code }, now)).rejects.toBeInstanceOf(BookingError);
  });

  it('canjear confirma la cita sin pago y el código no se puede volver a usar', async () => {
    const gift = await paidGift();
    sent = [];
    const { bookingId } = await redeemGift({ ...redeem, code: gift.code.toLowerCase() }, now);
    const b = (await getBooking(bookingId))!;
    expect(b.status).toBe('confirmed');
    expect(b.amountCents).toBe(0);
    expect(sent.map((m) => m.to)).toEqual(['marta@example.com', 'phisiolutions@gmail.com']);
    expect((await getGift(gift.id))!.status).toBe('redeemed');
    await expect(redeemGift({ ...redeem, code: gift.code, startUtc: '2026-11-10T08:00:00Z' }, now)).rejects.toThrow(
      'ya se ha usado',
    );
  });

  it('caduca a los 12 meses', async () => {
    const gift = await paidGift();
    const r = await checkCode(gift.code, DateTime.utc().plus({ months: 13 }));
    expect(r).toEqual({ error: 'Este código ha caducado.' });
  });
});
