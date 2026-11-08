import type { Client } from '@libsql/client';
import { createClient as createHttpClient } from '@libsql/client/http';
import { randomUUID } from 'node:crypto';
import type { BusyInterval } from './availability';

export type BookingStatus = 'pending' | 'awaiting_transfer' | 'confirmed' | 'cancelled';

export interface Booking {
  id: string;
  serviceId: string;
  quantity: number;
  startUtc: string;
  endUtc: string;
  name: string;
  email: string;
  phone: string | null;
  notes: string | null;
  status: BookingStatus;
  holdExpiresUtc: string | null;
  amountCents: number;
  stripeSessionId: string | null;
  stripeInvoiceId: string | null;
  invoicePdfUrl: string | null;
  invoiceUrl: string | null;
  zoomJoinUrl: string | null;
  zoomMeetingId: string | null;
  confirmationSent: number;
  createdAt: string;
}

let client: Client | null = null;
let ready: Promise<void> | null = null;

function makeClient(url: string, authToken?: string): Client {
  if (url.startsWith('file:') || url === ':memory:') {
    // Base de datos local (desarrollo y tests). Se carga solo aquí para no necesitar
    // el módulo nativo de SQLite en Netlify.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createClient } = require('@libsql/client') as typeof import('@libsql/client');
    return createClient({ url });
  }
  // Turso remoto: cliente HTTP puro, funciona en cualquier servidor.
  return createHttpClient({ url: url.replace(/^libsql:\/\//, 'https://'), authToken });
}

export function dbConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

export function db(): Client {
  if (!client) {
    client = makeClient(process.env.DATABASE_URL?.trim() || 'file:local.db', process.env.DATABASE_AUTH_TOKEN?.trim());
  }
  return client;
}

/** Solo para tests: usa una base de datos nueva. */
export function resetDbForTests(url: string) {
  client = makeClient(url);
  ready = null;
}

export async function ensureSchema() {
  if (!ready) {
    ready = db()
      .batch(
        [
          `CREATE TABLE IF NOT EXISTS bookings (
            id TEXT PRIMARY KEY,
            service_id TEXT NOT NULL,
            quantity INTEGER NOT NULL,
            start_utc TEXT NOT NULL,
            end_utc TEXT NOT NULL,
            name TEXT NOT NULL,
            email TEXT NOT NULL,
            phone TEXT,
            notes TEXT,
            status TEXT NOT NULL,
            hold_expires_utc TEXT,
            amount_cents INTEGER NOT NULL,
            stripe_session_id TEXT UNIQUE,
            stripe_invoice_id TEXT,
            invoice_pdf_url TEXT,
            invoice_url TEXT,
            zoom_join_url TEXT,
            zoom_meeting_id TEXT,
            confirmation_sent INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL
          )`,
          `CREATE INDEX IF NOT EXISTS bookings_start ON bookings (start_utc)`,
          `CREATE TABLE IF NOT EXISTS payments (
            id TEXT PRIMARY KEY,
            concept TEXT NOT NULL,
            name TEXT NOT NULL,
            email TEXT NOT NULL,
            amount_cents INTEGER NOT NULL,
            status TEXT NOT NULL,
            stripe_session_id TEXT UNIQUE,
            invoice_pdf_url TEXT,
            invoice_url TEXT,
            email_sent INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL
          )`,
          `CREATE TABLE IF NOT EXISTS gifts (
            id TEXT PRIMARY KEY,
            code TEXT NOT NULL UNIQUE,
            service_id TEXT NOT NULL,
            buyer_name TEXT NOT NULL,
            buyer_email TEXT NOT NULL,
            recipient_name TEXT NOT NULL,
            message TEXT,
            amount_cents INTEGER NOT NULL,
            status TEXT NOT NULL,
            stripe_session_id TEXT UNIQUE,
            invoice_pdf_url TEXT,
            invoice_url TEXT,
            booking_id TEXT,
            email_sent INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            paid_at TEXT,
            expires_at TEXT,
            items TEXT
          )`,
        ],
        'write',
      )
      .then(async () => {
        // Columnas añadidas después de crear las tablas: si ya existen, el error se ignora.
        for (const sql of [`ALTER TABLE gifts ADD COLUMN items TEXT`]) {
          await db()
            .execute(sql)
            .catch(() => {});
        }
      })
      .catch((e) => {
        ready = null; // reintenta en la siguiente petición
        throw e;
      });
  }
  return ready;
}

function rowToBooking(r: Record<string, unknown>): Booking {
  return {
    id: String(r.id),
    serviceId: String(r.service_id),
    quantity: Number(r.quantity),
    startUtc: String(r.start_utc),
    endUtc: String(r.end_utc),
    name: String(r.name),
    email: String(r.email),
    phone: (r.phone as string) ?? null,
    notes: (r.notes as string) ?? null,
    status: r.status as BookingStatus,
    holdExpiresUtc: (r.hold_expires_utc as string) ?? null,
    amountCents: Number(r.amount_cents),
    stripeSessionId: (r.stripe_session_id as string) ?? null,
    stripeInvoiceId: (r.stripe_invoice_id as string) ?? null,
    invoicePdfUrl: (r.invoice_pdf_url as string) ?? null,
    invoiceUrl: (r.invoice_url as string) ?? null,
    zoomJoinUrl: (r.zoom_join_url as string) ?? null,
    zoomMeetingId: (r.zoom_meeting_id as string) ?? null,
    confirmationSent: Number(r.confirmation_sent),
    createdAt: String(r.created_at),
  };
}

const ACTIVE_SQL = `(status IN ('confirmed','awaiting_transfer') OR (status = 'pending' AND hold_expires_utc > ?))`;

/** Reservas que ocupan agenda entre dos instantes UTC. */
export async function busyBetween(fromUtc: string, toUtc: string, nowUtc: string): Promise<BusyInterval[]> {
  await ensureSchema();
  const res = await db().execute({
    sql: `SELECT start_utc, end_utc FROM bookings WHERE ${ACTIVE_SQL} AND end_utc > ? AND start_utc < ?`,
    args: [nowUtc, fromUtc, toUtc],
  });
  return res.rows.map((r) => ({ startUtc: String(r.start_utc), endUtc: String(r.end_utc) }));
}

export interface NewBooking {
  serviceId: string;
  quantity: number;
  startUtc: string;
  endUtc: string;
  name: string;
  email: string;
  phone?: string | null;
  notes?: string | null;
  amountCents: number;
  holdExpiresUtc: string;
}

/**
 * Crea una reserva "pending" solo si el hueco sigue libre.
 * Comprobación y escritura van en la misma transacción para evitar dobles reservas.
 */
export async function createPendingBooking(
  b: NewBooking,
  nowUtc: string,
  bufferMinutes: number,
): Promise<Booking | null> {
  await ensureSchema();
  const tx = await db().transaction('write');
  try {
    const startMinusBuffer = new Date(Date.parse(b.startUtc) - bufferMinutes * 60000).toISOString();
    const endPlusBuffer = new Date(Date.parse(b.endUtc) + bufferMinutes * 60000).toISOString();
    const clash = await tx.execute({
      sql: `SELECT id FROM bookings WHERE ${ACTIVE_SQL} AND end_utc > ? AND start_utc < ? LIMIT 1`,
      args: [nowUtc, startMinusBuffer, endPlusBuffer],
    });
    if (clash.rows.length > 0) {
      await tx.rollback();
      return null;
    }
    const id = randomUUID();
    await tx.execute({
      sql: `INSERT INTO bookings (id, service_id, quantity, start_utc, end_utc, name, email, phone, notes, status,
              hold_expires_utc, amount_cents, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)`,
      args: [
        id,
        b.serviceId,
        b.quantity,
        b.startUtc,
        b.endUtc,
        b.name,
        b.email,
        b.phone ?? null,
        b.notes ?? null,
        b.holdExpiresUtc,
        b.amountCents,
        nowUtc,
      ],
    });
    await tx.commit();
    return (await getBooking(id))!;
  } catch (e) {
    await tx.rollback().catch(() => {});
    throw e;
  }
}

export async function getBooking(id: string): Promise<Booking | null> {
  await ensureSchema();
  const res = await db().execute({ sql: `SELECT * FROM bookings WHERE id = ?`, args: [id] });
  return res.rows[0] ? rowToBooking(res.rows[0] as Record<string, unknown>) : null;
}

export async function getBookingBySession(sessionId: string): Promise<Booking | null> {
  await ensureSchema();
  const res = await db().execute({ sql: `SELECT * FROM bookings WHERE stripe_session_id = ?`, args: [sessionId] });
  return res.rows[0] ? rowToBooking(res.rows[0] as Record<string, unknown>) : null;
}

const COLUMN: Record<string, string> = {
  status: 'status',
  holdExpiresUtc: 'hold_expires_utc',
  stripeSessionId: 'stripe_session_id',
  stripeInvoiceId: 'stripe_invoice_id',
  invoicePdfUrl: 'invoice_pdf_url',
  invoiceUrl: 'invoice_url',
  zoomJoinUrl: 'zoom_join_url',
  zoomMeetingId: 'zoom_meeting_id',
  confirmationSent: 'confirmation_sent',
};

export async function updateBooking(id: string, patch: Partial<Booking>) {
  await ensureSchema();
  const keys = Object.keys(patch).filter((k) => COLUMN[k]);
  if (keys.length === 0) return;
  const sets = keys.map((k) => `${COLUMN[k]} = ?`).join(', ');
  const args = keys.map((k) => (patch as Record<string, unknown>)[k] as string | number | null);
  await db().execute({ sql: `UPDATE bookings SET ${sets} WHERE id = ?`, args: [...args, id] });
}

/**
 * Cambia el estado solo si el actual es uno de los esperados.
 * Devuelve true si este proceso hizo el cambio (sirve para no repetir acciones si Stripe reenvía un evento).
 */
export async function transitionStatus(id: string, from: BookingStatus[], to: BookingStatus): Promise<boolean> {
  await ensureSchema();
  const placeholders = from.map(() => '?').join(',');
  const res = await db().execute({
    sql: `UPDATE bookings SET status = ? WHERE id = ? AND status IN (${placeholders})`,
    args: [to, id, ...from],
  });
  return res.rowsAffected > 0;
}
