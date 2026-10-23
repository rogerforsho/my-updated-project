'use server';

import crypto from 'node:crypto';
import { getTrustedActor } from '@/src/lib/trusted-actor';
import { getServiceClient } from '@/src/lib/supabase/service';
import { authActionLimit } from '@/src/services/auth/internal';
import { validateUploadedBytes } from '@/src/lib/uploadValidation';
import { toPublicSupabaseUrl } from '@/src/lib/supabase/public-url';
import type { AppResult } from '@ojt/shared';

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const ALLOWED_EXTENSIONS = ['.pdf', '.docx', '.doc', '.jpg', '.jpeg', '.png'] as const;
const BUCKET = 'private-documents';
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';

async function chatActor() {
  const { user, profile } = await getTrustedActor();
  if (!user || !profile || !['Coordinator', 'Supervisor'].includes(profile.role)) return null;
  return user;
}

const forbidden = { code: 'FORBIDDEN' as const, message: 'Only OJT Coordinators and Supervisors can use chat attachments.' };

function extensionOf(fileName: string) {
  const extension = fileName.toLowerCase().match(/\.[^.]+$/)?.[0];
  return extension && ALLOWED_EXTENSIONS.includes(extension as typeof ALLOWED_EXTENSIONS[number]) ? extension : null;
}

/**
 * Step 1: a one-use upload slot under chat-pending/<user id>/. Bytes go from the browser to
 * Storage; nothing in chat-pending/ is ever attachable until finalizeChatAttachment accepts it.
 */
export async function createChatAttachmentUpload(input: {
  file_name: string;
  file_size: number;
}): Promise<AppResult<{ pendingPath: string; token: string }>> {
  const extension = extensionOf(String(input?.file_name ?? ''));
  if (!extension) return { data: null, error: { code: 'VALIDATION_FAILURE', message: 'Attach a PDF, DOCX, DOC, JPG or PNG file.' } };
  if (!Number.isSafeInteger(input.file_size) || input.file_size < 1 || input.file_size > MAX_FILE_SIZE_BYTES)
    return { data: null, error: { code: 'VALIDATION_FAILURE', message: 'Select a file smaller than 10 MB.' } };

  const user = await chatActor();
  if (!user) return { data: null, error: forbidden };
  const limitError = await authActionLimit('report_upload', user.id, 20, 3600, 'user');
  if (limitError) return { data: null, error: limitError };

  const pendingPath = `chat-pending/${user.id}/${crypto.randomUUID()}${extension}`;
  const { data, error } = await getServiceClient().storage.from(BUCKET).createSignedUploadUrl(pendingPath, { upsert: false });
  if (error || !data?.token)
    return { data: null, error: { code: 'SERVER_FAILURE', message: 'Could not prepare a secure upload. Please try again.' } };
  return { data: { pendingPath, token: data.token }, error: null };
}

/**
 * Step 2: validate the stored bytes (size, extension, MIME, file signature) and move the file to
 * chat/<user id>/, the only place send_chat_message accepts attachments from.
 */
export async function finalizeChatAttachment(input: {
  pendingPath: string;
  file_name: string;
}): Promise<AppResult<{ path: string; name: string }>> {
  const user = await chatActor();
  if (!user) return { data: null, error: forbidden };

  const pendingPath = String(input?.pendingPath ?? '');
  const match = pendingPath.match(new RegExp(`^chat-pending/${user.id}/(${UUID}(\\.[a-z]+))$`));
  const name = String(input?.file_name ?? '').replace(/[/\\]/g, '_').trim().slice(0, 255);
  if (!match || !extensionOf(pendingPath) || !name)
    return { data: null, error: { code: 'VALIDATION_FAILURE', message: 'Invalid attachment upload.' } };

  const storage = getServiceClient().storage.from(BUCKET);
  const reject = async (message: string): Promise<AppResult<{ path: string; name: string }>> => {
    await storage.remove([pendingPath]);
    return { data: null, error: { code: 'VALIDATION_FAILURE', message } };
  };

  const { data: blob, error: downloadError } = await storage.download(pendingPath);
  if (downloadError || !blob) return { data: null, error: { code: 'NOT_FOUND', message: 'The uploaded file was not found. Please attach it again.' } };
  const checked = validateUploadedBytes(new Uint8Array(await blob.arrayBuffer()), pendingPath, blob.type, ALLOWED_EXTENSIONS, MAX_FILE_SIZE_BYTES);
  if (checked.error) return reject(checked.error.message);

  const path = `chat/${user.id}/${match[1]}`;
  const { error: moveError } = await storage.move(pendingPath, path);
  if (moveError) return reject('The attachment could not be saved. Please try again.');
  return { data: { path, name }, error: null };
}

/** A 60-second download link, issued only to a participant of the message's conversation (RLS). */
export async function getChatAttachmentUrl(messageId: string): Promise<AppResult<{ signedUrl: string }>> {
  if (!new RegExp(`^${UUID}$`).test(String(messageId ?? '')))
    return { data: null, error: { code: 'VALIDATION_FAILURE', message: 'Invalid message.' } };
  const { supabase, user, profile } = await getTrustedActor();
  if (!user || !profile || !['Coordinator', 'Supervisor'].includes(profile.role)) return { data: null, error: forbidden };

  const { data: message } = await supabase.from('chat_messages')
    .select('attachment_path, attachment_name').eq('message_id', messageId).maybeSingle();
  if (!message?.attachment_path || !message.attachment_path.startsWith('chat/'))
    return { data: null, error: { code: 'FORBIDDEN', message: 'Attachment is not available to this account.' } };

  const { data, error } = await getServiceClient().storage.from(BUCKET)
    .createSignedUrl(message.attachment_path, 60, { download: message.attachment_name ?? true });
  if (error || !data?.signedUrl)
    return { data: null, error: { code: 'SERVER_FAILURE', message: 'Failed to generate a secure download link.' } };
  return { data: { signedUrl: toPublicSupabaseUrl(data.signedUrl) }, error: null };
}
