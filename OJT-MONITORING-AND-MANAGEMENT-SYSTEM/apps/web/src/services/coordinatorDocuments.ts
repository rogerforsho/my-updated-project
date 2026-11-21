'use server';

import { getTrustedActor } from '@/src/lib/trusted-actor';
import { getServiceClient } from '@/src/lib/supabase/service';
import { departmentScope } from '@/src/lib/department-scope';
import { finalizeChatAttachment } from '@/src/services/chatAttachments';
import { toPublicSupabaseUrl } from '@/src/lib/supabase/public-url';
import type { AppResult } from '@ojt/shared';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * The browser has already uploaded the file with createChatAttachmentUpload. This validates the
 * bytes, then records the document and notifies the recipients. studentUserIds null = whole department.
 */
export async function sendCoordinatorDocument(input: {
  department: string;
  title: string;
  pendingPath: string;
  file_name: string;
  studentUserIds: string[] | null;
}): Promise<AppResult<{ recipientCount: number }>> {
  const title = String(input?.title ?? '').trim();
  const ids = input.studentUserIds;
  if (!title || title.length > 200)
    return { data: null, error: { code: 'VALIDATION_FAILURE', message: 'Give the document a title up to 200 characters.' } };
  if (ids !== null && (!Array.isArray(ids) || !ids.length || ids.length > 500 || !ids.every(id => UUID.test(String(id)))))
    return { data: null, error: { code: 'VALIDATION_FAILURE', message: 'Choose at least one student.' } };

  const { supabase, user, profile } = await getTrustedActor();
  if (!user || profile?.role !== 'Coordinator')
    return { data: null, error: { code: 'FORBIDDEN', message: 'Only OJT Coordinators can send documents.' } };
  const scope = await departmentScope(supabase, user.id, 'Coordinator');
  if (scope.error || !scope.departments.includes(input.department))
    return { data: null, error: { code: 'FORBIDDEN', message: 'You can only send documents to your own department.' } };
  // No limiter here: every send needs an upload slot, which createChatAttachmentUpload already limits.
  const file = await finalizeChatAttachment({ pendingPath: input.pendingPath, file_name: input.file_name });
  if (file.error || !file.data) return { data: null, error: file.error ?? { code: 'SERVER_FAILURE', message: 'The file could not be checked.' } };

  const { data, error } = await getServiceClient().rpc('send_coordinator_document', {
    p_sender: user.id, p_department: input.department, p_title: title,
    p_path: file.data.path, p_name: file.data.name, p_student_user_ids: ids,
  });
  if (error) {
    // The checked file stays in chat/<user>/ unreferenced; acceptable until a storage sweep exists.
    return { data: null, error: { code: error.code === '22023' ? 'VALIDATION_FAILURE' : 'SERVER_FAILURE',
      message: error.code === '22023' ? 'Recipients must be active students of this department.' : 'The document could not be sent. Please try again.' } };
  }
  const row = Array.isArray(data) ? data[0] : data;
  return { data: { recipientCount: Number(row?.recipient_count ?? 0) }, error: null };
}

/** A 60-second download link, only for a Coordinator of the document's department (RLS read). */
export async function getCoordinatorDocumentUrl(documentId: string): Promise<AppResult<{ signedUrl: string }>> {
  if (!UUID.test(String(documentId ?? '')))
    return { data: null, error: { code: 'VALIDATION_FAILURE', message: 'Invalid document.' } };
  const { supabase, user, profile } = await getTrustedActor();
  if (!user || profile?.role !== 'Coordinator')
    return { data: null, error: { code: 'FORBIDDEN', message: 'Only OJT Coordinators can open this document.' } };
  const { data: doc } = await supabase.from('coordinator_documents')
    .select('file_path, file_name').eq('document_id', documentId).maybeSingle();
  if (!doc) return { data: null, error: { code: 'NOT_FOUND', message: 'Document not found.' } };
  const { data, error } = await getServiceClient().storage.from('private-documents')
    .createSignedUrl(doc.file_path, 60, { download: doc.file_name });
  if (error || !data?.signedUrl)
    return { data: null, error: { code: 'SERVER_FAILURE', message: 'Failed to generate a secure download link.' } };
  return { data: { signedUrl: toPublicSupabaseUrl(data.signedUrl) }, error: null };
}
