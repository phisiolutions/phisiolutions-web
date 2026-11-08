import { randomBytes } from 'node:crypto';
// Crea reuniones de Zoom con una app "Server-to-Server OAuth" de la cuenta de Phisiolutions.
export function zoomConfigured(): boolean {
  return Boolean(process.env.ZOOM_ACCOUNT_ID && process.env.ZOOM_CLIENT_ID && process.env.ZOOM_CLIENT_SECRET);
}

async function zoomToken(): Promise<string> {
  const basic = Buffer.from(`${process.env.ZOOM_CLIENT_ID}:${process.env.ZOOM_CLIENT_SECRET}`).toString('base64');
  const res = await fetch(
    `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${encodeURIComponent(process.env.ZOOM_ACCOUNT_ID!)}`,
    { method: 'POST', headers: { Authorization: `Basic ${basic}` } },
  );
  if (!res.ok) throw new Error(`Zoom token ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as { access_token: string };
  return json.access_token;
}

export async function createZoomMeeting(opts: {
  topic: string;
  startUtc: string;
  durationMinutes: number;
}): Promise<{ id: string; joinUrl: string }> {
  const token = await zoomToken();
  const res = await fetch('https://api.zoom.us/v2/users/me/meetings', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      topic: opts.topic,
      type: 2,
      start_time: opts.startUtc,
      duration: opts.durationMinutes,
      timezone: 'Europe/Madrid',
      settings: { waiting_room: true, join_before_host: false },
    }),
  });
  if (!res.ok) throw new Error(`Zoom meeting ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as { id: number; join_url: string };
  return { id: String(json.id), joinUrl: json.join_url };
}

/** Enlace de una sala de Jitsi Meet (gratis). El nombre aleatorio hace que nadie pueda adivinarlo. */
export function jitsiMeetingUrl(): string {
  return `https://meet.jit.si/Phisiolutions-${randomBytes(12).toString('hex')}`;
}
