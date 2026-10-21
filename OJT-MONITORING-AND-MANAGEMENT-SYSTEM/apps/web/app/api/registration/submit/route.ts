import { registerStudent } from '@/src/services/auth/registration';
import { readLimitedJson } from '@/src/lib/read-limited-json';
import type { RegisterStudentInput } from '@ojt/shared';

export const runtime = 'nodejs';
const MAX_BODY = 16 * 1024;

export async function POST(request: Request) {
  const parsed = await readLimitedJson(request, MAX_BODY);
  if (parsed.error === 'too_large')
    return Response.json({ data: null, error: { code: 'VALIDATION_FAILURE', message: 'Registration request is too large.' } }, { status: 413 });
  if (parsed.error)
    return Response.json({ data: null, error: { code: 'VALIDATION_FAILURE', message: 'Registration request could not be read.' } }, { status: 400 });

  try {
    const result = await registerStudent(parsed.data as RegisterStudentInput);
    const status = result.error?.code === 'DUPLICATE_REQUEST' ? 409
      : result.error?.code === 'FORBIDDEN' ? 403
        : result.error?.code === 'RATE_LIMITED' ? 429
          : result.error?.code === 'SERVER_FAILURE' ? 503
            : result.error ? 400 : 200;
    return Response.json(result, { status, headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json({ data: null, error: { code: 'VALIDATION_FAILURE', message: 'Registration request could not be read.' } }, { status: 400 });
  }
}
