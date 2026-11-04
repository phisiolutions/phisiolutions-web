import { DateTime, Interval } from 'luxon';

// Horario de atención. Edita estos valores para cambiar la agenda.
export const AGENDA = {
  timezone: 'Europe/Madrid',
  // 1 = lunes ... 7 = domingo. Cada franja en hora local "HH:mm".
  weeklyHours: {
    1: [['09:00', '14:00'], ['16:00', '20:00']],
    2: [['09:00', '14:00'], ['16:00', '20:00']],
    3: [['09:00', '14:00'], ['16:00', '20:00']],
    4: [['09:00', '14:00'], ['16:00', '20:00']],
    5: [['09:00', '14:00']],
  } as Record<number, [string, string][]>,
  // Días sin agenda (vacaciones, festivos), formato YYYY-MM-DD.
  closedDates: [] as string[],
  slotStepMinutes: 30,
  bufferMinutes: 10,
  minNoticeHours: 12,
  horizonDays: 45,
};

export interface BusyInterval {
  startUtc: string;
  endUtc: string;
}

/** Devuelve las horas de inicio disponibles (ISO UTC) para un día local. */
export function availableSlots(
  dateLocal: string,
  durationMinutes: number,
  busy: BusyInterval[],
  now: DateTime = DateTime.utc(),
  agenda = AGENDA,
): string[] {
  const day = DateTime.fromISO(dateLocal, { zone: agenda.timezone });
  if (!day.isValid) return [];
  if (agenda.closedDates.includes(day.toISODate()!)) return [];

  const earliest = now.plus({ hours: agenda.minNoticeHours });
  const latest = now.plus({ days: agenda.horizonDays });
  const ranges = agenda.weeklyHours[day.weekday] ?? [];
  const busyIntervals = busy.map((b) =>
    Interval.fromDateTimes(
      DateTime.fromISO(b.startUtc).minus({ minutes: agenda.bufferMinutes }),
      DateTime.fromISO(b.endUtc).plus({ minutes: agenda.bufferMinutes }),
    ),
  );

  const slots: string[] = [];
  for (const [from, to] of ranges) {
    const [fh, fm] = from.split(':').map(Number);
    const [th, tm] = to.split(':').map(Number);
    let start = day.set({ hour: fh, minute: fm, second: 0, millisecond: 0 });
    const rangeEnd = day.set({ hour: th, minute: tm, second: 0, millisecond: 0 });
    while (start.plus({ minutes: durationMinutes }) <= rangeEnd) {
      const end = start.plus({ minutes: durationMinutes });
      const candidate = Interval.fromDateTimes(start, end);
      const free = !busyIntervals.some((b) => b.overlaps(candidate));
      if (free && start >= earliest && start <= latest) {
        slots.push(start.toUTC().toISO({ suppressMilliseconds: true })!);
      }
      start = start.plus({ minutes: agenda.slotStepMinutes });
    }
  }
  return slots;
}

export function isSlotAvailable(
  startUtc: string,
  durationMinutes: number,
  busy: BusyInterval[],
  now: DateTime = DateTime.utc(),
): boolean {
  const local = DateTime.fromISO(startUtc).setZone(AGENDA.timezone);
  if (!local.isValid) return false;
  const normalized = local.toUTC().toISO({ suppressMilliseconds: true });
  return availableSlots(local.toISODate()!, durationMinutes, busy, now).includes(normalized!);
}

export function formatLocal(startUtc: string): string {
  return DateTime.fromISO(startUtc)
    .setZone(AGENDA.timezone)
    .setLocale('es')
    .toFormat("cccc d 'de' LLLL 'a las' HH:mm");
}
