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
6. **Publicar**: importa el repositorio en [Vercel](https://vercel.com), añade las variables de `.env.example` y conecta el dominio.
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
- Textos legales revisados por un profesional y política de cancelación.
- Las sesiones extra de un paquete se agendan por email; se puede añadir autoagenda más adelante.
