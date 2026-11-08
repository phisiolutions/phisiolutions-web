import { COMPANY } from '@/lib/company';
import { GIFT_VALID_MONTHS } from '@/lib/services';

export const metadata = { title: 'Condiciones de contratación · Phisiolutions' };

export default function Page() {
  return (
    <main className="prose">
      <h1>Condiciones de contratación</h1>
      <p>
        Estas condiciones regulan la contratación de los servicios de {COMPANY.name} ({COMPANY.address.join(', ')}) a
        través de esta web. Los servicios están dirigidos a profesionales y empresas del sector de la salud. Al reservar
        o pagar, aceptas estas condiciones.
      </p>
      <h2>Servicios</h2>
      <p>
        Consultoría y asesoramiento online por videollamada: sesiones informativas, planes de negocio con dosier
        ejecutivo, asesoría para mejorar resultados, marketing y crecimiento del negocio. La descripción y la duración
        de cada servicio figuran en la web. El asesoramiento se basa en la información que nos facilitas; las decisiones
        sobre tu negocio son tuyas y no garantizamos un resultado económico concreto.
      </p>
      <h2>Precios y pago</h2>
      <p>
        Los precios se indican en euros, por sesión o por servicio. [IVA: PENDIENTE DE CONFIRMAR CON EL GESTOR]. El pago
        se hace por adelantado con tarjeta (también Google Pay o Apple Pay) o por transferencia bancaria a través de
        Stripe. Si eliges transferencia, guardamos tu cita durante 3 días hasta recibirla; si no llega, la cita se
        libera. Al confirmarse el pago recibes la factura por email.
      </p>
      <h2>Reserva y videollamada</h2>
      <p>
        La cita queda confirmada cuando se recibe el pago. Te enviamos por email la confirmación y el enlace de la
        videollamada. Si contratas varias sesiones, las siguientes las agendamos contigo por email. Necesitas un
        dispositivo con cámara y conexión a internet.
      </p>
      <h2>Cambios y cancelaciones</h2>
      <ul>
        <li>
          Puedes cambiar la fecha o cancelar sin coste hasta 24 horas antes de la sesión escribiendo a{' '}
          <a href={`mailto:${COMPANY.email}`}>{COMPANY.email}</a>. Si cancelas, te devolvemos el importe íntegro.
        </li>
        <li>
          Con menos de 24 horas de antelación, o si no te conectas, la sesión se considera realizada y no se devuelve.
        </li>
        <li>
          En los planes de negocio y estudios, una vez empezado el trabajo se devuelve solo la parte no realizada.
        </li>
        <li>Si tenemos que cancelar nosotros, te ofrecemos otra fecha o te devolvemos el importe íntegro.</li>
      </ul>
      <h2>Tarjetas regalo</h2>
      <p>
        Cada tarjeta regalo tiene un código de un solo uso, válido durante {GIFT_VALID_MONTHS} meses desde el pago, para
        el servicio indicado en ella. No se puede canjear por dinero. Quien la compra puede pedir su devolución antes de
        que se canjee.
      </p>
      <h2>Confidencialidad</h2>
      <p>
        Tratamos como confidencial la información de tu negocio que compartas con nosotros y solo la usamos para
        prestarte el servicio.
      </p>
      <h2>Ley aplicable</h2>
      <p>
        Estas condiciones se rigen por la ley del Estado de Florida (EE. UU.), sin perjuicio de las normas imperativas
        que te protejan según tu país de residencia. Antes de cualquier reclamación, escríbenos e intentaremos
        resolverlo de forma amistosa.
      </p>
      <p className="muted">Última actualización: {COMPANY.updated}.</p>
    </main>
  );
}
