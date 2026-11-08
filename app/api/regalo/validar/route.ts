import { NextResponse } from 'next/server';
import { checkCode } from '@/lib/gift';
import { getService } from '@/lib/services';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const code = new URL(req.url).searchParams.get('codigo') ?? '';
  try {
    const r = await checkCode(code);
    if ('error' in r) return NextResponse.json({ error: r.error }, { status: 404 });
    const service = getService(r.gift.serviceId);
    return NextResponse.json({
      code: r.gift.code,
      serviceId: r.gift.serviceId,
      serviceName: service?.name ?? '',
      recipientName: r.gift.recipientName,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: 'No hemos podido comprobar el código.' }, { status: 500 });
  }
}
