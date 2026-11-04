import { describe, expect, it } from 'vitest';
import { DateTime } from 'luxon';
import { availableSlots } from '@/lib/availability';

const now = DateTime.fromISO('2026-11-09T06:00:00Z') as DateTime<true>; // lunes 07:00 en Madrid

describe('availableSlots', () => {
  it('genera huecos dentro del horario respetando la antelación mínima', () => {
    const slots = availableSlots('2026-11-10', 60, [], now); // martes
    // 09:00 Madrid = 08:00 UTC en noviembre
    expect(slots[0]).toBe('2026-11-10T08:00:00Z');
    expect(slots).toContain('2026-11-10T12:00:00Z'); // 13:00-14:00
    expect(slots).not.toContain('2026-11-10T12:30:00Z'); // acabaría a las 14:30
    expect(slots.at(-1)).toBe('2026-11-10T18:00:00Z'); // 19:00-20:00
  });

  it('no ofrece horas antes de la antelación mínima', () => {
    const slots = availableSlots('2026-11-09', 60, [], now);
    expect(slots.every((s) => DateTime.fromISO(s) >= now.plus({ hours: 12 }))).toBe(true);
  });

  it('excluye huecos que se solapan con reservas (con margen)', () => {
    const busy = [{ startUtc: '2026-11-10T09:00:00Z', endUtc: '2026-11-10T10:00:00Z' }];
    const slots = availableSlots('2026-11-10', 60, busy, now);
    expect(slots).not.toContain('2026-11-10T09:00:00Z');
    expect(slots).not.toContain('2026-11-10T08:00:00Z'); // acaba 09:00, el margen de 10 min lo bloquea
    expect(slots).not.toContain('2026-11-10T10:00:00Z'); // empieza justo al acabar, sin margen
    expect(slots).toContain('2026-11-10T10:30:00Z');
  });

  it('no hay agenda en fin de semana', () => {
    expect(availableSlots('2026-11-14', 60, [], now)).toEqual([]);
  });
});
