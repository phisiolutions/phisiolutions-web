# Phisiolutions: web de fisioterapia y consultoría online

Web en Next.js con agenda online, pago con Stripe (tarjeta y transferencia en EUR), factura automática y reunión de Zoom.

## Cómo funciona una reserva

1. El cliente elige servicio, número de sesiones, día y hora (`/reservar`). La hora queda bloqueada 36 minutos.
2. Paga en Stripe Checkout con tarjeta o transferencia bancaria en EUR.
3. Stripe crea la factura en PDF con los datos de Phisiolutions LLC.
4. Al confirmarse el pago, la web crea la reunión de Zoom y envía:
   - al cliente: confirmación, enlace de Zoom, enlace de la factura y el PDF adjunto;
   - a `ADMIN_EMAIL` (phisiolutions@gmail.com): copia con los datos del cliente y el PDF.
5. Si paga por transferencia, la hora se guarda 3 días y el cliente recibe los datos bancarios por email. Al llegar el dinero se hace el paso 4.
6. Stripe ingresa los cobros en la cuenta de Mercury (convertidos a USD).

## Dónde se cambia cada cosa

- Servicios, precios y duraciones: `lib/services.ts`
- Horario, festivos, antelación mínima: `lib/availability.ts` (`AGENDA`)
- Textos de la web: `app/page.tsx`; textos legales: `app/aviso-legal`, `app/privacidad`, `app/condiciones`
- Emails: `lib/booking.ts`

## Puesta en marcha

1. **Stripe**: cuenta a nombre de Phisiolutions LLC. En Ajustes > Datos bancarios, añade la cuenta de Mercury (números de ruta y cuenta que da Mercury). En Ajustes > Información pública, pon nombre, dirección, email y logo (salen en la factura). Activa los métodos de pago "Tarjeta" y "Transferencias bancarias".
2. **Webhook de Stripe**: Desarrolladores > Webhooks > añadir endpoint `https://TU-DOMINIO/api/stripe/webhook` con los eventos `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed` y `checkout.session.expired`. Copia el secreto en `STRIPE_WEBHOOK_SECRET`.
3. **Base de datos**: crea una base gratuita en [Turso](https://turso.tech) y copia la URL y el token.
4. **Zoom** (cuenta de pago, para sesiones de más de 40 min): en marketplace.zoom.us crea una app "Server-to-Server OAuth" con el permiso `meeting:write:meeting:admin` y copia los tres datos.
5. **Email**: en la cuenta de Google de phisiolutions@gmail.com activa la verificación en dos pasos y crea una "contraseña de aplicación" para `SMTP_PASS`.
6. **Publicar en Netlify** (plan gratuito, admite uso comercial):
   1. En [app.netlify.com](https://app.netlify.com) entra con tu cuenta de GitHub y pulsa *Add new project > Import an existing project > GitHub*. Elige este repositorio.
   2. Netlify detecta Next.js y lee `netlify.toml`; no cambies nada y pulsa *Deploy*.
   3. En *Project configuration > Environment variables* añade todas las variables de `.env.example` con tus valores y vuelve a desplegar (*Deploys > Trigger deploy*).
   4. Dominio: en *Domain management > Add a domain* puedes comprarlo en Netlify (pagas al año, sin cuota mensual) o conectar uno comprado en otro sitio. Después pon `SITE_URL` con ese dominio.
7. Prueba primero con claves `sk_test_` y la tarjeta 4242 4242 4242 4242; después cambia a las claves reales.

## Desarrollo

```bash
npm install
cp .env.example .env.local   # rellena al menos STRIPE_SECRET_KEY; DATABASE_URL=file:local.db
npm run dev
npm test
```

Para recibir webhooks en local: `stripe listen --forward-to localhost:3000/api/stripe/webhook`.

## Pendiente

- Duración real de cada servicio (ahora 60 min salvo la sesión de 30).
- IVA y forma de facturar de la LLC a clientes en España: confirmar con el gestor.
- Textos legales revisados por un profesional y política de cancelación. La política de privacidad debe indicar que los datos se guardan en EE. UU. (Turso, Netlify, Stripe) y con qué garantías.
- Las sesiones extra de un paquete se agendan por email; se puede añadir autoagenda más adelante.

## Nota sobre Netlify (plan gratuito)

En un repositorio privado, el plan gratuito de Netlify solo publica commits cuyo autor sea la cuenta de GitHub enlazada (phisiolutions). Los commits deben ir firmados con `352809278+phisiolutions@users.noreply.github.com`; si no, el deploy sale como "Unrecognized Git contributor". Si aun así se bloquea, la alternativa es hacer el repositorio público (no contiene contraseñas: están en Netlify).
