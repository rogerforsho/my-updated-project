import { mobileBffFailure, mobileBffPreamble } from '@/src/lib/mobile-bff';
import { getServiceClient } from '@/src/lib/supabase/service';
import { validateUploadedBytes } from '@/src/lib/uploadValidation';
import { recordAuditEvent } from '@/src/lib/audit';
import { BUNDLE_EXTENSIONS, BUNDLE_MAX_BYTES, STUDENT_REPORT_TYPES, WEEKLY_JOURNAL_MAX_BYTES, WEEKLY_JOURNAL_TYPE } from '@ojt/shared';

export const runtime = 'nodejs';

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

  // PDF only: links and other formats cannot be checked or merged into the compiled journals.
  const escapedUserId = actor.user.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const isOwnedStoragePath = new RegExp(`^${escapedUserId}/reports/[0-9a-f-]{36}\\.pdf$`, 'i').test(filePath);
  if (!isOwnedStoragePath)
    return mobileBffFailure({ status: 403, code: 'FORBIDDEN', message: 'Upload a PDF file before submitting.' });

  const maxBytes = reportType === WEEKLY_JOURNAL_TYPE ? WEEKLY_JOURNAL_MAX_BYTES : BUNDLE_MAX_BYTES;
  const { data: file, error: downloadError } = await actor.supabase.storage.from('private-documents').download(filePath);
  if (downloadError || !file)
    return mobileBffFailure({ status: 400, code: 'VALIDATION_FAILURE', message: 'Upload the document again before submitting it.' });
  if (file.size > maxBytes) {
    await getServiceClient().storage.from('private-documents').remove([filePath]);
    return mobileBffFailure({ status: 400, code: 'VALIDATION_FAILURE', message: `PDF exceeds the ${maxBytes / (1024 * 1024)} MB limit for this document.` });
  }
  const fileName = filePath.split('/').at(-1) || '';
  const checked = validateUploadedBytes(new Uint8Array(await file.arrayBuffer()), fileName, file.type, BUNDLE_EXTENSIONS, maxBytes);
  if (checked.error || !checked.data) {
    await getServiceClient().storage.from('private-documents').remove([filePath]);
    return mobileBffFailure({ status: 400, code: 'VALIDATION_FAILURE', message: checked.error?.message || 'Document format is invalid.' });
  }

  const { data: report, error } = await getServiceClient().from('reports').insert({
    student_id: actor.studentId,
    report_type: reportType,
    file_path: filePath,
    status: 'submitted',
    remarks: remarks || null,
  }).select('report_id').single();
  if (error || !report) {
    await getServiceClient().storage.from('private-documents').remove([filePath]);
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
