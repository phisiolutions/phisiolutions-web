import { describe, expect, it } from 'vitest';
import type Stripe from 'stripe';
import { paidPdf } from '@/lib/booking';

describe('paidPdf', () => {
  it('solo adjunta el PDF si la factura está pagada', () => {
    expect(paidPdf({ status: 'paid', invoice_pdf: 'https://x/pdf' } as Stripe.Invoice)).toBe('https://x/pdf');
    expect(paidPdf({ status: 'open', invoice_pdf: 'https://x/pdf' } as Stripe.Invoice)).toBeNull();
  });
});
