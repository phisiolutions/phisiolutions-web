import { Suspense } from 'react';
import { giftService } from '@/lib/gift';
import { formatEuros, GIFT_VALID_MONTHS, SERVICES } from '@/lib/services';
import GiftForm, { RedeemBox } from './GiftForm';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Tarjeta regalo · Phisiolutions' };

export default function RegaloPage() {
  const service = giftService();
  const info = SERVICES.find((s) => s.gift)!;
  return (
    <main className="section-sky">
      <div className="container booking">
        <div className="booking-main">
          <h1 style={{ fontSize: 40 }}>Regala un estudio de negocio</h1>
          <p className="lead">
            {info.description} Pagas tú y recibes por email una tarjeta regalo con un código. Quien la recibe elige
            el día y la hora de su sesión online cuando quiera, durante {GIFT_VALID_MONTHS} meses.
          </p>
          {service ? (
            <Suspense>
              <GiftForm priceLabel={formatEuros(service.priceCents)} serviceName={service.name} />
            </Suspense>
          ) : (
            <section className="panel">
              <p style={{ margin: 0 }}>La tarjeta regalo estará disponible muy pronto.</p>
            </section>
          )}
        </div>
        <aside className="panel summary" aria-labelledby="canjear">
          <h2 id="canjear">¿Te han regalado un estudio?</h2>
          <p className="muted" style={{ margin: 0 }}>Escribe tu código para elegir día y hora.</p>
          <RedeemBox />
        </aside>
      </div>
    </main>
  );
}
