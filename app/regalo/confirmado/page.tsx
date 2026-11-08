import Link from 'next/link';
import { confirmGift, getGiftBySession, type Gift } from '@/lib/gift';
import { getStripe } from '@/lib/stripe';
import { formatEuros } from '@/lib/services';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Tarjeta regalo · Phisiolutions' };

export default async function RegaloConfirmado({ searchParams }: { searchParams: Promise<{ session_id?: string }> }) {
  const { session_id } = await searchParams;
  let gift: Gift | null = session_id ? await getGiftBySession(session_id) : null;

  // Si se vuelve antes de que llegue el webhook, confirmamos aquí (es idempotente).
  if (gift && session_id && (gift.status === 'pending' || gift.status === 'awaiting_transfer')) {
    try {
      const session = await getStripe().checkout.sessions.retrieve(session_id);
      if (session.payment_status === 'paid') await confirmGift(gift.id, session_id);
    } catch (e) {
      console.error('No se pudo completar la confirmación del regalo', e);
    }
    gift = await getGiftBySession(session_id);
  }

  if (!gift) {
    return (
      <main className="prose">
        <h1>No encontramos tu pedido</h1>
        <p>Si has pagado, revisa tu email: allí tienes la tarjeta regalo.</p>
        <Link href="/regalo" className="btn btn-accent">Volver</Link>
      </main>
    );
  }

  const paid = gift.status === 'paid' || gift.status === 'redeemed';
  return (
    <main className="prose">
      <h1>{paid ? '¡Tarjeta regalo lista!' : gift.status === 'cancelled' ? 'Pago no completado' : 'Pedido recibido'}</h1>
      <p className="lead">
        Para {gift.recipientName}. Importe: {formatEuros(gift.amountCents)}.
      </p>
      {paid && (
        <>
          <p>
            Te hemos enviado por email la tarjeta regalo con el código y la factura. Código: <strong>{gift.code}</strong>
          </p>
          <div className="actions">
            {gift.invoicePdfUrl && (
              <a className="btn btn-accent" href={gift.invoicePdfUrl}>
                Descargar factura (PDF)
              </a>
            )}
          </div>
        </>
      )}
      {(gift.status === 'pending' || gift.status === 'awaiting_transfer') && (
        <p>
          Si has pagado con tarjeta, en unos segundos recibirás la tarjeta regalo por email. Si has elegido
          transferencia, te la enviaremos en cuanto llegue el pago; los datos bancarios están en tu email.
        </p>
      )}
      {gift.status === 'cancelled' && (
        <p>
          El pago no se completó. <Link href="/regalo">Inténtalo de nuevo</Link>.
        </p>
      )}
    </main>
  );
}
