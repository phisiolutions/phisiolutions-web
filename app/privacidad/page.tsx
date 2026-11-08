import { COMPANY } from '@/lib/company';

export const metadata = { title: 'Política de privacidad · Phisiolutions' };

export default function Page() {
  return (
    <main className="prose">
      <h1>Política de privacidad</h1>
      <h2>Responsable del tratamiento</h2>
      <p>
        {COMPANY.name}, {COMPANY.address.join(', ')}. Teléfono {COMPANY.phone}. Email:{' '}
        <a href={`mailto:${COMPANY.email}`}>{COMPANY.email}</a>.
      </p>
      <h2>Qué datos tratamos</h2>
      <p>
        Los que nos facilitas al reservar, comprar una tarjeta regalo o hacer un pago: nombre, email, teléfono
        (opcional), las notas que nos escribas y los datos de facturación. Los datos de tu tarjeta o de tu banco los
        gestiona directamente Stripe; nosotros no los vemos ni los guardamos. No te pedimos datos de salud.
      </p>
      <h2>Para qué y con qué base legal</h2>
      <ul>
        <li>Gestionar tu reserva, prestar el servicio y comunicarnos contigo: ejecución del contrato.</li>
        <li>Cobrar y emitir la factura, y conservarla: cumplimiento de obligaciones legales y fiscales.</li>
        <li>
          Responder a tus consultas: tu consentimiento o el interés legítimo en atenderte. No enviamos publicidad sin tu
          permiso.
        </li>
      </ul>
      <h2>Cuánto tiempo los conservamos</h2>
      <p>
        Mientras dure la relación y, después, durante los plazos que exige la ley para reclamaciones y obligaciones
        fiscales y contables. Pasados esos plazos, los borramos.
      </p>
      <h2>Con quién los compartimos</h2>
      <p>
        No vendemos tus datos. Solo los usan los proveedores que necesitamos para prestar el servicio, siempre por
        cuenta nuestra: Stripe (pagos y facturas), Netlify (alojamiento de la web), Turso (base de datos de reservas),
        Zoom (videollamadas) y Google (correo electrónico).
      </p>
      <h2>Transferencias internacionales</h2>
      <p>
        {COMPANY.name} está en Estados Unidos y estos proveedores guardan los datos allí. Si estás en la Unión Europea,
        tus datos se transfieren a EE. UU. con las garantías del Reglamento General de Protección de Datos: el Marco de
        Privacidad de Datos UE-EE. UU. cuando el proveedor está adherido y, en su defecto, las cláusulas contractuales
        tipo aprobadas por la Comisión Europea.
      </p>
      <h2>Tus derechos</h2>
      <p>
        Puedes pedirnos el acceso, la rectificación, la supresión, la limitación u oposición al tratamiento y la
        portabilidad de tus datos, y retirar tu consentimiento, escribiendo a{' '}
        <a href={`mailto:${COMPANY.email}`}>{COMPANY.email}</a>. Si estás en España y crees que no hemos atendido bien
        tu solicitud, puedes reclamar ante la Agencia Española de Protección de Datos (www.aepd.es).
      </p>
      <h2>Cookies</h2>
      <p>
        Solo usamos cookies técnicas imprescindibles. No usamos cookies de publicidad ni de analítica, por eso no te
        pedimos aceptarlas.
      </p>
      <p className="muted">Última actualización: {COMPANY.updated}.</p>
    </main>
  );
}
