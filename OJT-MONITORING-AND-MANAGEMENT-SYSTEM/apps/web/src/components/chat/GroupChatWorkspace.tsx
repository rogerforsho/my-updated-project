'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@/src/lib/supabase/client';
import { postGroupChatMessage } from '@/src/services/groupChat';

type Message = { message_id: string; sender_user_id: string; sender_name: string; sender_role: string; content: string; created_at: string };
const PAGE = 100;

export default function GroupChatWorkspace({ userId, departments }: { userId: string; departments: string[] }) {
  const supabase = useMemo(() => createClient(), []);
  const [department, setDepartment] = useState(departments[0]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const bottom = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const { data, error: queryError } = await supabase.from('group_chat_messages')
      .select('message_id, sender_user_id, sender_name, sender_role, content, created_at')
      .eq('department', department).order('created_at', { ascending: false }).order('message_id', { ascending: false }).limit(PAGE)
      .abortSignal(AbortSignal.timeout(12000));
    if (queryError) { setError('Could not load the group chat.'); return; }
    setError('');
    setMessages(((data ?? []) as Message[]).reverse());
  }, [department, supabase]);

  useEffect(() => {
    setMessages([]);
    void load();
    const channel = supabase.channel(`group-chat-${department}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'group_chat_messages', filter: `department=eq.${department}` },
        () => { void load(); })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [department, load, supabase]);

  useEffect(() => { bottom.current?.scrollIntoView({ block: 'end' }); }, [messages]);

  async function send(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const content = draft.trim();
    if (!content || sending) return;
    setSending(true); setError('');
    const result = await postGroupChatMessage({ department, content });
    if (result.error) setError(result.error.message);
    else { setDraft(''); await load(); }
    setSending(false);
  }

  return (
    <section className="mx-auto w-full max-w-4xl space-y-5 p-4 sm:p-6 lg:p-8">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">Group Chat</h1>
        <p className="mt-1 text-sm text-slate-500">Everyone in the department sees these messages: its OJT Coordinators and its OJT students.</p>
      </header>
      {departments.length > 1 && (
        <div role="tablist" className="flex gap-2">
          {departments.map((item) => (
            <button key={item} role="tab" aria-selected={item === department} onClick={() => setDepartment(item)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium ${item === department ? 'bg-teal-700 text-white' : 'border border-slate-200 bg-white text-slate-600'}`}>{item}</button>
          ))}
        </div>
      )}
      {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <div className="flex min-h-[520px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex-1 space-y-3 overflow-y-auto bg-slate-50/60 p-4" style={{ maxHeight: '60vh' }}>
          {messages.length === 0 ? <p className="py-10 text-center text-sm text-slate-500">No messages yet. Say hello to the {department} group.</p> : messages.map((message) => {
            const mine = message.sender_user_id === userId;
            return (
              <div key={message.message_id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[82%] rounded-2xl px-4 py-2.5 text-sm shadow-sm ${mine ? 'bg-teal-700 text-white' : 'border border-slate-200 bg-white text-slate-800'}`}>
                  {!mine && <p className="mb-0.5 text-xs font-semibold text-teal-800">{message.sender_name}{message.sender_role === 'Coordinator' ? ' · Coordinator' : ''}</p>}
                  <p className="whitespace-pre-wrap break-words">{message.content}</p>
                  <time className={`mt-1 block text-xs ${mine ? 'text-teal-100' : 'text-slate-400'}`} dateTime={message.created_at}>{new Date(message.created_at).toLocaleString()}</time>
                </div>
              </div>
            );
          })}
          <div ref={bottom} />
        </div>
        <form onSubmit={send} className="border-t border-slate-100 p-3">
          <label htmlFor="group-chat-message" className="sr-only">Write a message</label>
          <div className="flex items-end gap-3">
            <textarea id="group-chat-message" value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={4000} rows={2}
              placeholder={`Message the ${department} group…`}
              className="min-h-12 flex-1 resize-y rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100" />
            <button type="submit" disabled={!draft.trim() || sending}
              className="rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">{sending ? 'Sending…' : 'Send'}</button>
          </div>
        </form>
      </div>
    </section>
  );
}
