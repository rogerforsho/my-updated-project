import { authenticateMobileStudent, mobileBffFailure } from '@/src/lib/mobile-bff';
import { getServiceClient } from '@/src/lib/supabase/service';
import { authActionLimit } from '@/src/services/auth/internal';
import { validateUploadedBytes } from '@/src/lib/uploadValidation';
import { recordAuditEvent } from '@/src/lib/audit';
import { readLimitedJson } from '@/src/lib/read-limited-json';
import { STUDENT_REPORT_TYPES } from '@ojt/shared';

export const runtime = 'nodejs';

function isHttpsUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password;
  }
  catch { return false; }
}

export async function POST(request: Request) {
  const auth = await authenticateMobileStudent(request);
  if (auth.error) return mobileBffFailure(auth.error);
  const { data: completion, error: completionError } = await auth.actor.supabase.from('certificates')
    .select('certificate_id').eq('student_id', auth.actor.studentId).maybeSingle();
  if (completionError)
    return mobileBffFailure({ status: 503, code: 'SERVER_FAILURE', message: 'Could not check OJT completion.' });
  if (completion)
    return mobileBffFailure({ status: 409, code: 'FORBIDDEN', message: 'Your OJT is completed. Academic records are read-only.' });
  const rateLimitError = await authActionLimit('report_submit', auth.actor.user.id, 10, 3600, 'user');
  if (rateLimitError) return mobileBffFailure({
    status: rateLimitError.code === 'RATE_LIMITED' ? 429 : 503,
    code: rateLimitError.code,
    message: rateLimitError.message,
  });

  const parsed = await readLimitedJson(request, 16 * 1024);
  if (parsed.error === 'too_large')
    return mobileBffFailure({ status: 413, code: 'VALIDATION_FAILURE', message: 'Report request is too large.' });
  if (parsed.error)
    return mobileBffFailure({ status: 400, code: 'VALIDATION_FAILURE', message: 'Report request could not be read.' });
  const body = parsed.data;
  if (!body || typeof body !== 'object' || Array.isArray(body))
    return mobileBffFailure({ status: 400, code: 'VALIDATION_FAILURE', message: 'Invalid report request.' });
  const input = body as Record<string, unknown>;
  const reportType = typeof input.report_type === 'string' ? input.report_type.trim() : '';
  const filePath = typeof input.file_path === 'string' ? input.file_path.trim() : '';
  const remarks = typeof input.remarks === 'string' ? input.remarks.trim() : null;
  if (!STUDENT_REPORT_TYPES.includes(reportType) || reportType.length > 100 || !filePath || filePath.length > 2048 ||
      (input.remarks != null && typeof input.remarks !== 'string') || (remarks && remarks.length > 2000))
    return mobileBffFailure({ status: 400, code: 'VALIDATION_FAILURE', message: 'Report type and document are required.' });

  const { actor } = auth;
  const isLink = isHttpsUrl(filePath);
  const escapedUserId = actor.user.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const isOwnedStoragePath = new RegExp(`^${escapedUserId}/reports/[0-9a-f-]{36}\\.(pdf|docx|doc|jpg|jpeg|png)$`, 'i').test(filePath);
  if (!isLink && !isOwnedStoragePath)
    return mobileBffFailure({ status: 403, code: 'FORBIDDEN', message: 'The document path is not available to this account.' });

  if (!isLink) {
    const { data: file, error: downloadError } = await actor.supabase.storage.from('private-documents').download(filePath);
    if (downloadError || !file)
      return mobileBffFailure({ status: 400, code: 'VALIDATION_FAILURE', message: 'Upload the document again before submitting it.' });
    if (file.size > 10 * 1024 * 1024) {
      await getServiceClient().storage.from('private-documents').remove([filePath]);
      return mobileBffFailure({ status: 400, code: 'VALIDATION_FAILURE', message: 'Document exceeds the 10 MB limit.' });
    }
    const fileName = filePath.split('/').at(-1) || '';
    const checked = validateUploadedBytes(
      new Uint8Array(await file.arrayBuffer()), fileName, file.type,
      ['.pdf', '.docx', '.doc', '.jpg', '.jpeg', '.png'], 10 * 1024 * 1024
    );
    if (checked.error || !checked.data) {
      await getServiceClient().storage.from('private-documents').remove([filePath]);
      return mobileBffFailure({ status: 400, code: 'VALIDATION_FAILURE', message: checked.error?.message || 'Document format is invalid.' });
    }
  }

  const { data: report, error } = await getServiceClient().from('reports').insert({
    student_id: actor.studentId,
    report_type: reportType,
    file_path: filePath,
    status: 'submitted',
    remarks: remarks || null,
  }).select('report_id').single();
  if (error || !report) {
    if (!isLink) await getServiceClient().storage.from('private-documents').remove([filePath]);
    return mobileBffFailure({ status: 503, code: 'SERVER_FAILURE', message: 'Failed to submit report document.' });
  }

  await recordAuditEvent({
    actor_user_id: actor.user.id,
    action: 'REPORT_SUBMITTED',
    entity_type: 'report',
    entity_id: report.report_id,
    details: { report_type: reportType, client: 'mobile' },
  });
  return Response.json({ data: null, error: null }, { status: 200, headers: { 'Cache-Control': 'no-store' } });
}
