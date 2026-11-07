import nodemailer from 'nodemailer';

export interface MailAttachment {
  filename: string;
  content: Buffer;
  contentType?: string;
}

export interface Mail {
  to: string;
  subject: string;
  html: string;
  attachments?: MailAttachment[];
}

export type Mailer = (mail: Mail) => Promise<void>;

let override: Mailer | null = null;

/** Solo para tests. */
export function setMailerForTests(m: Mailer | null) {
  override = m;
}

export function adminEmail(): string {
  return process.env.ADMIN_EMAIL ?? 'phisiolutions@gmail.com';
}

function transport() {
  const port = Number(process.env.SMTP_PORT?.trim() || 465);
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST?.trim() || 'smtp.gmail.com',
    port,
    secure: port === 465,
    auth: { user: process.env.SMTP_USER?.trim(), pass: process.env.SMTP_PASS?.replace(/\s+/g, '') },
  });
}

/** Comprueba que el servidor de correo acepta el usuario y la contraseña. */
export async function verifyMail(): Promise<string> {
  try {
    await transport().verify();
    return 'ok';
  } catch (e) {
    return `error: ${(e as Error).message.slice(0, 200)}`;
  }
}

export async function sendMail(mail: Mail): Promise<void> {
  if (override) return override(mail);
  await transport().sendMail({
    from: process.env.MAIL_FROM?.trim() || `Phisiolutions <${process.env.SMTP_USER?.trim()}>`,
    to: mail.to,
    subject: mail.subject,
    html: mail.html,
    attachments: mail.attachments,
  });
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
