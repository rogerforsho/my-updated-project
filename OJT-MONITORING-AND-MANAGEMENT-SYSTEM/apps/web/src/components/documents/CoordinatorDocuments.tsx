'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/src/lib/supabase/client';
import { createChatAttachmentUpload } from '@/src/services/chatAttachments';
import { getCoordinatorDocumentUrl, sendCoordinatorDocument } from '@/src/services/coordinatorDocuments';

export type DocumentStudent = { user_id: string; name: string; student_number: string; department: string };
export type SentDocument = { document_id: string; department: string; title: string; file_name: string; created_at: string; recipient_count: number };

const MAX_BYTES = 10 * 1024 * 1024;

export default function CoordinatorDocuments({ departments, students, documents }: {
  departments: string[]; students: DocumentStudent[]; documents: SentDocument[];
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [department, setDepartment] = useState(departments[0]);
  const [title, setTitle] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [everyone, setEveryone] = useState(true);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const deptStudents = students.filter((student) => student.department === department);

  function toggle(userId: string) {
    setPicked((current) => { const next = new Set(current); if (next.has(userId)) next.delete(userId); else next.add(userId); return next; });
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    if (busy || !file || !title.trim()) return;
    if (file.size > MAX_BYTES) { setError('Select a file smaller than 10 MB.'); return; }
    if (!everyone && picked.size === 0) { setError('Choose at least one student, or send to everyone.'); return; }
    setBusy(true); setError(''); setNotice('');
    const slot = await createChatAttachmentUpload({ file_name: file.name, file_size: file.size });
    if (slot.error || !slot.data) { setError(slot.error?.message ?? 'Could not prepare the upload.'); setBusy(false); return; }
    const { error: uploadError } = await supabase.storage.from('private-documents').uploadToSignedUrl(slot.data.pendingPath, slot.data.token, file);
    if (uploadError) { setError('The file could not be uploaded. Please try again.'); setBusy(false); return; }
    const sent = await sendCoordinatorDocument({
      department, title: title.trim(), pendingPath: slot.data.pendingPath, file_name: file.name,
      studentUserIds: everyone ? null : [...picked].filter((id) => deptStudents.some((student) => student.user_id === id)),
    });
    if (sent.error || !sent.data) setError(sent.error?.message ?? 'The document could not be sent.');
    else {
      setNotice(`Sent to ${sent.data.recipientCount} student${sent.data.recipientCount === 1 ? '' : 's'}.`);
      setTitle(''); setFile(null); setPicked(new Set()); setEveryone(true);
      form.reset();
      router.refresh();
    }
    setBusy(false);
  }

  async function open(documentId: string) {
    setError('');
    const result = await getCoordinatorDocumentUrl(documentId);
    if (result.error || !result.data) setError(result.error?.message ?? 'The document could not be opened.');
    else window.open(result.data.signedUrl, '_blank', 'noopener,noreferrer');
  }

  return (
    <section className="mx-auto w-full max-w-4xl space-y-6 p-4 sm:p-6 lg:p-8">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">Documents</h1>
        <p className="mt-1 text-sm text-slate-500">Send a PDF or other file to your OJT students. They get a notification and can open it in the mobile app.</p>
      </header>
      {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {notice && <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{notice}</p>}

      <form onSubmit={submit} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        {departments.length > 1 && (
          <label className="block text-sm font-medium text-slate-700">Department
            <select value={department} onChange={(event) => { setDepartment(event.target.value); setPicked(new Set()); }}
              className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
              {departments.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
        )}
        <label className="block text-sm font-medium text-slate-700">Title
          <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={200} required
            className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="e.g. OJT Journal Template" />
        </label>
        <label className="block text-sm font-medium text-slate-700">File (PDF, DOCX, DOC, JPG or PNG, up to 10 MB)
          <input type="file" required accept=".pdf,.docx,.doc,.jpg,.jpeg,.png"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)} className="mt-1 block w-full text-sm" />
        </label>
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-slate-700">Send to</legend>
          <label className="flex items-center gap-2 text-sm"><input type="radio" checked={everyone} onChange={() => setEveryone(true)} />
            All {deptStudents.length} active {department} students</label>
          <label className="flex items-center gap-2 text-sm"><input type="radio" checked={!everyone} onChange={() => setEveryone(false)} />Only the students I choose</label>
          {!everyone && (
            <ul className="max-h-56 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">
              {deptStudents.length === 0 ? <li className="p-3 text-sm text-slate-500">No active students in this department.</li> : deptStudents.map((student) => (
                <li key={student.user_id}>
                  <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-slate-50">
                    <input type="checkbox" checked={picked.has(student.user_id)} onChange={() => toggle(student.user_id)} />
                    <span>{student.name}</span><span className="text-xs text-slate-500">{student.student_number}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </fieldset>
        <button type="submit" disabled={busy || !file || !title.trim() || deptStudents.length === 0}
          className="rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">{busy ? 'Sending…' : 'Send document'}</button>
      </form>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <h2 className="border-b border-slate-100 px-5 py-3 text-sm font-semibold text-slate-700">Sent documents</h2>
        {documents.length === 0 ? <p className="p-5 text-sm text-slate-500">Nothing sent yet.</p> : (
          <ul className="divide-y divide-slate-100">
            {documents.map((item) => (
              <li key={item.document_id} className="flex items-center justify-between gap-3 px-5 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-800">{item.title}</p>
                  <p className="text-xs text-slate-500">{item.department} · {item.recipient_count} student{item.recipient_count === 1 ? '' : 's'} · {new Date(item.created_at).toLocaleDateString()}</p>
                </div>
                <button type="button" onClick={() => void open(item.document_id)}
                  className="shrink-0 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-teal-800 hover:bg-slate-50">Open {item.file_name.length > 24 ? 'file' : item.file_name}</button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
