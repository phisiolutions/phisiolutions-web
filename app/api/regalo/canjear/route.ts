import { NextResponse } from 'next/server';
import { BookingError } from '@/lib/booking';
import { redeemGift } from '@/lib/gift';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const { bookingId } = await redeemGift(await req.json());
    return NextResponse.json({ url: `/reserva/confirmada?reserva=${bookingId}` });
  } catch (e) {
    if (e instanceof BookingError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error(e);
    return NextResponse.json({ error: 'No hemos podido canjear el código. Inténtalo de nuevo.' }, { status: 500 });
  }
}
