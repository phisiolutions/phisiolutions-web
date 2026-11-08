import { NextResponse } from 'next/server';
import { ADMIN_COOKIE, adminToken, checkPassword } from '@/lib/admin';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const form = await req.formData();
  const next = new URL('/admin/enlace', req.url);
  if (!checkPassword(String(form.get('password') ?? ''))) {
    await new Promise((r) => setTimeout(r, 800)); // frena intentos repetidos
    next.searchParams.set('error', '1');
    return NextResponse.redirect(next, 303);
  }
  const res = NextResponse.redirect(next, 303);
  res.cookies.set(ADMIN_COOKIE, adminToken()!, {
    httpOnly: true,
    secure: next.protocol === 'https:',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 180, // 6 meses
  });
  return res;
}
