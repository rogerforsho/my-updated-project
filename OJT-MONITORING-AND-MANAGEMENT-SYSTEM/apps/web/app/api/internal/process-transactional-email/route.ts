import { timingSafeEqual } from 'node:crypto';
import { processTransactionalEmailQueue } from '@/src/lib/email/process-queue';

export const runtime = 'nodejs';
export const maxDuration = 60;

function sameSecret(provided: string, expected: string): boolean {
  const left = Buffer.from(provided);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return Response.json({ error: 'Worker is not configured.' }, { status: 503 });
  if (!sameSecret(request.headers.get('authorization') || '', `Bearer ${secret}`))
    return Response.json({ error: 'Unauthorized.' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });

  const result = await processTransactionalEmailQueue();
  if (!result)
    return Response.json({ error: 'Queue is temporarily unavailable.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });

  return Response.json(result, { status: 200, headers: { 'Cache-Control': 'no-store' } });
}
