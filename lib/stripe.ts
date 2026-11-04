import Stripe from 'stripe';

let stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!stripe) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error('Falta STRIPE_SECRET_KEY');
    stripe = new Stripe(key);
  }
  return stripe;
}

/** Solo para tests. */
export function setStripeForTests(s: Stripe | null) {
  stripe = s;
}

export function bankTransferEnabled(): boolean {
  return process.env.ENABLE_BANK_TRANSFER !== 'false';
}
