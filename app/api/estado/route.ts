import { getStripe, stripeMode } from '@/lib/stripe';
import { NextResponse } from 'next/server';
import { db, dbConfigured, ensureSchema } from '@/lib/db';
import { verifyMail } from '@/lib/mail';

export const dynamic = 'force-dynamic';

// Diagnóstico: dice qué está configurado, sin mostrar ningún valor secreto.
export async function GET() {
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
