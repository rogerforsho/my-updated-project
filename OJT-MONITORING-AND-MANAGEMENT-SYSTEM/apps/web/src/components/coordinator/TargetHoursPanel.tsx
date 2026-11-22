'use client';

import { useCallback, useEffect, useState } from 'react';
import { listProgramTargetHours, setProgramTargetHours, type ProgramTargetHours } from '@/src/services/programTargetHours';

/** One row per program the Coordinator is granted. The hours come from the school / CHED / curriculum, so they are set here once. */
export function TargetHoursPanel() {
  const [rows, setRows] = useState<ProgramTargetHours[]>([]);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState('');
  const [ok, setOk] = useState('');
  const [busy, setBusy] = useState('');

  const load = useCallback(async () => {
    const res = await listProgramTargetHours();
    if (res.data) { setRows(res.data); setDraft(Object.fromEntries(res.data.map((r) => [r.course, String(r.required_hours)]))); }
    else setMsg(res.error?.message ?? 'Could not load Target Hours.');
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function save(row: ProgramTargetHours) {
    const hours = Number(draft[row.course]);
    setMsg(''); setOk('');
    if (!Number.isInteger(hours) || hours < 1 || hours > 840) { setMsg('Enter whole hours from 1 to 840.'); return; }
    const changes = hours !== row.required_hours && row.following_students > 0;
    if (changes && !window.confirm(`Set ${row.course} to ${hours} hours? This changes the Target Hours of ${row.following_students} student(s) still on ${row.required_hours}. Students with a different value or a certificate are not changed.`)) return;
    setBusy(row.course);
    const res = await setProgramTargetHours(row.course, hours);
    setBusy('');
    if (res.error) { setMsg(res.error.message); return; }
    setOk(`${row.course} saved at ${hours} hours. ${res.data?.moved ?? 0} student(s) updated.`);
    await load();
  }

  const input = 'w-28 rounded-lg border border-slate-300 px-3 py-2 text-sm';
  return (
    <section className="space-y-4">
      {msg && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{msg}</p>}
      {ok && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{ok}</p>}
      <ul className="divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white">
        {rows.map((r) => (
          <li key={r.course} className="flex flex-wrap items-end gap-3 p-4">
            <div className="min-w-32">
              <p className="text-sm font-bold text-slate-900">{r.course}</p>
              {r.confirmed_at
                ? <p className="text-xs text-slate-500">Set {new Date(r.confirmed_at).toLocaleDateString('en-PH')}</p>
                : <p className="text-xs font-semibold text-amber-700">Not yet confirmed</p>}
            </div>
            <label className="flex flex-col gap-1 text-xs font-semibold text-slate-700">Target Hours
              <input type="number" min={1} max={840} step={1} value={draft[r.course] ?? ''} onChange={(e) => setDraft({ ...draft, [r.course]: e.target.value })} className={input} />
            </label>
            <button type="button" disabled={busy === r.course} onClick={() => save(r)} className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
              {r.confirmed_at ? 'Save' : 'Confirm'}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
