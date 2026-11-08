import { beforeEach, describe, expect, it, vi } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import type Stripe from 'stripe';
import { resetDbForTests } from '@/lib/db';
import { setStripeForTests } from '@/lib/stripe';
import { setMailerForTests, type Mail } from '@/lib/mail';
import { handleStripeEvent, BookingError } from '@/lib/booking';
import { startPaymentCheckout, getPayment } from '@/lib/payment';
import { parseEuros } from '@/lib/services';

let sent: Mail[];
let created: Stripe.Checkout.SessionCreateParams[];
let sessions: Record<string, Partial<Stripe.Checkout.Session>>;

beforeEach(() => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'phisio-')), 'test.db');
  resetDbForTests(`file:${file}`);
  sent = [];
  created = [];
  sessions = {};
  setStripeForTests({
    customers: { create: vi.fn(async () => ({ id: 'cus_1' })) },
    checkout: {
      sessions: {
        create: vi.fn(async (p: Stripe.Checkout.SessionCreateParams) => {
          created.push(p);
          const id = `cs_${created.length}`;
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
  } as unknown as Stripe);
  setMailerForTests(async (m) => {
    sent.push(m);
  });
});

const input = { amountCents: 25050, concept: 'Asesoría adicional', name: 'Ana López', email: 'ana@example.com', consent: true as const };

describe('pago libre', () => {
  it('interpreta importes en formato español', () => {
    expect(parseEuros('150')).toBe(15000);
    expect(parseEuros('150,5')).toBe(15050);
    expect(parseEuros('1.500')).toBe(150000);
    expect(parseEuros('1.500,25 €')).toBe(150025);
    expect(parseEuros('12.5')).toBe(1250);
    expect(parseEuros('abc')).toBeNull();
  });

  it('cobra el importe elegido y envía factura al cliente y a Phisiolutions una vez', async () => {
    const { paymentId } = await startPaymentCheckout(input);
    expect(created[0].line_items![0].price_data!.unit_amount).toBe(25050);
    expect(created[0].invoice_creation?.enabled).toBe(true);
    const ev = () =>
      ({ type: 'checkout.session.completed', data: { object: { ...sessions.cs_1, payment_status: 'paid' } } }) as unknown as Stripe.Event;
    await handleStripeEvent(ev());
    await handleStripeEvent(ev());
    expect((await getPayment(paymentId))!.status).toBe('paid');
    expect(sent.map((m) => m.to)).toEqual(['ana@example.com', 'phisiolutions@gmail.com']);
  });

  it('rechaza importes fuera de rango', async () => {
    await expect(startPaymentCheckout({ ...input, amountCents: 50 })).rejects.toBeInstanceOf(BookingError);
  });
});
