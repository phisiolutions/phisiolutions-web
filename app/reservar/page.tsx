import { Suspense } from 'react';
import BookingForm from './BookingForm';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Reservar cita · Phisiolutions' };

export default function ReservarPage() {
  return (
    <main className="section-sky">
      <div className="container">
        <Suspense>
          <BookingForm />
        </Suspense>
      </div>
    </main>
  );
}
