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

export async function sendMail(mail: Mail): Promise<void> {
  if (override) return override(mail);
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST ?? 'smtp.gmail.com',
    port: Number(process.env.SMTP_PORT ?? 465),
    secure: Number(process.env.SMTP_PORT ?? 465) === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  await transport.sendMail({
    from: process.env.MAIL_FROM ?? `Phisiolutions <${process.env.SMTP_USER}>`,
    to: mail.to,
    subject: mail.subject,
    html: mail.html,
    attachments: mail.attachments,
  });
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
