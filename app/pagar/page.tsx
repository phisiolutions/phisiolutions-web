import { Suspense } from 'react';
import PayForm from './PayForm';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'Realizar un pago · Phisiolutions',
  robots: { index: false },
};

export default function PagarPage() {
  return (
    <main className="section-sky">
      <div className="container" style={{ maxWidth: 720, paddingTop: 48, paddingBottom: 80 }}>
        <h1 style={{ fontSize: 40 }}>Realizar un pago</h1>
        <p className="lead" style={{ marginBottom: 24 }}>
          Para pagos acordados con Phisiolutions que no corresponden a una reserva. Indica el importe y el concepto;
          recibirás la factura por email.
        </p>
        <Suspense>
          <PayForm />
        </Suspense>
      </div>
    </main>
  );
}
