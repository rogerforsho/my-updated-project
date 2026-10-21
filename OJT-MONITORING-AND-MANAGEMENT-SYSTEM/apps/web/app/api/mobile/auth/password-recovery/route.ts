import { requestPasswordReset } from '@/src/services/auth/password-recovery';
import { readLimitedJson } from '@/src/lib/read-limited-json';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const parsed = await readLimitedJson(request, 2048);
  if (parsed.error || !parsed.data || typeof parsed.data !== 'object' || Array.isArray(parsed.data))
    return Response.json({ data: null, error: { code: 'VALIDATION_FAILURE', message: 'Enter a valid email address.' } }, { status: 400 });

  const email = (parsed.data as Record<string, unknown>).email;
  if (typeof email !== 'string')
    return Response.json({ data: null, error: { code: 'VALIDATION_FAILURE', message: 'Enter a valid email address.' } }, { status: 400 });

  const result = await requestPasswordReset(email, 'Student');
  const status = result.error?.code === 'RATE_LIMITED' ? 429 : result.error ? 503 : 200;
  return Response.json(result, { status, headers: { 'Cache-Control': 'no-store' } });
}
