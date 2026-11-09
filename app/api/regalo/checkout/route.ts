import { isTestMode } from '@/lib/stripe';
import { NextResponse } from 'next/server';
import { BookingError } from '@/lib/booking';
import { startGiftCheckout } from '@/lib/gift';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const { url } = await startGiftCheckout(await req.json());
    return NextResponse.json({ url });
  } catch (e) {
    if (e instanceof BookingError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error(e);
    const detalle = isTestMode() ? ` (${(e as Error).message})` : '';
    return NextResponse.json(
      { error: `No hemos podido iniciar el pago. Inténtalo de nuevo.${detalle}` },
      { status: 500 },
    );
  }
}
