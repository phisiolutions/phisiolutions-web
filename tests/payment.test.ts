import { beforeEach, describe, expect, it, vi } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import type Stripe from 'stripe';
import { resetDbForTests } from '@/lib/db';
import { setStripeForTests } from '@/lib/stripe';
import { setMailerForTests, type Mail } from '@/lib/mail';
import { handleStripeEvent, BookingError, setInvoiceWaitForTests } from '@/lib/booking';
import { startPaymentCheckout, getPayment } from '@/lib/payment';
import { parseEuros } from '@/lib/services';

let sent: Mail[];
let created: Stripe.Checkout.SessionCreateParams[];
let sessions: Record<string, Partial<Stripe.Checkout.Session>>;

beforeEach(() => {
  setInvoiceWaitForTests(0);
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

const input = {
  amountCents: 25050,
  concept: 'Asesoría adicional',
  name: 'Ana López',
  email: 'ana@example.com',
  consent: true as const,
};

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
    expect(created[0].invoice_creation?.invoice_data?.custom_fields).toEqual([{ name: 'EIN', value: '38-4417056' }]);
    expect(created[0].tax_id_collection).toEqual({ enabled: true });
    expect(created[0].billing_address_collection).toBe('auto');
    const ev = () =>
      ({
        type: 'checkout.session.completed',
        data: { object: { ...sessions.cs_1, payment_status: 'paid' } },
      }) as unknown as Stripe.Event;
    await handleStripeEvent(ev());
    await handleStripeEvent(ev());
    expect((await getPayment(paymentId))!.status).toBe('paid');
    expect(sent.map((m) => m.to)).toEqual(['ana@example.com', 'phisiolutions@gmail.com']);
  });

  it('espera a que Stripe marque la factura como pagada antes de enviarla', async () => {
    setInvoiceWaitForTests(5000);
    const stripe = (await import('@/lib/stripe')).getStripe() as unknown as {
      checkout: { sessions: { retrieve: ReturnType<typeof vi.fn> } };
      invoices: { retrieve: ReturnType<typeof vi.fn> };
    };
    stripe.checkout.sessions.retrieve.mockImplementation(async (id: string) => ({
      ...sessions[id],
      invoice: { id: 'in_1', status: 'open', invoice_pdf: null, hosted_invoice_url: 'https://invoice.stripe.test/open' },
    }));
    stripe.invoices.retrieve.mockResolvedValue({
      id: 'in_1',
      status: 'paid',
      invoice_pdf: null,
      hosted_invoice_url: 'https://invoice.stripe.test/paid',
    });
    const { paymentId } = await startPaymentCheckout(input);
    sessions.cs_1.payment_status = 'paid';
    await handleStripeEvent({
      type: 'checkout.session.completed',
      data: { object: { ...sessions.cs_1, payment_status: 'paid' } },
    } as unknown as Stripe.Event);
    expect(stripe.invoices.retrieve).toHaveBeenCalled();
    expect((await getPayment(paymentId))!.invoiceUrl).toBe('https://invoice.stripe.test/paid');
  });

  it('rechaza importes fuera de rango', async () => {
    await expect(startPaymentCheckout({ ...input, amountCents: 50 })).rejects.toBeInstanceOf(BookingError);
  });
});
