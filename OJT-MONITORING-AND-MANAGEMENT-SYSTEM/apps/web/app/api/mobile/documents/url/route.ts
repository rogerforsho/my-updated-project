import { mobileBffFailure, mobileBffPreamble } from '@/src/lib/mobile-bff';
import { getServiceClient } from '@/src/lib/supabase/service';
import { toPublicSupabaseUrl } from '@/src/lib/supabase/public-url';

export const runtime = 'nodejs';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// A 60-second download link for a document a Coordinator sent to this student.
export async function POST(request: Request) {
  const pre = await mobileBffPreamble(request, { body: { maxBytes: 1024, label: 'Request' } });
  if (pre.response) return pre.response;
  const { actor, body } = pre;
  const documentId = typeof body.document_id === 'string' ? body.document_id : '';
  if (!UUID.test(documentId))
    return mobileBffFailure({ status: 400, code: 'VALIDATION_FAILURE', message: 'Invalid document.' });

  const service = getServiceClient();
  const { data: recipient } = await service.from('coordinator_document_recipients')
    .select('document_id').eq('document_id', documentId).eq('student_user_id', actor.user.id).maybeSingle();
  if (!recipient)
    return mobileBffFailure({ status: 403, code: 'FORBIDDEN', message: 'This document was not sent to you.' });
  const { data: doc } = await service.from('coordinator_documents')
    .select('file_path, file_name').eq('document_id', documentId).maybeSingle();
  if (!doc) return mobileBffFailure({ status: 404, code: 'NOT_FOUND', message: 'Document not found.' });

  const { data, error } = await service.storage.from('private-documents')
    .createSignedUrl(doc.file_path, 60, { download: doc.file_name });
  if (error || !data?.signedUrl)
    return mobileBffFailure({ status: 503, code: 'SERVER_FAILURE', message: 'Could not prepare the download.' });
  return Response.json({ data: { signedUrl: toPublicSupabaseUrl(data.signedUrl) }, error: null },
    { status: 200, headers: { 'Cache-Control': 'no-store' } });
}
