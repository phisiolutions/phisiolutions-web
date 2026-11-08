'use client';

import { useState } from 'react';
import { formatEuros, parseEuros } from '@/lib/services';

export default function LinkMaker({ site }: { site: string }) {
  const [amount, setAmount] = useState('');
  const [concept, setConcept] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [copied, setCopied] = useState(false);

  const cents = parseEuros(amount);
  const valid = cents !== null && cents >= 100 && cents <= 1_000_000 && concept.trim().length >= 3;
  const link = valid
    ? `${site}/pagar?${new URLSearchParams({ importe: cents! % 100 === 0 ? String(cents! / 100) : (cents! / 100).toFixed(2).replace('.', ','), concepto: concept.trim() })}`
    : '';
  const greeting = name.trim() ? `Hola ${name.trim()}, ` : 'Hola, ';
  const text = valid
    ? `${greeting}aquí tienes el enlace para pagar ${formatEuros(cents!)} (${concept.trim()}) a Phisiolutions. Recibirás la factura por email:\n${link}`
    : '';
  // WhatsApp necesita el número con prefijo de país y sin espacios ni "+". Si no hay prefijo, se asume España (34).
  const digits = phone.replace(/\D/g, '');
  const waNumber = digits.length === 9 ? `34${digits}` : digits.replace(/^00/, '');
  const enc = encodeURIComponent(text);

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt('Copia el enlace:', link);
    }
  }

  return (
    <div className="panel">
      <div className="fields">
        <label className="field">
          Importe (€)
          <input
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="Ej.: 150"
          />
        </label>
        <label className="field">
          Concepto
          <input
            value={concept}
            onChange={(e) => setConcept(e.target.value)}
            placeholder="Ej.: Asesoría adicional"
            maxLength={200}
          />
        </label>
        <label className="field">
          Nombre del cliente (opcional)
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="field">
          Móvil del cliente (opcional, para WhatsApp/SMS)
          <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Ej.: 612 345 678" />
        </label>
      </div>

      {amount && cents === null && (
        <p className="error">Escribe el importe solo con números, por ejemplo 150 o 150,50.</p>
      )}
      {cents !== null && (cents < 100 || cents > 1_000_000) && (
        <p className="error">El importe debe estar entre 1 € y 10.000 €.</p>
      )}

      {valid ? (
        <>
          <label className="field">
            Enlace
            <input readOnly value={link} onFocus={(e) => e.target.select()} />
          </label>
          <div className="actions">
            <button type="button" className="btn btn-accent" onClick={copy}>
              {copied ? '¡Copiado!' : 'Copiar enlace'}
            </button>
            <a
              className="btn btn-outline"
              href={`https://wa.me/${waNumber}?text=${enc}`}
              target="_blank"
              rel="noreferrer"
            >
              WhatsApp
            </a>
            <a className="btn btn-outline" href={`sms:${digits ? `+${waNumber}` : ''}?&body=${enc}`}>
              SMS
            </a>
            <a
              className="btn btn-outline"
              href={`mailto:?subject=${encodeURIComponent(`Pago a Phisiolutions: ${concept.trim()}`)}&body=${enc}`}
            >
              Email
            </a>
            <a className="btn btn-outline" href={link} target="_blank" rel="noreferrer">
              Ver cómo lo verá el cliente
            </a>
          </div>
          <p className="muted" style={{ margin: 0 }}>
            WhatsApp y SMS abren la aplicación con el mensaje ya escrito; solo tienes que pulsar enviar. Sin móvil,
            WhatsApp te deja elegir el contacto.
          </p>
        </>
      ) : (
        <p className="muted" style={{ margin: 0 }}>
          Escribe el importe y el concepto para crear el enlace.
        </p>
      )}
    </div>
  );
}
