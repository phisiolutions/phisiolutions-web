import Link from 'next/link';
import { formatLocal } from '@/lib/availability';
import { confirmBooking } from '@/lib/booking';
import { getBooking, getBookingBySession, type Booking } from '@/lib/db';
import { getStripe } from '@/lib/stripe';
import { getService, formatEuros } from '@/lib/services';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Reserva · Phisiolutions' };

export default async function Confirmada({ searchParams }: { searchParams: Promise<{ session_id?: string; reserva?: string }> }) {
  const { session_id, reserva } = await searchParams;
  let booking: Booking | null = session_id
    ? await getBookingBySession(session_id)
    : reserva
      ? await getBooking(reserva)
      : null;

  // Si el cliente vuelve antes de que llegue el webhook, confirmamos aquí (es idempotente).
  if (booking && session_id && booking.status !== 'confirmed') {
    try {
      const session = await getStripe().checkout.sessions.retrieve(session_id);
      if (session.payment_status === 'paid') {
        await confirmBooking(booking.id, session_id);
        booking = await getBookingBySession(session_id);
      }
    } catch (e) {
      console.error('No se pudo completar la confirmación', e);
      booking = await getBookingBySession(session_id);
    }
  }

  if (!booking) {
    return (
      <main className="prose">
        <h1>No encontramos tu reserva</h1>
        <p>Si has pagado, revisa tu email: allí tienes la confirmación. Si no, vuelve a intentarlo.</p>
        <Link href="/reservar" className="btn btn-accent">Volver a reservar</Link>
      </main>
    );
  }

  const service = getService(booking.serviceId);
  const when = formatLocal(booking.startUtc);
  const confirmed = booking.status === 'confirmed';
  const awaiting = booking.status === 'awaiting_transfer' || booking.status === 'pending';

  return (
    <main className="prose">
      <h1>{confirmed ? '¡Reserva confirmada!' : awaiting ? 'Reserva recibida' : 'Reserva no completada'}</h1>
      <p className="lead">
        {service?.name} × {booking.quantity}. Primera sesión: {when} (hora de Madrid). Total:{' '}
        {booking.amountCents === 0 ? 'tarjeta regalo' : formatEuros(booking.amountCents)}.
      </p>
      {confirmed && (
        <>
          <p>
            Te hemos enviado por email la confirmación y el enlace de Zoom
            {booking.amountCents > 0 ? ', junto con la factura' : ''}.
          </p>
          <div className="actions">
            {booking.invoicePdfUrl && (
              <a className="btn btn-accent" href={booking.invoicePdfUrl}>
                Descargar factura (PDF)
              </a>
            )}
            {booking.invoiceUrl && (
              <a className="btn btn-outline" href={booking.invoiceUrl} target="_blank" rel="noreferrer">
                Ver factura
              </a>
            )}
          </div>
        </>
      )}
      {awaiting && (
        <p>
          Si has pagado con tarjeta, en unos segundos recibirás la confirmación por email. Si has elegido
          transferencia, guardamos tu cita mientras llega el pago; los datos bancarios están en tu email.
        </p>
      )}
      {!confirmed && !awaiting && (
        <p>
          El pago no se completó y la cita se ha liberado. <Link href="/reservar">Reserva de nuevo</Link>.
        </p>
      )}
    </main>
  );
}
