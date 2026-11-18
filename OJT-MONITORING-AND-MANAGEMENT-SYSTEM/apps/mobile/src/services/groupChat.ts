import { supabase } from '../lib/supabase';
import { postWebBff } from '../lib/webBff';
import { isNetworkAvailable } from '../lib/syncEngine';
import { listChatOutbox, markChatOutboxRejected, removeChatOutboxItem } from '../lib/chatOutbox';
import type { AppResult } from '@ojt/shared';

export interface GroupMessage {
  message_id: string;
  client_id?: string | null;
  sender_user_id: string;
  sender_name: string;
  sender_role: string;
  content: string;
  created_at: string;
}

export interface GroupDocument {
  document_id: string;
  title: string;
  file_name: string;
  created_at: string;
}

/** Latest messages of the student's own department group; RLS limits the rows to that department. */
export async function listGroupMessages(): Promise<AppResult<GroupMessage[]>> {
  const { data, error } = await supabase.from('group_chat_messages')
    .select('message_id, client_id, sender_user_id, sender_name, sender_role, content, created_at')
    .order('created_at', { ascending: false }).limit(100);
  if (error) return { data: null, error: { code: 'SERVER_FAILURE', message: 'Failed to load the group chat.' } };
  return { data: (data as GroupMessage[]).reverse(), error: null };
}

export const sendGroupMessage = (content: string, clientId: string) =>
  postWebBff<null>('/api/mobile/group-chat', { content, client_id: clientId });

/** The server refused the message itself (not the connection), so retrying cannot help. */
const REFUSED = new Set(['VALIDATION_FAILURE', 'FORBIDDEN']);

/**
 * Sends the waiting messages oldest first. Stops at the first failure that a retry could fix
 * (no signal, server busy, signed out) so the order is kept; refused messages are marked, not retried.
 */
let flushing: Promise<void> | null = null;
export function flushChatOutbox(userId: string): Promise<void> {
  if (!flushing) flushing = runFlush(userId).finally(() => { flushing = null; });
  return flushing;
}

async function runFlush(userId: string): Promise<void> {
  if (!(await isNetworkAvailable())) return;
  for (const item of (await listChatOutbox(userId)).filter(i => !i.rejected)) {
    const res = await sendGroupMessage(item.content, item.client_id);
    if (!res.error) await removeChatOutboxItem(item.client_id);
    else if (REFUSED.has(res.error.code)) await markChatOutboxRejected(item.client_id, res.error.message);
    else return;
  }
}

/** Calls onChange for each new message in the group (Realtime applies RLS, so only the own department arrives). */
export function subscribeGroupMessages(onChange: () => void): () => void {
  const channel = supabase.channel('student-group-chat')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'group_chat_messages' }, onChange)
    .subscribe();
  return () => { void supabase.removeChannel(channel); };
}

export async function listGroupDocuments(): Promise<AppResult<GroupDocument[]>> {
  const { data, error } = await supabase.from('coordinator_documents')
    .select('document_id, title, file_name, created_at').order('created_at', { ascending: false }).limit(50);
  if (error) return { data: null, error: { code: 'SERVER_FAILURE', message: 'Failed to load documents.' } };
  return { data: data as GroupDocument[], error: null };
}

export const getGroupDocumentUrl = (documentId: string) =>
  postWebBff<{ signedUrl: string }>('/api/mobile/documents/url', { document_id: documentId });
