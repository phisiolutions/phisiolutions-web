'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { formatEuros, parseEuros } from '@/lib/services';

interface GiftOption {
  id: string;
  name: string;
  priceCents: number;
}

export default function GiftForm({
  services,
  minCents,
  maxCents,
}: {
  services: GiftOption[];
  minCents: number;
  maxCents: number;
}) {
  const params = useSearchParams();
  const [buyerName, setBuyerName] = useState('');
  const [buyerEmail, setBuyerEmail] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [message, setMessage] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [amount, setAmount] = useState('');
  const [consent, setConsent] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(
    params.get('cancelada') ? 'Has cancelado el pago. La tarjeta regalo no se ha comprado.' : null,
  );

  const cents = parseEuros(amount);
  const amountOk = cents !== null && cents >= minCents && cents <= maxCents;

  function toggle(id: string) {
    const next = selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id];
    setSelected(next);
    const sum = services.filter((s) => next.includes(s.id)).reduce((t, s) => t + s.priceCents, 0);
    setAmount(sum ? String(sum / 100).replace('.', ',') : '');
  }

  const missing: string[] = [];
  if (!amountOk) missing.push(`el importe (entre ${formatEuros(minCents)} y ${formatEuros(maxCents)})`);
  if (buyerName.trim().length < 2) missing.push('tu nombre');
  if (!/\S+@\S+\.\S+/.test(buyerEmail)) missing.push('tu email');
  if (recipientName.trim().length < 2) missing.push('el nombre de quien la recibe');
  if (!consent) missing.push('la casilla de privacidad');
  const canPay = missing.length === 0 && !sending;

  async function pay(e: React.FormEvent) {
    e.preventDefault();
    if (!canPay) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch('/api/regalo/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          buyerName,
          buyerEmail,
          recipientName,
          message,
          consent,
          amountCents: cents,
          serviceIds: selected,
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
      <h2>1. Elige el importe</h2>
      <p className="muted" style={{ margin: 0 }}>
        Marca los servicios que quieres regalar y sumamos sus precios, o escribe directamente la cantidad.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {services.map((s) => (
          <label key={s.id} className="consent" style={{ color: 'inherit' }}>
            <input type="checkbox" checked={selected.includes(s.id)} onChange={() => toggle(s.id)} />
            <span style={{ flexGrow: 1 }}>{s.name}</span>
            <strong>{formatEuros(s.priceCents)}</strong>
          </label>
        ))}
      </div>
      <label className="field">
        Importe de la tarjeta regalo (€)
        <input
          inputMode="decimal"
          value={amount}
          onChange={(e) => {
            setAmount(e.target.value);
            setSelected([]);
          }}
          placeholder="Ej.: 150"
        />
      </label>
      <h2>2. Tus datos y los de quien la recibe</h2>
      <div className="fields">
        <label className="field">
          Tu nombre
          <input value={buyerName} onChange={(e) => setBuyerName(e.target.value)} required autoComplete="name" />
        </label>
        <label className="field">
          Tu email (te enviamos aquí la tarjeta y la factura)
          <input
            type="email"
            value={buyerEmail}
            onChange={(e) => setBuyerEmail(e.target.value)}
            required
            autoComplete="email"
          />
        </label>
        <label className="field">
          Nombre de quien la recibe
          <input value={recipientName} onChange={(e) => setRecipientName(e.target.value)} required />
        </label>
      </div>
      <label className="field">
        Mensaje para la tarjeta (opcional)
        <textarea rows={3} maxLength={500} value={message} onChange={(e) => setMessage(e.target.value)} />
      </label>
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
          : amountOk
            ? `Comprar tarjeta regalo (${formatEuros(cents!)})`
            : 'Comprar tarjeta regalo'}
      </button>
      <p className="muted" style={{ margin: 0 }}>
        Pago seguro con tarjeta o transferencia. Recibirás la factura por email.
      </p>
    </form>
  );
}

export function RedeemBox() {
  const router = useRouter();
  const [code, setCode] = useState('');
  return (
    <form
      style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
      onSubmit={(e) => {
        e.preventDefault();
        if (code.trim()) router.push(`/reservar?codigo=${encodeURIComponent(code.trim().toUpperCase())}`);
      }}
    >
      <label className="field">
        Código
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="PHI-XXXX-XXXX"
          autoCapitalize="characters"
        />
      </label>
      <button type="submit" className="btn btn-outline" disabled={!code.trim()}>
        Canjear
      </button>
    </form>
  );
}
