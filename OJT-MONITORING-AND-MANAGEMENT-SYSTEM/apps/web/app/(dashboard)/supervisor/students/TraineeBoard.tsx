'use client';

import { useState } from 'react';
import { useSearchPaging, SearchBox, PagerBar } from '@/src/components/ui/ListControls';
import { getSignedDocumentUrl } from '@/src/services/storage';
import {
  exportTraineeAttendanceCsv, listTraineeReports, setMyCompanyIntake,
  type CompanyIntake, type SupervisedTrainee,
} from '@/src/services/supervisorTrainees';

type Filter = 'all' | 'active' | 'graduated' | 'completed' | 'ended' | 'no_attendance';

const STATUS_LABEL: Record<string, string> = { active: 'Active', completed: 'Completed', terminated: 'Terminated', reassigned: 'Reassigned' };
const FILTERS: [Filter, string][] = [
  ['all', 'All statuses'], ['active', 'Active'], ['graduated', 'Graduated'], ['completed', 'Completed'],
  ['ended', 'Ended / on hold'], ['no_attendance', 'No attendance in 7 days'],
];

function matches(t: SupervisedTrainee, f: Filter) {
  const s = t.placement.assignment_status;
  if (f === 'active') return s === 'active';
  if (f === 'graduated') return t.graduated;
  if (f === 'completed') return s === 'completed';
  if (f === 'ended') return s === 'terminated' || s === 'reassigned';
  if (f === 'no_attendance') return t.no_recent_attendance;
  return true;
}

const isoDaysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);

function IntakeCard({ intake }: { intake: CompanyIntake }) {
  const [max, setMax] = useState(intake.max_interns?.toString() ?? '');
  const [accepting, setAccepting] = useState(intake.accepting_students);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true); setMsg('');
    const value = max.trim() === '' ? null : Number(max);
    const res = await setMyCompanyIntake({ max_interns: value, accepting_students: accepting });
    setBusy(false);
    setMsg(res.error ? res.error.message : 'Saved. Coordinators are notified when your company opens or closes.');
  }

  const open = accepting && (max.trim() === '' || intake.active_interns < Number(max));
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-3" aria-label="Student intake control">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-bold text-slate-900">{intake.company_name}: new student intake</h2>
          <p className="text-xs text-slate-500">{intake.active_interns} active interns · {intake.company_graduated} graduated at this company</p>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-bold ${open ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'}`}>
          {open ? 'Accepting students' : 'Closed to new students'}
        </span>
      </div>
      <div className="flex flex-wrap items-end gap-4 text-sm">
        <label className="flex flex-col gap-1 text-xs font-semibold text-slate-700">Maximum interns (empty = no limit)
          <input type="number" min={1} max={500} value={max} onChange={(e) => setMax(e.target.value)} className="w-40 rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal" />
        </label>
        <label className="flex items-center gap-2 text-xs font-semibold text-slate-700">
          <input type="checkbox" checked={accepting} onChange={(e) => setAccepting(e.target.checked)} />
          Accepting new students
        </label>
        <button type="button" onClick={save} disabled={busy} className="rounded-lg bg-teal-700 px-4 py-2 text-xs font-bold text-white disabled:opacity-50">Save</button>
      </div>
      <p className="text-xs text-slate-500">When the limit is reached, or the switch is off, coordinators can no longer place new students here. Trainees already placed are not affected.</p>
      {msg && <p role="status" className="text-xs font-medium text-slate-700">{msg}</p>}
    </section>
  );
}

