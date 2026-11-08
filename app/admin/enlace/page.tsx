import { cookies } from 'next/headers';
import { ADMIN_COOKIE, adminConfigured, isAdminToken } from '@/lib/admin';
import LinkMaker from './LinkMaker';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'Enlace de pago · Phisiolutions',
  robots: { index: false, follow: false },
};

export default async function EnlacePage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const logged = isAdminToken((await cookies()).get(ADMIN_COOKIE)?.value);
  const site = (process.env.SITE_URL ?? 'http://localhost:3000').replace(/\/$/, '');

  return (
    <main className="section-sky">
      <div className="container" style={{ maxWidth: 720, paddingTop: 48, paddingBottom: 80 }}>
        <h1 style={{ fontSize: 36, marginBottom: 20 }}>Crear enlace de pago</h1>
        {!adminConfigured() ? (
          <section className="panel">
            <p style={{ margin: 0 }}>
              Falta la variable <strong>ADMIN_PASSWORD</strong> en Netlify. Añádela y vuelve a publicar la web.
            </p>
          </section>
        ) : logged ? (
          <LinkMaker site={site} />
        ) : (
          <form className="panel" method="post" action="/api/admin/login">
            <label className="field">
              Contraseña
              <input type="password" name="password" required autoComplete="current-password" autoFocus />
            </label>
            {error && (
              <p className="error" role="alert">
                Contraseña incorrecta.
              </p>
            )}
            <button type="submit" className="btn btn-accent">
              Entrar
            </button>
            <p className="muted" style={{ margin: 0 }}>
              Este dispositivo recordará la sesión durante 6 meses.
            </p>
          </form>
        )}
      </div>
    </main>
  );
}
