import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';

export const metadata: Metadata = {
  title: 'Phisiolutions: fisioterapia y consultoría online',
  description:
    'Sesiones de fisioterapia y asesoramiento de salud por videollamada, y consultoría para fisioterapeutas que quieren abrir su consulta.',
  icons: { icon: '/logo.png' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800&display=swap" rel="stylesheet" />
      </head>
      <body>
        <header className="site-header">
          <div className="container header-row">
            <Link href="/" aria-label="Phisiolutions, inicio">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.png" alt="Phisiolutions" className="logo" />
            </Link>
            <nav aria-label="Principal" className="nav">
              <Link href="/#pacientes">Pacientes</Link>
              <Link href="/#profesionales">Profesionales</Link>
              <Link href="/#como-funciona">Cómo funciona</Link>
              <Link href="/#sobre-nosotros">Sobre nosotros</Link>
              <Link href="/reservar" className="btn btn-accent">Reservar cita</Link>
            </nav>
          </div>
        </header>
        {children}
        <footer className="site-footer">
          <div className="container footer-row">
            <span>© {new Date().getFullYear()} Phisiolutions LLC</span>
            <nav aria-label="Legal" className="footer-nav">
              <Link href="/aviso-legal">Aviso legal</Link>
              <Link href="/privacidad">Privacidad</Link>
              <Link href="/condiciones">Condiciones de contratación</Link>
            </nav>
          </div>
        </footer>
      </body>
    </html>
  );
}
