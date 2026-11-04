import { NextResponse } from 'next/server';
import { handleStripeEvent } from '@/lib/booking';
import { getStripe } from '@/lib/stripe';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const signature = req.headers.get('stripe-signature');
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!signature || !secret) return NextResponse.json({ error: 'Sin firma' }, { status: 400 });
  const payload = await req.text();
  let event;
  try {
    event = getStripe().webhooks.constructEvent(payload, signature, secret);
  } catch {
    return NextResponse.json({ error: 'Firma no válida' }, { status: 400 });
  }
  try {
    await handleStripeEvent(event);
  } catch (e) {
    console.error('Error procesando el evento de Stripe', event.type, e);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
  return NextResponse.json({ received: true });
}