function TraineeDetails({ t, onPack, busy }: { t: SupervisedTrainee; onPack: () => void; busy: boolean }) {
  const [reports, setReports] = useState<Awaited<ReturnType<typeof listTraineeReports>>['data']>(null);
  const [from, setFrom] = useState(isoDaysAgo(30));
  const [to, setTo] = useState(isoDaysAgo(0));
  const [msg, setMsg] = useState('');

  async function loadReports() {
    const res = await listTraineeReports(t.student_id);
    if (res.error) setMsg(res.error.message); else setReports(res.data);
  }
  async function openReport(path: string) {
    const res = await getSignedDocumentUrl(path, 120);
    if (res.data) window.open(res.data.signedUrl, '_blank', 'noopener'); else setMsg(res.error?.message ?? 'Could not open the file.');
  }
  async function downloadCsv() {
    setMsg('');
    const res = await exportTraineeAttendanceCsv(t.student_id, from, to);
    if (res.error || !res.data) { setMsg(res.error?.message ?? 'Export failed.'); return; }
    const url = URL.createObjectURL(new Blob([res.data.csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url; a.download = res.data.filename; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="mt-4 space-y-4 border-t border-slate-100 pt-4 text-xs">
      <div>
        <p className="font-bold text-slate-700 mb-1">Placement history</p>
        <ul className="space-y-1 text-slate-600">
          {t.history.map((h) => (
            <li key={h.assignment_id}>
              {h.company_name} · {h.branch_name} · {h.start_date}{h.end_date ? ` to ${h.end_date}` : ''} · <strong>{STATUS_LABEL[h.assignment_status] ?? h.assignment_status}</strong>
            </li>
          ))}
        </ul>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 font-semibold text-slate-700">From
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-1.5 font-normal" />
        </label>
        <label className="flex flex-col gap-1 font-semibold text-slate-700">To
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-1.5 font-normal" />
        </label>
        <button type="button" disabled={busy} onClick={onPack} className="rounded-lg bg-teal-700 px-3 py-1.5 font-bold text-white disabled:opacity-50">Download pack (ZIP)</button>
        <button type="button" onClick={downloadCsv} className="rounded-lg border border-slate-300 px-3 py-1.5 font-bold text-slate-700">Download attendance (CSV)</button>
        <button type="button" onClick={loadReports} className="rounded-lg border border-slate-300 px-3 py-1.5 font-bold text-slate-700">Show submitted reports</button>
      </div>
      {reports && (reports.length === 0 ? <p className="text-slate-500">No submitted reports yet.</p> : (
        <ul className="space-y-1">
          {reports.map((r) => (
            <li key={r.report_id} className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2">
              <span>{r.report_type} · {new Date(r.submission_date).toLocaleDateString()} · {r.status}</span>
              <button type="button" onClick={() => openReport(r.file_path)} className="font-bold text-teal-700 underline">Download</button>
            </li>
          ))}
        </ul>
      ))}
      {msg && <p role="alert" className="text-red-700">{msg}</p>}
    </div>
  );
}

export function TraineeBoard({ trainees, intake }: { trainees: SupervisedTrainee[]; intake: CompanyIntake | null }) {
  const [filter, setFilter] = useState<Filter>('all');
  const [open, setOpen] = useState<string | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [packFrom, setPackFrom] = useState(isoDaysAgo(30));
  const [packTo, setPackTo] = useState(isoDaysAgo(0));
  const [packBusy, setPackBusy] = useState(false);
  const [packMsg, setPackMsg] = useState('');

  const toggle = (id: string) => setPicked((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });

  async function downloadPack(ids: string[]) {
    setPackBusy(true); setPackMsg('');
    try {
      const res = await fetch('/api/supervisor/pack', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ student_ids: ids, from: packFrom, to: packTo }),
      });
      if (!res.ok) { setPackMsg(((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? 'The pack could not be created.'); return; }
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement('a');
      a.href = url; a.download = `trainee-pack_${packFrom}_to_${packTo}.zip`; a.click();
      URL.revokeObjectURL(url);
    } catch { setPackMsg('The pack could not be downloaded. Check your connection and try again.'); }
    finally { setPackBusy(false); }
  }
  const filtered = trainees.filter((t) => matches(t, filter));
  const list = useSearchPaging(
    filtered,
    (t) => `${t.full_name} ${t.student_number} ${t.course} ${STATUS_LABEL[t.placement.assignment_status] ?? ''} ${t.graduated ? 'graduated' : ''}`,
  );
  const graduated = trainees.filter((t) => t.graduated).length;

  return (
    <div className="space-y-4">
      {intake && <IntakeCard intake={intake} />}
      <p className="text-sm text-slate-600"><strong>{graduated}</strong> of your {trainees.length} trainees have graduated (completed placement with the required hours).</p>
      <div className="flex flex-wrap gap-2">
        <SearchBox value={list.search} onChange={list.setSearch} placeholder="Search name, ID, course or status..." />
        <select aria-label="Filter trainees by status" value={filter} onChange={(e) => { setFilter(e.target.value as Filter); list.setPage(1); }}
          className="rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm">
          {FILTERS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>

      {trainees.length > 0 && (
        <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-xs" aria-label="Download pack">
          <div>
            <p className="font-bold text-slate-800">Download pack (ZIP)</p>
            <p className="text-slate-500">Each selected trainee&apos;s submitted reports and attendance (CSV) for the dates below, in one file.</p>
          </div>
          <label className="flex flex-col gap-1 font-semibold text-slate-700">From
            <input type="date" value={packFrom} max={packTo} onChange={(e) => setPackFrom(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-1.5 font-normal" />
          </label>
          <label className="flex flex-col gap-1 font-semibold text-slate-700">To
            <input type="date" value={packTo} min={packFrom} onChange={(e) => setPackTo(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-1.5 font-normal" />
          </label>
          <button type="button" onClick={() => setPicked(new Set(list.visible.map((t) => t.student_id)))} className="rounded-lg border border-slate-300 px-3 py-1.5 font-bold text-slate-700">Select this page</button>
          {picked.size > 0 && <button type="button" onClick={() => setPicked(new Set())} className="font-bold text-slate-600 underline">Clear</button>}
          <button type="button" disabled={packBusy || picked.size === 0 || picked.size > 25} onClick={() => downloadPack([...picked])}
            className="rounded-lg bg-teal-700 px-4 py-2 font-bold text-white disabled:opacity-50">
            {packBusy ? 'Preparing…' : `Download pack (${picked.size} selected)`}
          </button>
          {picked.size > 25 && <p role="alert" className="w-full text-red-700">Select up to 25 trainees per pack.</p>}
          {packMsg && <p role="alert" className="w-full text-red-700">{packMsg}</p>}
        </div>
      )}

      {trainees.length === 0 && <p className="rounded-xl bg-slate-50 p-6 text-sm text-slate-600">No trainees are assigned to you yet. Your OJT Coordinator assigns students once their requirements are verified.</p>}
      {trainees.length > 0 && list.visible.length === 0 && <p className="rounded-xl bg-slate-50 p-6 text-sm text-slate-600">No trainees match your search.</p>}

      <div className="grid grid-cols-1 gap-4">
        {list.visible.map((t) => {
          const pct = Math.min(100, Math.round((t.completed_hours / t.required_hours) * 100));
          return (
            <article key={t.student_id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <label className="flex items-start gap-3">
                  <input type="checkbox" checked={picked.has(t.student_id)} onChange={() => toggle(t.student_id)} aria-label={`Select ${t.full_name} for the pack`} className="mt-1 h-4 w-4" />
                  <span>
                    <h3 className="font-bold text-slate-900">{t.full_name}</h3>
                    <p className="text-xs text-slate-500">{t.student_number} · {t.course}</p>
                  </span>
                </label>
                <div className="flex flex-wrap gap-1.5">
                  <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-bold text-slate-700">{STATUS_LABEL[t.placement.assignment_status] ?? t.placement.assignment_status}</span>
                  {t.graduated && <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-bold text-emerald-800">Graduated</span>}
                  {t.no_recent_attendance && <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-[11px] font-bold text-amber-800">No attendance in 7 days</span>}
                </div>
              </div>
              <dl className="mt-3 grid grid-cols-1 gap-3 text-xs sm:grid-cols-3">
                <div><dt className="text-slate-400 font-medium">Company</dt><dd className="font-semibold text-slate-700">{t.placement.company_name}</dd></div>
                <div><dt className="text-slate-400 font-medium">Branch</dt><dd className="font-semibold text-slate-700">{t.placement.branch_name}</dd></div>
                <div><dt className="text-slate-400 font-medium">Address</dt><dd className="font-semibold text-slate-700">{t.placement.branch_address}</dd></div>
              </dl>
              <div className="mt-3">
                <div className="flex justify-between text-xs text-slate-500">
                  <span>{t.completed_hours} / {t.required_hours} hours ({pct}%)</span>
                  <span>{t.expected_end ? `Expected end ${t.expected_end}` : 'Expected end: not available'}</span>
                </div>
                <div className="mt-1 h-2 rounded-full bg-slate-100"><div className="h-2 rounded-full bg-teal-600" style={{ width: `${pct}%` }} /></div>
              </div>
              <button type="button" onClick={() => setOpen(open === t.student_id ? null : t.student_id)} aria-expanded={open === t.student_id}
                className="mt-3 text-xs font-bold text-teal-700 underline">
                {open === t.student_id ? 'Hide details' : 'Placement history and downloads'}
              </button>
              {open === t.student_id && <TraineeDetails t={t} busy={packBusy} onPack={() => downloadPack([t.student_id])} />}
            </article>
          );
        })}
      </div>
      <PagerBar {...list.pager} />
    </div>
  );
}
