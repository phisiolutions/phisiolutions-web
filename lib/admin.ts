import { createHmac, timingSafeEqual } from 'node:crypto';

export const ADMIN_COOKIE = 'phisio_admin';

export function adminConfigured(): boolean {
  return Boolean(process.env.ADMIN_PASSWORD?.trim());
}

/** Valor de la cookie de sesión: depende de la contraseña, así que cambiarla cierra todas las sesiones. */
export function adminToken(): string | null {
  const pw = process.env.ADMIN_PASSWORD?.trim();
  if (!pw) return null;
  return createHmac('sha256', pw).update('phisiolutions-admin').digest('hex');
}

function same(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function checkPassword(input: string): boolean {
  const pw = process.env.ADMIN_PASSWORD?.trim();
  return Boolean(pw) && same(input.trim(), pw!);
}

export function isAdminToken(value: string | undefined): boolean {
  const t = adminToken();
  return Boolean(t && value && same(value, t));
}
