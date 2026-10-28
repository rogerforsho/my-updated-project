'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSearchPaging, SearchBox, PagerBar } from '@/src/components/ui/ListControls';
import { listIncidentReports, reviewIncidentReport, type IncidentReportRow } from '@/src/services/incidentReports';

const CATEGORY_LABELS: Record<string, string> = {
  harassment: 'Harassment',
  safety: 'Safety concern',
  supervisor_conduct: 'Supervisor conduct',
  workplace_condition: 'Workplace condition',
  other: 'Other',
};

export default function IncidentReportsPage() {
  const [filter, setFilter] = useState<'open' | 'all'>('open');
  const [rows, setRows] = useState<IncidentReportRow[]>([]);
  const [selected, setSelected] = useState<IncidentReportRow | null>(null);
  const list = useSearchPaging(rows, (r) => `${r.student_name} ${r.student_number} ${r.course} ${CATEGORY_LABELS[r.category] ?? r.category}`);
  const [response, setResponse] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const result = await listIncidentReports(filter);
    if (result.data) { setRows(result.data); setError(''); }
    else setError(result.error?.message ?? 'Could not load incident reports.');
  }, [filter]);
  useEffect(() => { void load(); }, [load]);

  async function review(status: 'acknowledged' | 'closed') {
    if (!selected) return;
    setBusy(true); setError('');
    const result = await reviewIncidentReport({ incident_id: selected.incident_id, status, response });
    setBusy(false);
    if (result.error) { setError(result.error.message); return; }
    setSelected(null); setResponse('');
    await load();
  }

  return <main className="mx-auto max-w-5xl p-6 lg:p-8">
    <h1 className="text-2xl font-bold text-slate-900">Incident Reports</h1>
    <p className="mt-1 text-sm text-slate-600">
      Confidential concerns from students in your department. Supervisors, companies and Super Admins cannot see these reports.
    </p>
    <div className="mt-4 flex gap-2 text-sm" role="group" aria-label="Filter reports">
      {(['open', 'all'] as const).map((value) => <button key={value} type="button" onClick={() => setFilter(value)} aria-pressed={filter === value}
        className={`rounded-lg border px-3 py-1.5 ${filter === value ? 'border-emerald-800 bg-emerald-800 text-white' : 'border-slate-300 text-slate-700'}`}>
        {value === 'open' ? 'Open' : 'All'}
      </button>)}
    </div>
    {!!error && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    <div className="mt-4"><SearchBox value={list.search} onChange={list.setSearch} placeholder="Search student, ID, course or category..." /></div>
    <div className="mt-6 space-y-3">
      {list.visible.map((row) => <button key={row.incident_id} type="button" onClick={() => { setSelected(row); setResponse(row.coordinator_response ?? ''); }}
        className="w-full rounded-xl border border-slate-200 bg-white p-4 text-left hover:border-emerald-700">
        <span className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-semibold text-slate-900">{CATEGORY_LABELS[row.category] ?? row.category} · {row.student_name} ({row.student_number})</span>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold uppercase text-slate-700">{row.status}</span>
        </span>
        <span className="mt-1 block truncate text-sm text-slate-600">{row.description}</span>
        <span className="mt-1 block text-xs text-slate-500">{row.course} · submitted {new Date(row.created_at).toLocaleString()}</span>
      </button>)}
      {!list.visible.length && <p className="rounded-xl bg-slate-50 p-6 text-sm text-slate-600">{list.search ? 'No reports match your search.' : filter === 'open' ? 'No open incident reports.' : 'No incident reports yet.'}</p>}
    </div>
    <div className="mt-4"><PagerBar page={list.page} totalPages={list.totalPages} total={list.matched} setPage={list.setPage} /></div>
    {selected && <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 sm:items-center">
      <section role="dialog" aria-modal="true" aria-labelledby="incident-title" className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
        <h2 id="incident-title" className="text-xl font-bold">{CATEGORY_LABELS[selected.category] ?? selected.category}</h2>
        <p className="mt-1 text-sm text-slate-600">{selected.student_name} ({selected.student_number}) · {selected.course} · {new Date(selected.created_at).toLocaleString()}</p>
        <p className="mt-4 whitespace-pre-wrap break-words rounded-lg bg-slate-50 p-3 text-sm text-slate-900">{selected.description}</p>
        {selected.status === 'closed' ? <>
          <p className="mt-4 text-sm font-semibold">Response to the student</p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{selected.coordinator_response}</p>
        </> : <>
          <label htmlFor="incident-response" className="mt-4 block text-sm font-semibold">Response to the student</label>
          <textarea id="incident-response" value={response} onChange={(e) => setResponse(e.target.value)} maxLength={3000} rows={4}
            className="mt-2 w-full rounded-lg border p-2 text-sm" placeholder="Required when closing. The student can read this." />
        </>}
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button type="button" onClick={() => setSelected(null)} className="rounded-lg border px-4 py-2">Close</button>
          {selected.status === 'submitted' && <button type="button" disabled={busy} onClick={() => void review('acknowledged')}
            className="rounded-lg border border-emerald-800 px-4 py-2 text-emerald-800 disabled:opacity-50">Acknowledge</button>}
          {selected.status !== 'closed' && <button type="button" disabled={busy || !response.trim()} onClick={() => void review('closed')}
            className="rounded-lg bg-emerald-800 px-4 py-2 font-semibold text-white disabled:opacity-50">Close report</button>}
        </div>
      </section>
    </div>}
  </main>;
}
