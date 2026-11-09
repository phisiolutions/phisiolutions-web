import Stripe from 'stripe';

let stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!stripe) {
    const key = process.env.STRIPE_SECRET_KEY?.trim();
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

/** Modo de la clave: acepta claves secretas (sk_) y restringidas (rk_). */
export function stripeMode(): 'real' | 'pruebas' | 'sin configurar' | 'clave no reconocida' {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) return 'sin configurar';
  if (/^(sk|rk)_live_/.test(key)) return 'real';
  if (/^(sk|rk)_test_/.test(key)) return 'pruebas';
  return 'clave no reconocida';
}

export function isTestMode(): boolean {
  return stripeMode() === 'pruebas';
}
