'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

export default function GiftForm({ priceLabel, serviceName }: { priceLabel: string; serviceName: string }) {
  const params = useSearchParams();
  const [buyerName, setBuyerName] = useState('');
  const [buyerEmail, setBuyerEmail] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [message, setMessage] = useState('');
  const [consent, setConsent] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(
    params.get('cancelada') ? 'Has cancelado el pago. La tarjeta regalo no se ha comprado.' : null,
  );

  const missing: string[] = [];
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
        body: JSON.stringify({ buyerName, buyerEmail, recipientName, message, consent }),
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
      <h2>
        {serviceName}: {priceLabel}
      </h2>
      <div className="fields">
        <label className="field">
          Tu nombre
          <input value={buyerName} onChange={(e) => setBuyerName(e.target.value)} required autoComplete="name" />
        </label>
        <label className="field">
          Tu email (te enviamos aquí la tarjeta y la factura)
          <input type="email" value={buyerEmail} onChange={(e) => setBuyerEmail(e.target.value)} required autoComplete="email" />
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
          Acepto la <a href="/privacidad" target="_blank">política de privacidad</a> y las{' '}
          <a href="/condiciones" target="_blank">condiciones de contratación</a>.
        </span>
      </label>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {missing.length > 0 && <p className="muted" style={{ margin: 0 }}>Para continuar falta: {missing.join(', ')}.</p>}
      <button type="submit" className="btn btn-accent" disabled={!canPay}>
        {sending ? 'Abriendo el pago…' : `Comprar tarjeta regalo (${priceLabel})`}
      </button>
      <p className="muted" style={{ margin: 0 }}>Pago seguro con tarjeta o transferencia. Recibirás la factura por email.</p>
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
        <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="PHI-XXXX-XXXX" autoCapitalize="characters" />
      </label>
      <button type="submit" className="btn btn-outline" disabled={!code.trim()}>
        Canjear
      </button>
    </form>
  );
}
