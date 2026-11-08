import Link from 'next/link';
import { confirmPayment, getPaymentBySession, type Payment } from '@/lib/payment';
import { getStripe } from '@/lib/stripe';
import { formatEuros } from '@/lib/services';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'Pago · Phisiolutions',
  robots: { index: false },
};

export default async function PagoConfirmado({ searchParams }: { searchParams: Promise<{ session_id?: string }> }) {
  const { session_id } = await searchParams;
  let p: Payment | null = session_id ? await getPaymentBySession(session_id) : null;
  if (p && session_id && (p.status === 'pending' || p.status === 'awaiting_transfer')) {
    try {
      const session = await getStripe().checkout.sessions.retrieve(session_id);
      if (session.payment_status === 'paid') await confirmPayment(p.id, session_id);
    } catch (e) {
      console.error('No se pudo completar la confirmación del pago', e);
    }
    p = await getPaymentBySession(session_id);
  }
  if (!p) {
    return (
      <main className="prose">
        <h1>No encontramos tu pago</h1>
        <p>Si has pagado, revisa tu email: allí tienes la factura.</p>
        <Link href="/pagar" className="btn btn-accent">
          Volver
        </Link>
      </main>
    );
  }
  return (
    <main className="prose">
      <h1>
        {p.status === 'paid' ? '¡Pago recibido!' : p.status === 'cancelled' ? 'Pago no completado' : 'Pago registrado'}
      </h1>
      <p className="lead">
        {p.concept}: {formatEuros(p.amountCents)}.
      </p>
      {p.status === 'paid' && (
        <>
          <p>Te hemos enviado la factura por email.</p>
          {p.invoicePdfUrl && (
            <div className="actions">
              <a className="btn btn-accent" href={p.invoicePdfUrl}>
                Descargar factura (PDF)
              </a>
            </div>
          )}
        </>
      )}
      {(p.status === 'pending' || p.status === 'awaiting_transfer') && (
        <p>
          Si has pagado con tarjeta, en unos segundos recibirás la factura por email. Si has elegido transferencia, los
          datos bancarios están en tu email.
        </p>
      )}
      {p.status === 'cancelled' && (
        <p>
          El pago no se completó. <Link href="/pagar">Inténtalo de nuevo</Link>.
        </p>
      )}
    </main>
  );
}
