import Link from 'next/link';
import { SERVICES, formatEuros } from '@/lib/services';

export default function Home() {
  const pacientes = SERVICES.filter((s) => s.audience === 'pacientes');
  const profesionales = SERVICES.filter((s) => s.audience === 'profesionales');

  return (
    <main>
      <section className="section section-sky" id="inicio">
        <div className="container hero">
          <div className="hero-copy">
            <p className="eyebrow">Fisioterapia y consultoría online</p>
            <h1>Tu recuperación y tu proyecto, guiados por fisioterapeutas, estés donde estés.</h1>
            <p className="lead">
              Sesiones por videollamada para pacientes y asesoría para profesionales que quieren abrir su propia
              consulta. Reserva y paga en un minuto.
            </p>
            <div className="actions">
              <Link href="/#pacientes" className="btn btn-accent">
                Soy paciente
              </Link>
              <Link href="/#profesionales" className="btn btn-outline">
                Soy profesional
              </Link>
            </div>
          </div>
          <div className="hero-card" aria-label="Ejemplo de reserva">
            <span className="tag">Así queda tu reserva</span>
            <h3 style={{ fontSize: 24 }}>Fisioterapia online · 60 min</h3>
            <p className="muted">Día y hora que elijas en la agenda</p>
            <p className="muted">Enlace de Zoom y factura en tu email</p>
            <div className="total">
              <span>Por sesión</span>
              <strong>50 €</strong>
            </div>
          </div>
        </div>
      </section>

      <section className="section" id="pacientes">
        <div className="container">
          <div className="section-head">
            <p className="eyebrow">Para pacientes</p>
            <h2>Asesoramiento de salud y recuperación funcional</h2>
            <p className="lead">
              Un fisioterapeuta colegiado valora tu caso, te guía en los ejercicios y te prepara un plan de recuperación
              a tu medida, sin salir de casa.
            </p>
          </div>
          <div className="grid">
            {pacientes.map((s) => (
              <div key={s.id} className={`card${s.highlight ? ' card-featured' : ''}`}>
                {s.highlight && <span className="tag">{s.highlight}</span>}
                <h3>{s.name}</h3>
                <p className="grow">{s.description}</p>
                <span className="price">{formatEuros(s.priceCents)}</span>
                <Link href={`/reservar?servicio=${s.id}`} className="btn btn-outline">
                  Reservar
                </Link>
              </div>
            ))}
          </div>
          <p className="note">Precios por sesión. Puedes reservar varias sesiones en la misma compra.</p>
        </div>
      </section>

      <section className="section section-dark" id="profesionales">
        <div className="container">
          <div className="section-head">
            <p className="eyebrow">Para profesionales de la salud</p>
            <h2>Monta tu consulta o haz crecer la que ya tienes</h2>
            <p className="lead">
              Plan de negocio, estudio de viabilidad, requisitos legales y normativa vigente para cada modalidad:
              consulta propia, domicilio, empresa, online o centro multidisciplinar. Y si ya ejerces, te ayudamos a
              formarte en lo que pide el mercado, darte a conocer y aumentar tu volumen de negocio.
            </p>
          </div>
          <div className="grid">
            {profesionales.map((s) => (
              <div key={s.id} className={s.highlight ? 'card' : 'card card-dark'}>
                {s.highlight && <span className="tag">{s.highlight}</span>}
                <h3>{s.name}</h3>
                <p className="grow">{s.description}</p>
                <span className="price">{formatEuros(s.priceCents)}</span>
                {s.gift ? (
                  <Link href="/regalo" className="btn btn-accent">
                    {s.priceCents !== null ? 'Regalar' : 'Canjear un código'}
                  </Link>
                ) : s.priceCents !== null ? (
                  <Link
                    href={`/reservar?servicio=${s.id}`}
                    className={s.highlight ? 'btn btn-accent' : 'btn btn-outline'}
                  >
                    Reservar
                  </Link>
                ) : null}
              </div>
            ))}
          </div>
          <div className="chips">
            {[
              'Colegiación y seguro',
              'Autorización sanitaria',
              'Licencia de actividad',
              'Autónomo o sociedad profesional',
              'Protección de datos',
              'Viabilidad a 3 años',
            ].map((c) => (
              <span key={c} className="chip">
                {c}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section className="section section-sky" id="como-funciona">
        <div className="container">
          <div className="section-head">
            <h2>Cómo funciona</h2>
          </div>
          <div className="grid">
            {[
              ['Elige tu servicio', 'Con su precio publicado y el número de sesiones que quieras.'],
              ['Reserva día y hora', 'En la agenda online, con los huecos disponibles en tiempo real.'],
              ['Paga online', 'Con tarjeta o transferencia. Recibes la factura por email.'],
              ['Conéctate por Zoom', 'El enlace llega a tu email. Solo necesitas móvil u ordenador.'],
            ].map(([t, d], i) => (
              <div key={t} className="card">
                <span className="step-num">{i + 1}</span>
                <h3>{t}</h3>
                <p>{d}</p>
              </div>
            ))}
          </div>
          <div className="actions" style={{ marginTop: 32 }}>
            <Link href="/reservar" className="btn btn-accent">
              Reservar cita
            </Link>
          </div>
        </div>
      </section>

      <section className="section" id="sobre-nosotros">
        <div className="container two-col">
          <div>
            <h2 style={{ marginBottom: 16 }}>Sobre nosotros</h2>
            <p className="lead">
              Phisiolutions es una empresa de fisioterapia y consultoría sanitaria online. Nacimos para acercar la
              fisioterapia y la gestión sanitaria a quien la necesita, sin desplazamientos.
            </p>
            <p>
              A los pacientes les ofrecemos valoración, seguimiento y planes de recuperación por videollamada, siempre a
              cargo de fisioterapeutas colegiados. A los profesionales de la salud les acompañamos en la apertura de su
              consulta: plan de negocio, requisitos legales, viabilidad y normativa.
            </p>
          </div>
          <div>
            <h2 style={{ fontSize: 28, marginBottom: 8 }}>Preguntas frecuentes</h2>
            <details>
              <summary>¿Qué necesito para la sesión online?</summary>
              <p>Un móvil u ordenador con cámara y un espacio donde moverte con comodidad.</p>
            </details>
            <details>
              <summary>¿Cómo puedo pagar?</summary>
              <p>
                Con tarjeta o por transferencia bancaria. Si eliges transferencia, guardamos tu cita unos días hasta
                recibirla.
              </p>
            </details>
            <details>
              <summary>¿Recibo factura?</summary>
              <p>Sí. Al pagar te enviamos la factura en PDF por email y puedes descargarla cuando quieras.</p>
            </details>
            <details>
              <summary>¿Puedo cambiar o cancelar mi cita?</summary>
              <p>[POLÍTICA DE CANCELACIÓN Y REEMBOLSO]</p>
            </details>
            <details>
              <summary>¿Tengo que estar colegiado para abrir mi consulta?</summary>
              <p>Sí, la colegiación es obligatoria para ejercer en España, en el colegio de tu comunidad autónoma.</p>
            </details>
          </div>
        </div>
      </section>
    </main>
  );
}
