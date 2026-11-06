import { NextResponse } from 'next/server';
import { DateTime } from 'luxon';
import { AGENDA, availableSlots } from '@/lib/availability';
import { busyBetween } from '@/lib/db';
import { getService } from '@/lib/services';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const service = getService(url.searchParams.get('service') ?? '');
  const date = url.searchParams.get('date') ?? '';
  if (!service || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'Parámetros no válidos' }, { status: 400 });
  }
  const now = DateTime.utc();
  const day = DateTime.fromISO(date, { zone: AGENDA.timezone });
  try {
    const busy = await busyBetween(
      day.minus({ days: 1 }).toUTC().toISO()!,
      day.plus({ days: 2 }).toUTC().toISO()!,
      now.toISO()!,
    );
    return NextResponse.json({ slots: availableSlots(date, service.durationMinutes, busy, now) });
  } catch (e) {
    console.error('Error leyendo la agenda', e);
    return NextResponse.json({ error: 'No se pudo leer la agenda' }, { status: 500 });
  }
}
