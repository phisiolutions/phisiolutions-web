import { isTestMode } from '@/lib/stripe';
import { NextResponse } from 'next/server';
import { BookingError, startCheckout } from '@/lib/booking';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { url } = await startCheckout(body);
    return NextResponse.json({ url });
  } catch (e) {
    if (e instanceof BookingError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error(e);
    // En modo de pruebas mostramos el motivo para poder corregirlo.
    const detalle = isTestMode() ? ` (${(e as Error).message})` : '';
    return NextResponse.json(
      { error: `No hemos podido iniciar el pago. Inténtalo de nuevo.${detalle}` },
      { status: 500 },
    );
  }
}
