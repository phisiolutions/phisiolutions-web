import { NextResponse } from 'next/server';
import { db, dbConfigured, ensureSchema } from '@/lib/db';

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
  const stripeModo = process.env.STRIPE_SECRET_KEY?.startsWith('sk_live')
    ? 'real'
    : process.env.STRIPE_SECRET_KEY?.startsWith('sk_test')
      ? 'pruebas'
      : 'sin configurar';
  return NextResponse.json({ baseDeDatos, stripeModo, configuradas });
}
