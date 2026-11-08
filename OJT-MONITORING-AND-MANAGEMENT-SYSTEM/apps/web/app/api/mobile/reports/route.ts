import { mobileBffFailure, mobileBffPreamble } from '@/src/lib/mobile-bff';
import { getServiceClient } from '@/src/lib/supabase/service';
import { validateUploadedBytes } from '@/src/lib/uploadValidation';
import { recordAuditEvent } from '@/src/lib/audit';
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
    limit: { action: 'report_submit', max: 10, windowSeconds: 3600 },
    body: { maxBytes: 16 * 1024, label: 'Report request' },
  });
  if (pre.response) return pre.response;
  const { actor, body: input } = pre;
  const reportType = typeof input.report_type === 'string' ? input.report_type.trim() : '';
  const filePath = typeof input.file_path === 'string' ? input.file_path.trim() : '';
  const remarks = typeof input.remarks === 'string' ? input.remarks.trim() : null;
  if (!STUDENT_REPORT_TYPES.includes(reportType) || reportType.length > 100 || !filePath || filePath.length > 2048 ||
      (input.remarks != null && typeof input.remarks !== 'string') || (remarks && remarks.length > 2000))
    return mobileBffFailure({ status: 400, code: 'VALIDATION_FAILURE', message: 'Report type and document are required.' });

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
