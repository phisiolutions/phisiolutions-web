'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { DateTime } from 'luxon';
import { AGENDA } from '@/lib/availability';
import { MAX_QUANTITY, SERVICES as ALL_SERVICES, formatEuros, isBookable, type Audience } from '@/lib/services';

// Solo los servicios con precio publicado se pueden reservar.
const SERVICES = ALL_SERVICES.filter(isBookable);

const DAYS_SHOWN = 14;

function upcomingDays(): DateTime[] {
  const out: DateTime[] = [];
  let d = DateTime.now().setZone(AGENDA.timezone).startOf('day');
  for (let i = 0; i < AGENDA.horizonDays && out.length < DAYS_SHOWN; i++) {
    if ((AGENDA.weeklyHours[d.weekday] ?? []).length && !AGENDA.closedDates.includes(d.toISODate()!)) out.push(d);
    d = d.plus({ days: 1 });
  }
  return out;
}

export default function BookingForm() {
  const params = useSearchParams();
  const initial = SERVICES.find((s) => s.id === params.get('servicio')) ?? SERVICES.find((s) => s.id === 'pac-fisio-60')!;
  const [audience, setAudience] = useState<Audience>(initial.audience);
  const [serviceId, setServiceId] = useState(initial.id);
  const [quantity, setQuantity] = useState(1);
  const days = useMemo(upcomingDays, []);
  const [day, setDay] = useState<string>(days[0]?.toISODate() ?? '');
  const [slots, setSlots] = useState<string[] | null>(null);
  const [slot, setSlot] = useState<string | null>(null);
  const [autoDay, setAutoDay] = useState(true); // salta al primer día con huecos hasta que el cliente elija
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(params.get('cancelada') ? 'Has cancelado el pago. Tu cita no se ha reservado.' : null);
  const [sending, setSending] = useState(false);

  const service = SERVICES.find((s) => s.id === serviceId)!;
  const list = SERVICES.filter((s) => s.audience === audience);

  useEffect(() => {
    if (!day) return;
    let cancelled = false;
    setSlots(null);
    fetch(`/api/slots?service=${serviceId}&date=${day}`)
      .then(async (r) => {
        if (!r.ok) throw new Error('slots');
        return r.json();
      })
      .then((j) => {
        if (cancelled) return;
        const found: string[] = j.slots ?? [];
        const idx = days.findIndex((d) => d.toISODate() === day);
        if (found.length === 0 && autoDay && idx >= 0 && idx < days.length - 1) {
          setDay(days[idx + 1].toISODate()!);
          return;
        }
        setSlots(found);
        // Mantiene la hora elegida si sigue libre (p. ej. al cambiar de servicio).
        setSlot((current) => (current && found.includes(current) ? current : null));
      })
      .catch(() => {
        if (cancelled) return;
        setSlots([]);
        setError('No hemos podido cargar la agenda. Recarga la página o inténtalo más tarde.');
      });
    return () => {
      cancelled = true;
    };
  }, [day, serviceId]); // eslint-disable-line react-hooks/exhaustive-deps

  const missing: string[] = [];
  if (!slot) missing.push('elige día y hora (paso 2)');
  if (name.trim().length < 2) missing.push('escribe tu nombre (paso 3)');
  if (!/\S+@\S+\.\S+/.test(email)) missing.push('escribe un email válido (paso 3)');
  if (!consent) missing.push('marca la casilla de privacidad (paso 3)');
  const canPay = missing.length === 0 && !sending;

  async function pay(e: React.FormEvent) {
    e.preventDefault();
    if (!canPay) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serviceId, quantity, startUtc: slot, name, email, phone, notes, consent }),
      });
      const json = await res.json();
      if (!res.ok || !json.url) throw new Error(json.error ?? 'No hemos podido iniciar el pago.');
      window.location.href = json.url;
    } catch (err) {
      setError((err as Error).message);
      setSending(false);
      if (day) {
        fetch(`/api/slots?service=${serviceId}&date=${day}`)
          .then((r) => r.json())
          .then((j) => setSlots(j.slots ?? []));
      }
    }
  }

  const when = slot
    ? DateTime.fromISO(slot).setZone(AGENDA.timezone).setLocale('es').toFormat("cccc d 'de' LLLL, HH:mm")
    : 'Elige día y hora';

  return (
    <form className="booking" onSubmit={pay}>
      <div className="booking-main">
        <h1 style={{ fontSize: 40 }}>Reserva tu sesión online</h1>

        <section className="panel" aria-labelledby="paso1">
          <h2 id="paso1">1. Elige el servicio</h2>
          <div className="row" role="group" aria-label="Tipo de cliente">
            {(
              [
                ['pacientes', 'Soy paciente'],
                ['profesionales', 'Soy profesional'],
              ] as [Audience, string][]
            ).map(([a, label]) => (
              <button
                key={a}
                type="button"
                className="pill"
                aria-pressed={audience === a}
                onClick={() => {
                  setAudience(a);
                  setServiceId(SERVICES.find((s) => s.audience === a)!.id);
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {list.map((s) => (
              <button
                key={s.id}
                type="button"
                className="service-opt"
                aria-pressed={s.id === serviceId}
                onClick={() => setServiceId(s.id)}
              >
                <span>
                  <span className="name">{s.name}</span>
                  <span className="desc">
                    {s.description} {s.durationMinutes} min.
                  </span>
                </span>
                <span className="amount">{formatEuros(s.priceCents)}</span>
              </button>
            ))}
          </div>
          <div className="row" style={{ gap: 16 }}>
            <span style={{ fontWeight: 700 }} id="qty-label">Número de sesiones</span>
            <div className="row stepper" aria-labelledby="qty-label">
              <button type="button" aria-label="Quitar una sesión" onClick={() => setQuantity((q) => Math.max(1, q - 1))}>
                −
              </button>
              <output aria-live="polite">{quantity}</output>
              <button
                type="button"
                aria-label="Añadir una sesión"
                onClick={() => setQuantity((q) => Math.min(MAX_QUANTITY, q + 1))}
              >
                +
              </button>
            </div>
          </div>
        </section>

        <section className="panel" aria-labelledby="paso2">
          <h2 id="paso2">2. Elige día y hora de la primera sesión</h2>
          <div className="row" role="group" aria-label="Día">
            {days.map((d) => (
              <button
                key={d.toISODate()}
                type="button"
                className="day"
                aria-pressed={day === d.toISODate()}
                onClick={() => {
                  setAutoDay(false);
                  setDay(d.toISODate()!);
                }}
              >
                <span className="dow">{d.setLocale('es').toFormat('ccc')}</span>
                <span className="num">{d.day}</span>
              </button>
            ))}
          </div>
          <div className="row" role="group" aria-label="Hora">
            {slots === null && <p className="muted">Cargando horas…</p>}
            {slots?.length === 0 && <p className="muted">No quedan horas libres este día. Prueba otro.</p>}
            {slots?.map((s) => (
              <button key={s} type="button" className="pill" aria-pressed={slot === s} onClick={() => setSlot(s)}>
                {DateTime.fromISO(s).setZone(AGENDA.timezone).toFormat('HH:mm')}
              </button>
            ))}
          </div>
          <p className="muted">
            Horario de Madrid.{quantity > 1 ? ' Las siguientes sesiones las agendamos contigo por email.' : ''}
          </p>
        </section>

        <section className="panel" aria-labelledby="paso3">
          <h2 id="paso3">3. Tus datos</h2>
          <div className="fields">
            <label className="field">
              Nombre y apellidos
              <input value={name} onChange={(e) => setName(e.target.value)} required autoComplete="name" />
            </label>
            <label className="field">
              Email
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
            </label>
            <label className="field">
              Teléfono (opcional)
              <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" />
            </label>
          </div>
          <label className="field">
            ¿Algo que debamos saber antes de la sesión? (opcional)
            <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>
          <label className="consent">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} required />
            <span>
              Acepto la <a href="/privacidad" target="_blank">política de privacidad</a>, las{' '}
              <a href="/condiciones" target="_blank">condiciones de contratación</a> y el tratamiento de mis datos de
              salud para la prestación del servicio.
            </span>
          </label>
        </section>
      </div>

      <aside className="panel summary" aria-labelledby="resumen">
        <h2 id="resumen">Resumen</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <strong>{service.name}</strong>
          <span className="muted">
            {quantity} × {formatEuros(service.priceCents)}
          </span>
          <span className="muted">Primera sesión: {when}</span>
          <span className="muted">Videollamada por Zoom</span>
        </div>
        <div className="total">
          <span style={{ fontWeight: 700 }}>Total</span>
          <strong>{formatEuros(service.priceCents! * quantity)}</strong>
        </div>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {missing.length > 0 && (
          <p className="muted">Para continuar: {missing.join(', ')}.</p>
        )}
        <button type="submit" className="btn btn-accent" disabled={!canPay}>
          {sending ? 'Abriendo el pago…' : 'Ir al pago'}
        </button>
        <p className="muted" style={{ textAlign: 'center' }}>
          Pago seguro con tarjeta o transferencia. Recibirás la factura por email.
        </p>
      </aside>
    </form>
  );
}
