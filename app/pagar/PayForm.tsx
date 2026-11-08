'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { formatEuros, parseEuros } from '@/lib/services';

const MIN = 100;
const MAX = 1_000_000;

export default function PayForm() {
  const params = useSearchParams();
  const [amount, setAmount] = useState(params.get('importe') ?? '');
  const [concept, setConcept] = useState(params.get('concepto') ?? '');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [consent, setConsent] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(params.get('cancelado') ? 'Has cancelado el pago.' : null);

  const cents = parseEuros(amount);
  const missing: string[] = [];
  if (cents === null) missing.push('el importe');
  else if (cents < MIN || cents > MAX) missing.push(`un importe entre ${formatEuros(MIN)} y ${formatEuros(MAX)}`);
  if (concept.trim().length < 3) missing.push('el concepto');
  if (name.trim().length < 2) missing.push('tu nombre');
  if (!/\S+@\S+\.\S+/.test(email)) missing.push('tu email');
  if (!consent) missing.push('la casilla de privacidad');
  const canPay = missing.length === 0 && !sending;

  async function pay(e: React.FormEvent) {
    e.preventDefault();
    if (!canPay) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch('/api/pagar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amountCents: cents,
          concept,
          name,
          email,
          consent,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.url) throw new Error(json.error ?? 'No hemos podido iniciar el pago.');
      window.location.href = json.url;
    } catch (err) {
      setError((err as Error).message);
      setSending(false);
    }
  }

  return (
    <form className="panel" onSubmit={pay}>
      <div className="fields">
        <label className="field">
          Importe (€)
          <input
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="Ej.: 150,00"
            required
          />
        </label>
        <label className="field">
          Concepto
          <input
            value={concept}
            onChange={(e) => setConcept(e.target.value)}
            placeholder="Ej.: Sesión de asesoría adicional"
            required
            maxLength={200}
          />
        </label>
        <label className="field">
          Nombre y apellidos o empresa
          <input value={name} onChange={(e) => setName(e.target.value)} required autoComplete="name" />
        </label>
        <label className="field">
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
        </label>
      </div>
      <label className="consent">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} required />
        <span>
          Acepto la{' '}
          <a href="/privacidad" target="_blank">
            política de privacidad
          </a>{' '}
          y las{' '}
          <a href="/condiciones" target="_blank">
            condiciones de contratación
          </a>
          .
        </span>
      </label>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {missing.length > 0 && (
        <p className="muted" style={{ margin: 0 }}>
          Para continuar falta: {missing.join(', ')}.
        </p>
      )}
      <button type="submit" className="btn btn-accent" disabled={!canPay}>
        {sending
          ? 'Abriendo el pago…'
          : cents && cents >= MIN && cents <= MAX
            ? `Pagar ${formatEuros(cents)}`
            : 'Pagar'}
      </button>
      <p className="muted" style={{ margin: 0 }}>
        Pago seguro con tarjeta o transferencia. Recibirás la factura por email.
      </p>
    </form>
  );
}
