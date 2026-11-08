import crypto from 'node:crypto';
import { mobileBffFailure, mobileBffPreamble } from '@/src/lib/mobile-bff';
import { getServiceClient } from '@/src/lib/supabase/service';

export const runtime = 'nodejs';
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set(['.pdf', '.docx', '.doc', '.jpg', '.jpeg', '.png']);

export async function POST(request: Request) {
  const pre = await mobileBffPreamble(request, {
    beforeLimit: async (actor) => {
      const { data: completion, error: completionError } = await actor.supabase.from('certificates')
        .select('certificate_id').eq('student_id', actor.studentId).maybeSingle();
      if (completionError)
        return mobileBffFailure({ status: 503, code: 'SERVER_FAILURE', message: 'Could not check OJT completion.' });
      if (completion)
        return mobileBffFailure({ status: 409, code: 'FORBIDDEN', message: 'Your OJT is completed. Academic records are read-only.' });
      return null;
    },
    limit: { action: 'report_upload', max: 10, windowSeconds: 3600 },
    body: { maxBytes: 16 * 1024, label: 'Upload request' },
  });
  if (pre.response) return pre.response;
  const { actor, body: input } = pre;
  const fileName = typeof input.file_name === 'string' ? input.file_name.trim() : '';
  const fileSize = input.file_size;
  const extension = fileName.toLowerCase().match(/\.[^.]+$/)?.[0];
  if (!fileName || fileName.length > 255 || fileName.includes('/') || fileName.includes('\\') ||
      !extension || !ALLOWED_EXTENSIONS.has(extension) || !Number.isSafeInteger(fileSize) ||
      (fileSize as number) < 1 || (fileSize as number) > MAX_FILE_SIZE)
    return mobileBffFailure({ status: 400, code: 'VALIDATION_FAILURE', message: 'Choose a supported document up to 10 MB.' });

  const filePath = `${actor.user.id}/reports/${crypto.randomUUID()}${extension}`;
  const { data, error } = await getServiceClient().storage.from('private-documents')
    .createSignedUploadUrl(filePath, { upsert: false });
  if (error || !data?.token)
    return mobileBffFailure({ status: 503, code: 'SERVER_FAILURE', message: 'Could not prepare a secure document upload.' });

  return Response.json({ data: { filePath, token: data.token }, error: null }, {
    status: 200,
    headers: { 'Cache-Control': 'no-store' },
  });
}
