'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { createClient } from '@/src/lib/supabase/client';

type Contact = {
  counterpart_user_id: string;
  counterpart_name: string;
  counterpart_role: string;
  conversation_id: string | null;
  unread_count: number;
  is_eligible: boolean;
};
type Message = { message_id: string; conversation_id: string; sender_user_id: string; content: string; created_at: string };
const MESSAGE_PAGE_SIZE = 50;

export default function ChatWorkspace({ userId, role }: { userId: string; role: 'Coordinator' | 'Supervisor' }) {
  const supabase = useMemo(() => createClient(), []);
  const searchParams = useSearchParams();
  const requestedConversation = searchParams.get('conversation');
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [activeContactId, setActiveContactId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [hasOlderMessages, setHasOlderMessages] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [seenAt, setSeenAt] = useState<string | null>(null);

  const refreshContacts = useCallback(async () => {
    const { data, error: rpcError } = await supabase.rpc('list_chat_contacts').abortSignal(AbortSignal.timeout(12000));
    if (rpcError) { setError('Messages are unavailable right now.'); return; }
    const items = (data ?? []) as Contact[];
    setContacts(items);
    if (requestedConversation) {
      const requested = items.find((item) => item.conversation_id === requestedConversation);
      const selectedId = requested?.counterpart_user_id ?? items[0]?.counterpart_user_id ?? null;
      setActiveContactId((current) => current && items.some((item) => item.counterpart_user_id === current) && !requested
        ? current
        : selectedId);
    } else {
      setActiveContactId((current) => current && items.some((item) => item.counterpart_user_id === current)
        ? current
        : items[0]?.counterpart_user_id ?? null);
    }
    setLoading(false);
  }, [requestedConversation, supabase]);

  const activeContact = contacts.find((contact) => contact.counterpart_user_id === activeContactId) ?? null;
  const conversationId = activeContact?.conversation_id ?? null;
  const lastSeenMessageId = messages.filter((m) => m.sender_user_id === userId && seenAt && m.created_at <= seenAt).at(-1)?.message_id;

  const refreshMessages = useCallback(async (id: string) => {
    const { data, error: queryError } = await supabase.from('chat_messages')
      .select('message_id, conversation_id, sender_user_id, content, created_at')
      .eq('conversation_id', id).order('created_at', { ascending: false }).order('message_id', { ascending: false }).limit(MESSAGE_PAGE_SIZE)
      .abortSignal(AbortSignal.timeout(12000));
    if (queryError) { setError('Could not load this conversation.'); return; }
    const newest = ((data ?? []) as Message[]).reverse();
    setHasOlderMessages(newest.length === MESSAGE_PAGE_SIZE);
    setMessages((current) => {
      const merged = new Map([...current, ...newest].map((message) => [message.message_id, message]));
      return [...merged.values()].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.message_id.localeCompare(b.message_id));
    });
    const { error: readError } = await supabase.rpc('mark_chat_read', { p_conversation_id: id }).abortSignal(AbortSignal.timeout(12000));
    if (readError) setError('Messages loaded, but their read status could not be updated. Please retry by reopening the conversation.');
    const readColumn = role === 'Coordinator' ? 'supervisor_last_read_at' : 'coordinator_last_read_at';
    const { data: conversation } = await supabase.from('chat_conversations').select(readColumn).eq('conversation_id', id).maybeSingle();
    setSeenAt((conversation as Record<string, string | null> | null)?.[readColumn] ?? null);
    await refreshContacts();
  }, [refreshContacts, role, supabase]);

  const loadOlderMessages = useCallback(async () => {
    if (!conversationId || !messages.length || loadingOlder || !hasOlderMessages) return;
    setLoadingOlder(true);
    const oldest = messages[0];
    const { data, error: queryError } = await supabase.from('chat_messages')
      .select('message_id, conversation_id, sender_user_id, content, created_at')
      .eq('conversation_id', conversationId)
      .or(`created_at.lt.${oldest.created_at},and(created_at.eq.${oldest.created_at},message_id.lt.${oldest.message_id})`)
      .order('created_at', { ascending: false }).order('message_id', { ascending: false }).limit(MESSAGE_PAGE_SIZE)
      .abortSignal(AbortSignal.timeout(12000));
    if (queryError) setError('Could not load older messages. Please try again.');
    else {
      const older = ((data ?? []) as Message[]).reverse();
      setHasOlderMessages(older.length === MESSAGE_PAGE_SIZE);
      setMessages((current) => [...older, ...current]);
    }
    setLoadingOlder(false);
  }, [conversationId, hasOlderMessages, loadingOlder, messages, supabase]);

  useEffect(() => { void refreshContacts(); }, [refreshContacts]);

  useEffect(() => {
    const channel = supabase.channel(`chat-contact-alerts-${userId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `receiver_user_id=eq.${userId}` },
        () => { void refreshContacts(); })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [refreshContacts, supabase, userId]);

  useEffect(() => {
    if (!conversationId) { setMessages([]); setHasOlderMessages(false); setSeenAt(null); return; }
    setMessages([]);
    setHasOlderMessages(false);
    setSeenAt(null);
    void refreshMessages(conversationId);
    const channel = supabase.channel(`chat-${conversationId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `conversation_id=eq.${conversationId}` },
        () => { void refreshMessages(conversationId); })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [conversationId, refreshMessages, supabase]);

  async function sendMessage(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const content = draft.trim();
    if (!activeContact || !content || content.length > 4000 || sending) return;
    setSending(true); setError('');
    const { error: sendError } = await supabase.rpc('send_chat_message', {
      p_counterpart_user_id: activeContact.counterpart_user_id,
      p_content: content,
    }).abortSignal(AbortSignal.timeout(12000));
    if (sendError) {
      setError(sendError.code === '42501' ? 'This conversation is archived because there is no active shared placement.' : 'Your message could not be sent. Please try again.');
    } else {
      setDraft('');
      await refreshContacts();
    }
    setSending(false);
  }

  return (
    <section className="mx-auto w-full max-w-6xl p-4 sm:p-6 lg:p-8 space-y-5">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">Messages</h1>
        <p className="mt-1 text-sm text-slate-500">Private conversations with {role === 'Coordinator' ? 'eligible company supervisors' : 'eligible OJT Coordinator'}.</p>
      </header>
      <div className="grid min-h-[560px] grid-cols-1 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm md:grid-cols-[280px_1fr]">
        <aside className="border-b border-slate-200 md:border-b-0 md:border-r">
          <div className="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-700">Conversations</div>
          {loading ? <p className="p-4 text-sm text-slate-500">Loading contacts…</p> : contacts.length === 0 ? (
            <p className="p-4 text-sm text-slate-500">No eligible counterparts yet. Contacts appear when there is an active shared placement.</p>
          ) : contacts.map((contact) => (
            <button key={contact.counterpart_user_id} type="button" onClick={() => setActiveContactId(contact.counterpart_user_id)}
              className={`flex w-full items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 text-left hover:bg-slate-50 ${activeContactId === contact.counterpart_user_id ? 'bg-teal-50' : ''}`}>
              <span className="min-w-0"><span className="block truncate text-sm font-medium text-slate-800">{contact.counterpart_name}</span>
                <span className="block text-xs text-slate-500">{contact.counterpart_role}{contact.conversation_id && !contact.is_eligible ? ' · Archived' : ''}</span></span>
              {Number(contact.unread_count) > 0 && <span className="rounded-full bg-teal-700 px-2 py-0.5 text-xs font-semibold text-white">{contact.unread_count}</span>}
            </button>
          ))}
        </aside>
        <div className="flex min-h-[500px] flex-col">
          {activeContact ? <>
            <div className="border-b border-slate-100 px-5 py-3">
              <h2 className="font-semibold text-slate-800">{activeContact.counterpart_name}</h2>
              <p className="text-xs text-slate-500">{activeContact.is_eligible ? 'Active placement · messaging available' : 'Archived history · read only'}</p>
            </div>
            <div className="flex-1 space-y-3 overflow-y-auto bg-slate-50/60 p-4">
              {hasOlderMessages && <div className="text-center"><button type="button" onClick={() => void loadOlderMessages()} disabled={loadingOlder} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 disabled:opacity-50">{loadingOlder ? 'Loading…' : 'Load older messages'}</button></div>}
              {messages.length === 0 ? <p className="py-10 text-center text-sm text-slate-500">No messages yet. Send a message to start this conversation.</p> : messages.map((message) => {
                const mine = message.sender_user_id === userId;
                return <div key={message.message_id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[82%] rounded-2xl px-4 py-2.5 text-sm shadow-sm ${mine ? 'bg-teal-700 text-white' : 'border border-slate-200 bg-white text-slate-800'}`}>
                    <p className="whitespace-pre-wrap break-words">{message.content}</p>
                    <time className={`mt-1 block text-[10px] ${mine ? 'text-teal-100' : 'text-slate-400'}`} dateTime={message.created_at}>{new Date(message.created_at).toLocaleString()}{message.message_id === lastSeenMessageId && ' · Seen'}</time>
                  </div>
                </div>;
              })}
            </div>
            {activeContact.is_eligible ? <form onSubmit={sendMessage} className="border-t border-slate-100 p-3">
              <label htmlFor="chat-message" className="sr-only">Write a message</label>
              <div className="flex items-end gap-3">
                <textarea id="chat-message" value={draft} onChange={(event) => setDraft(event.target.value.slice(0, 4000))}
                  maxLength={4000} rows={2} placeholder="Write a message…" className="min-h-12 flex-1 resize-y rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100" />
                <button type="submit" disabled={!draft.trim() || sending} className="rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">{sending ? 'Sending…' : 'Send'}</button>
              </div>
              <div className="mt-1 flex justify-between text-[11px] text-slate-400"><span>Messages cannot be edited or deleted.</span><span>{draft.length}/4000</span></div>
            </form> : <div className="border-t border-slate-100 bg-amber-50 px-4 py-3 text-sm text-amber-900">This conversation is read-only until an active shared placement resumes.</div>}
          </> : <div className="flex flex-1 items-center justify-center p-8 text-center text-sm text-slate-500">Choose an eligible contact to view the conversation.</div>}
          {error && <p role="alert" className="border-t border-red-100 bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>}
        </div>
      </div>
    </section>
  );
}
