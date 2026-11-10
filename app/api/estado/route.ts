import { getStripe, stripeMode } from '@/lib/stripe';
import { NextResponse } from 'next/server';
import { db, dbConfigured, ensureSchema } from '@/lib/db';
import { verifyMail } from '@/lib/mail';
import { cookies } from 'next/headers';
import { ADMIN_COOKIE, isAdminToken } from '@/lib/admin';

export const dynamic = 'force-dynamic';

// Diagnóstico: dice qué está configurado, sin mostrar ningún valor secreto.
// El detalle solo se muestra con la sesión de /admin iniciada.
export async function GET() {
  const jar = await cookies();
  if (!isAdminToken(jar.get(ADMIN_COOKIE)?.value)) {
    return NextResponse.json({ web: 'ok', detalle: 'Inicia sesión en /admin para ver el diagnóstico completo.' });
  }
  const vars = [
    'SITE_URL',
    'DATABASE_URL',
    'DATABASE_AUTH_TOKEN',
    'STRIPE_SECRET_KEY',
    'STRIPE_WEBHOOK_SECRET',
    'SMTP_USER',
    'SMTP_PASS',
    'ADMIN_EMAIL',
    'ZOOM_ACCOUNT_ID',
    'ADMIN_PASSWORD',
  ];
  const configuradas = Object.fromEntries(vars.map((v) => [v, Boolean(process.env[v]?.trim())]));
  let baseDeDatos = 'sin configurar';
  if (dbConfigured()) {
    try {
      await ensureSchema();
      await db().execute('SELECT 1');
      baseDeDatos = 'ok';
    } catch (e) {
      baseDeDatos = `error: ${(e as Error).message.slice(0, 200)}`;
    }
  }
  const stripeModo = stripeMode();
  let stripeConexion = 'sin configurar';
  if (stripeModo !== 'sin configurar') {
    try {
      await getStripe().customers.list({ limit: 1 });
      stripeConexion = 'ok';
    } catch (e) {
      stripeConexion = `error: ${(e as Error).message.slice(0, 200)}`;
    }
  }
  const correo = process.env.SMTP_USER && process.env.SMTP_PASS ? await verifyMail() : 'sin configurar';
  return NextResponse.json({ baseDeDatos, correo, stripeModo, stripeConexion, configuradas });
}
