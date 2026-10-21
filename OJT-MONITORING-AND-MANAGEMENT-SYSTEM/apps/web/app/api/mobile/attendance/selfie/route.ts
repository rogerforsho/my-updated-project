import crypto from 'node:crypto';
import { authenticateMobileStudent, mobileBffFailure } from '@/src/lib/mobile-bff';
import { getServiceClient } from '@/src/lib/supabase/service';
import { authActionLimit } from '@/src/services/auth/internal';
import { readLimitedJson } from '@/src/lib/read-limited-json';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const auth = await authenticateMobileStudent(request);
  if (auth.error) return mobileBffFailure(auth.error);

  const limitError = await authActionLimit('selfie_upload', auth.actor.user.id, 60, 3600, 'user');
  if (limitError) return mobileBffFailure({
    status: limitError.code === 'RATE_LIMITED' ? 429 : 503,
    code: limitError.code,
    message: limitError.message,
  });

  const parsed = await readLimitedJson(request, 16 * 1024);
  if (parsed.error === 'too_large')
    return mobileBffFailure({ status: 413, code: 'VALIDATION_FAILURE', message: 'Upload request is too large.' });
  if (parsed.error)
    return mobileBffFailure({ status: 400, code: 'VALIDATION_FAILURE', message: 'Upload request could not be read.' });
  const body = parsed.data;
  if (!body || typeof body !== 'object' || Array.isArray(body))
    return mobileBffFailure({ status: 400, code: 'VALIDATION_FAILURE', message: 'Invalid upload request.' });

  const input = body as Record<string, unknown>;
  if (input.type !== 'time_in' && input.type !== 'time_out')
    return mobileBffFailure({ status: 400, code: 'VALIDATION_FAILURE', message: 'Invalid attendance upload type.' });
  const uploadId = input.upload_id;
  if (uploadId != null && (typeof uploadId !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(uploadId)))
    return mobileBffFailure({ status: 400, code: 'VALIDATION_FAILURE', message: 'Invalid attendance upload identifier.' });

  const path = typeof uploadId === 'string'
    ? `${auth.actor.studentId}/${input.type}_${uploadId}.jpg`
    : `${auth.actor.studentId}/${input.type}_${Date.now()}_${crypto.randomUUID()}.jpg`;
  const storage = getServiceClient().storage.from('attendance-selfies');
  if (typeof uploadId === 'string') {
    const { data: exists, error: existsError } = await storage.exists(path);
    const missingObject = !exists && [400, 404].includes(existsError?.status ?? -1);
    if (existsError && !missingObject)
      return mobileBffFailure({ status: 503, code: 'SERVER_FAILURE', message: 'Could not check the selfie upload.' });
    if (exists)
      return Response.json({ data: { path, token: null, alreadyUploaded: true }, error: null }, {
        status: 200,
        headers: { 'Cache-Control': 'no-store' },
      });
  }
  const { data, error } = await storage.createSignedUploadUrl(path, { upsert: false });
  if (error || !data?.token)
    return mobileBffFailure({ status: 503, code: 'SERVER_FAILURE', message: 'Could not prepare a secure selfie upload.' });

  return Response.json({ data: { path, token: data.token, alreadyUploaded: false }, error: null }, {
    status: 200,
    headers: { 'Cache-Control': 'no-store' },
  });
}
