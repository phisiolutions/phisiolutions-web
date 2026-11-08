import { COMPANY } from '@/lib/company';

export const metadata = { title: 'Aviso legal · Phisiolutions' };

export default function Page() {
  return (
    <main className="prose">
      <h1>Aviso legal</h1>
      <h2>Titular de la web</h2>
      <p>
        {COMPANY.name}, {COMPANY.type}.
        <br />
        Número fiscal (EIN): {COMPANY.ein}.
        <br />
        Domicilio: {COMPANY.address.join(', ')}.
        <br />
        Teléfono: {COMPANY.phone} · Email: <a href={`mailto:${COMPANY.email}`}>{COMPANY.email}</a>
      </p>
      <h2>Objeto</h2>
      <p>
        Esta web informa sobre los servicios de consultoría online de {COMPANY.name} para fisioterapeutas y
        profesionales de la salud y permite reservarlos y pagarlos. La contratación se rige por las{' '}
        <a href="/condiciones">condiciones de contratación</a> y el tratamiento de datos por la{' '}
        <a href="/privacidad">política de privacidad</a>.
      </p>
      <h2>Propiedad intelectual</h2>
      <p>
        Los textos, el logotipo y el diseño de esta web pertenecen a {COMPANY.name} o se usan con autorización. No se
        pueden reproducir con fines comerciales sin permiso por escrito.
      </p>
      <h2>Responsabilidad</h2>
      <p>
        La información de la web es general y no sustituye al asesoramiento personalizado que se presta en cada
        servicio. {COMPANY.name} procura que sea exacta y actual, pero no responde de decisiones tomadas solo a partir
        de ella ni de los contenidos de webs de terceros enlazadas.
      </p>
      <h2>Cookies</h2>
      <p>
        Esta web no usa cookies de publicidad ni de analítica. Solo usa cookies técnicas imprescindibles para su
        funcionamiento y para el pago seguro con Stripe.
      </p>
      <p className="muted">Última actualización: {COMPANY.updated}.</p>
    </main>
  );
}
