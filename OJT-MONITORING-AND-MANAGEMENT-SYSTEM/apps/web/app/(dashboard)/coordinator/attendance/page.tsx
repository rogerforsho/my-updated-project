'use client';

import { useCallback, useEffect, useState } from 'react';
import { CompanyPicker } from '@/src/components/ui/CompanyPicker';
import { exportTimecardCsv, listTimecard, type TimecardRow } from '@/src/services/timecard';
import { ExceptionReview } from './ExceptionReview';

const PAGE_SIZE = 20;
const isoDaysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
const clock = (v: string | null) => (v ? new Date(v).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—');

const LATE: Record<TimecardRow['late'], { label: string; cls: string }> = {
  on_time: { label: 'On time', cls: 'bg-emerald-50 text-emerald-800' },
  late: { label: 'Late', cls: 'bg-amber-50 text-amber-800' },
  unknown: { label: 'Unknown', cls: 'bg-slate-100 text-slate-600' },
  absent: { label: 'Absent', cls: 'bg-red-50 text-red-800' },
};
const SELFIE = { in_out: 'In and out', in_only: 'In only', none: 'None' } as const;
const GPS: Record<string, string> = {
  verified: 'Verified', flagged_out_of_bounds: 'Out of bounds', location_unavailable: 'Unavailable', not_applicable: '—',
};

function Timecard() {
  const [rows, setRows] = useState<TimecardRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [searchText, setSearchText] = useState('');
  const [search, setSearch] = useState('');
  const [companyId, setCompanyId] = useState('');
  const [from, setFrom] = useState(isoDaysAgo(14));
  const [to, setTo] = useState(isoDaysAgo(0));
  const [student, setStudent] = useState<{ id: string; name: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchText.trim()); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [searchText]);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    const res = await listTimecard(page, PAGE_SIZE, { search, companyId: companyId || undefined, from, to, studentId: student?.id });
    setLoading(false);
    if (res.error) { setError(res.error.message); return; }
    setRows(res.data?.rows ?? []); setTotal(res.data?.total ?? 0);
  }, [page, search, companyId, from, to, student]);
  useEffect(() => { void load(); }, [load]);

  async function download() {
    if (!student) return;
    const res = await exportTimecardCsv(student.id, from, to);
    if (res.error || !res.data) { setError(res.error?.message ?? 'Export failed.'); return; }
    const url = URL.createObjectURL(new Blob([res.data.csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url; a.download = res.data.filename; a.click();
    URL.revokeObjectURL(url);
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const field = 'rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal';
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">Read-only daily timecard for students in your granted departments. Select a student to see absent days and download their timecard.</p>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs font-semibold text-slate-700">Student
          <input type="search" value={searchText} onChange={(e) => setSearchText(e.target.value)} placeholder="Name or student ID..." className={`${field} w-56`} />
        </label>
        <div className="w-60"><CompanyPicker label="Company" value={companyId} onChange={(id) => { setCompanyId(id); setPage(1); }} /></div>
        <label className="flex flex-col gap-1 text-xs font-semibold text-slate-700">From
          <input type="date" value={from} max={to} onChange={(e) => { setFrom(e.target.value); setPage(1); }} className={field} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-slate-700">To
          <input type="date" value={to} min={from} onChange={(e) => { setTo(e.target.value); setPage(1); }} className={field} />
        </label>
        {student && (
          <>
            <span className="rounded-full bg-teal-50 px-3 py-2 text-xs font-bold text-teal-800">
              {student.name} <button type="button" aria-label="Show all students" onClick={() => { setStudent(null); setPage(1); }} className="ml-1 underline">clear</button>
            </span>
            <button type="button" onClick={download} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-bold text-slate-700">Download timecard (CSV)</button>
          </>
        )}
      </div>
      {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        {loading ? <p className="p-12 text-center text-sm text-slate-500">Loading timecard…</p> : rows.length === 0 ? (
          <p className="p-12 text-center text-sm text-slate-500">No attendance records match these filters.</p>
        ) : (
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr><th className="p-3">Student</th><th className="p-3">Date</th><th className="p-3">Time in</th><th className="p-3">Time out</th><th className="p-3">Hours</th><th className="p-3">Status</th><th className="p-3">Selfie</th><th className="p-3">GPS</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={r.key}>
                  <td className="p-3">
                    <button type="button" onClick={() => { setStudent({ id: r.student_id, name: r.full_name }); setPage(1); }} className="text-left font-semibold text-slate-900 hover:underline">{r.full_name || 'Student'}</button>
                    <p className="text-xs text-slate-500">{r.student_number}{r.company_name ? ` · ${r.company_name}` : ''}</p>
                  </td>
                  <td className="p-3 whitespace-nowrap">{r.date}</td>
                  <td className="p-3">{clock(r.time_in)}</td>
                  <td className="p-3">{clock(r.time_out)}</td>
                  <td className="p-3">{r.hours ?? '—'}</td>
                  <td className="p-3"><span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${LATE[r.late].cls}`}>{LATE[r.late].label}</span></td>
                  <td className="p-3 text-xs">{SELFIE[r.selfie]}</td>
                  <td className="p-3 text-xs">{GPS[r.gps] ?? r.gps}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>{total ? `${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, total)} of ${total}` : '0 records'}</span>
        <div className="flex gap-1">
          <button type="button" disabled={page <= 1 || loading} onClick={() => setPage((p) => p - 1)} className="rounded-lg border border-slate-200 px-3 py-1.5 disabled:opacity-40">Previous</button>
          <button type="button" disabled={page >= totalPages || loading} onClick={() => setPage((p) => p + 1)} className="rounded-lg border border-slate-200 px-3 py-1.5 disabled:opacity-40">Next</button>
        </div>
      </div>
    </div>
  );
}

export default function CoordinatorAttendancePage() {
  const [tab, setTab] = useState<'timecard' | 'exceptions'>('timecard');
  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 page-fade-in">
      <header className="mb-4">
        <h1 className="text-2xl font-black text-slate-900 font-serif tracking-tight">Attendance</h1>
      </header>
      <div className="mb-4 flex gap-2" role="tablist" aria-label="Attendance views">
        {([['timecard', 'Timecard'], ['exceptions', 'Exceptions to review']] as const).map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} type="button" onClick={() => setTab(id)}
            className={`rounded-lg px-4 py-2 text-sm font-semibold ${tab === id ? 'bg-[var(--cdm-green)] text-white' : 'border border-slate-300 text-slate-700'}`}>{label}</button>
        ))}
      </div>
      {tab === 'timecard' ? <Timecard /> : <ExceptionReview />}
    </div>
  );
}
