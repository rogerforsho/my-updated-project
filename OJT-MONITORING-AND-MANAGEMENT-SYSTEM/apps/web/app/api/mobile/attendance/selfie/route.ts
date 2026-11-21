import crypto from 'node:crypto';
import { mobileBffFailure, mobileBffPreamble } from '@/src/lib/mobile-bff';
import { getServiceClient } from '@/src/lib/supabase/service';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const pre = await mobileBffPreamble(request, {
    limit: { action: 'selfie_upload', max: 60, windowSeconds: 3600 },
    body: { maxBytes: 16 * 1024, label: 'Upload request' },
  });
  if (pre.response) return pre.response;
  const { actor } = pre;
  const input = pre.body;
  if (input.type !== 'time_in' && input.type !== 'time_out')
    return mobileBffFailure({ status: 400, code: 'VALIDATION_FAILURE', message: 'Invalid attendance upload type.' });
  const uploadId = input.upload_id;
  if (uploadId != null && (typeof uploadId !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(uploadId)))
    return mobileBffFailure({ status: 400, code: 'VALIDATION_FAILURE', message: 'Invalid attendance upload identifier.' });

  const path = typeof uploadId === 'string'
    ? `${actor.studentId}/${input.type}_${uploadId}.jpg`
    : `${actor.studentId}/${input.type}_${Date.now()}_${crypto.randomUUID()}.jpg`;
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
