import crypto from 'node:crypto';
import { authenticateMobileStudent, mobileBffFailure } from '@/src/lib/mobile-bff';
import { getServiceClient } from '@/src/lib/supabase/service';
import { authActionLimit } from '@/src/services/auth/internal';
import { readLimitedJson } from '@/src/lib/read-limited-json';

export const runtime = 'nodejs';
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set(['.pdf', '.docx', '.doc', '.jpg', '.jpeg', '.png']);

export async function POST(request: Request) {
  const auth = await authenticateMobileStudent(request);
  if (auth.error) return mobileBffFailure(auth.error);

  const limitError = await authActionLimit('report_upload', auth.actor.user.id, 10, 3600, 'user');
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
  const fileName = typeof input.file_name === 'string' ? input.file_name.trim() : '';
  const fileSize = input.file_size;
  const extension = fileName.toLowerCase().match(/\.[^.]+$/)?.[0];
  if (!fileName || fileName.length > 255 || fileName.includes('/') || fileName.includes('\\') ||
      !extension || !ALLOWED_EXTENSIONS.has(extension) || !Number.isSafeInteger(fileSize) ||
      (fileSize as number) < 1 || (fileSize as number) > MAX_FILE_SIZE)
    return mobileBffFailure({ status: 400, code: 'VALIDATION_FAILURE', message: 'Choose a supported document up to 10 MB.' });

  const filePath = `${auth.actor.user.id}/reports/${crypto.randomUUID()}${extension}`;
  const { data, error } = await getServiceClient().storage.from('private-documents')
    .createSignedUploadUrl(filePath, { upsert: false });
  if (error || !data?.token)
    return mobileBffFailure({ status: 503, code: 'SERVER_FAILURE', message: 'Could not prepare a secure document upload.' });

  return Response.json({ data: { filePath, token: data.token }, error: null }, {
    status: 200,
    headers: { 'Cache-Control': 'no-store' },
  });
}
