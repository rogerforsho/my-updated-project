'use client';

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { CompanyPicker } from '@/src/components/ui/CompanyPicker';
import { exportTimecardCsv, listTimecard, type TimecardRow } from '@/src/services/timecard';
import { ExceptionReview } from './ExceptionReview';
import { DtrSheet } from './DtrSheet';
import { PagerBar, usePageSize } from '@/src/components/ui/ListControls';

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

// shortcut: 1000-log cap per range, move grouping to an SQL view/RPC if coordinators hit it
const FETCH_CAP = 1000;
const LATE_ORDER: TimecardRow['late'][] = ['on_time', 'late', 'unknown', 'absent'];

function Timecard() {
  const [rows, setRows] = useState<TimecardRow[]>([]);
  const [total, setTotal] = useState(0);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const [pageSize, changePageSize] = usePageSize();
  const [searchText, setSearchText] = useState('');
  const [search, setSearch] = useState('');
  const [companyId, setCompanyId] = useState('');
  const [from, setFrom] = useState(isoDaysAgo(14));
  const [to, setTo] = useState(isoDaysAgo(0));
  const [student, setStudent] = useState<{ id: string; name: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dtrStudentId, setDtrStudentId] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchText.trim()); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [searchText]);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    // Fetch every log in range so a student's totals are never split across pages; paging is over students below.
    const res = await listTimecard(1, FETCH_CAP, { search, companyId: companyId || undefined, from, to, studentId: student?.id });
    setLoading(false);
    if (res.error) { setError(res.error.message); return; }
    setRows(res.data?.rows ?? []); setTotal(res.data?.total ?? 0);
  }, [search, companyId, from, to, student]);
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

  const groups = useMemo(() => {
    const m = new Map<string, { student_id: string; full_name: string; student_number: string; company_name: string; logs: TimecardRow[]; hours: number; days: number; counts: Partial<Record<TimecardRow['late'], number>> }>();
    for (const r of rows) { // rows arrive newest first
      const g = m.get(r.student_id) ?? { student_id: r.student_id, full_name: r.full_name, student_number: r.student_number, company_name: r.company_name, logs: [], hours: 0, days: 0, counts: {} };
      g.logs.push(r);
      g.hours += r.hours ?? 0;
      if (r.late !== 'absent') g.days += 1;
      g.counts[r.late] = (g.counts[r.late] ?? 0) + 1;
      m.set(r.student_id, g);
    }
    return [...m.values()];
  }, [rows]);
  const pagedGroups = groups.slice((page - 1) * pageSize, page * pageSize);
  const toggle = (id: string) => setExpanded((s) => { const n = new Set(s); if (!n.delete(id)) n.add(id); return n; });
  const totalPages = Math.max(1, Math.ceil(groups.length / pageSize));
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
            <button type="button" onClick={() => setDtrStudentId(student.id)} className="rounded-lg bg-[var(--cdm-green)] px-3 py-2 text-xs font-bold text-white">Download DTR</button>
          </>
        )}
      </div>
      {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {total > rows.length && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">Showing the first {FETCH_CAP.toLocaleString()} logs. Narrow the dates or pick a company.</p>}

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        {loading ? <p className="p-12 text-center text-sm text-slate-500">Loading timecard…</p> : rows.length === 0 ? (
          <p className="p-12 text-center text-sm text-slate-500">No attendance records match these filters.</p>
        ) : (
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr><th className="p-3">Student</th><th className="p-3">Days logged</th><th className="p-3">Total hours</th><th className="p-3">Status summary</th><th className="p-3">Latest log</th><th className="p-3">DTR</th><th className="w-10 p-3"><span className="sr-only">Expand</span></th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pagedGroups.map((g) => {
                const open = expanded.has(g.student_id);
                return (
                  <Fragment key={g.student_id}>
                    <tr onClick={() => toggle(g.student_id)} className="cursor-pointer hover:bg-slate-50">
                      <td className="p-3">
                        <p className="font-semibold text-slate-900">{g.full_name || 'Student'}</p>
                        <p className="text-xs text-slate-500 tabular-nums">{g.student_number}{g.company_name ? ` · ${g.company_name}` : ''}</p>
                      </td>
                      <td className="p-3 whitespace-nowrap">{g.days} {g.days === 1 ? 'day' : 'days'}</td>
                      <td className="p-3 whitespace-nowrap tabular-nums">{Math.round(g.hours * 100) / 100} hrs</td>
                      <td className="p-3">
                        <div className="flex flex-wrap gap-1">
                          {LATE_ORDER.filter((k) => g.counts[k]).map((k) => (
                            <span key={k} className={`rounded-full px-2.5 py-0.5 text-xs font-bold whitespace-nowrap ${LATE[k].cls}`}>{g.counts[k]} {LATE[k].label}</span>
                          ))}
                        </div>
                      </td>
                      <td className="p-3 whitespace-nowrap">{g.logs[0].date}</td>
                      <td className="p-3">
                        <button type="button" aria-label={`Download DTR for ${g.full_name || 'student'}`} onClick={(e) => { e.stopPropagation(); setDtrStudentId(g.student_id); }} className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-bold text-slate-700 hover:bg-slate-50">DTR</button>
                      </td>
                      <td className="p-3">
                        <button type="button" aria-expanded={open} aria-label={`${open ? 'Hide' : 'Show'} daily logs for ${g.full_name || 'student'}`} onClick={(e) => { e.stopPropagation(); toggle(g.student_id); }} className="rounded p-1 text-slate-500 hover:bg-slate-100">
                          <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" className={`transition-transform ${open ? 'rotate-180' : ''}`}><path d="m5 8 5 5 5-5" /></svg>
                        </button>
                      </td>
                    </tr>
                    {open && (
                      <tr className="bg-slate-50">
                        <td colSpan={7} className="p-0">
                          <div className="page-fade-in py-2 pl-8 pr-3">
                            <table className="w-full text-left text-sm">
                              <thead className="text-xs uppercase tracking-wide text-slate-500">
                                <tr><th className="p-2">Date</th><th className="p-2">Time in</th><th className="p-2">Time out</th><th className="p-2">Hours</th><th className="p-2">Status</th><th className="p-2">Selfie</th><th className="p-2">GPS</th></tr>
                              </thead>
                              <tbody className="divide-y divide-slate-200">
                                {g.logs.map((r) => (
                                  <tr key={r.key}>
                                    <td className="p-2 whitespace-nowrap">{r.date}</td>
                                    <td className="p-2">{clock(r.time_in)}</td>
                                    <td className="p-2">{clock(r.time_out)}</td>
                                    <td className="p-2">{r.hours ?? '—'}</td>
                                    <td className="p-2"><span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${LATE[r.late].cls}`}>{LATE[r.late].label}</span></td>
                                    <td className="p-2 text-xs">{SELFIE[r.selfie]}</td>
                                    <td className="p-2 text-xs">{GPS[r.gps] ?? r.gps}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                            {!student && (
                              <button type="button" onClick={() => { setStudent({ id: g.student_id, name: g.full_name }); setPage(1); }} className="mt-1 text-xs font-semibold text-teal-800 underline">Show absent days &amp; CSV</button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {dtrStudentId && <DtrSheet studentId={dtrStudentId} initialMonth={to.slice(0, 7)} onClose={() => setDtrStudentId(null)} />}

      <PagerBar page={page} totalPages={totalPages} total={groups.length} setPage={setPage} pageSize={pageSize} setPageSize={(n) => { changePageSize(n); setPage(1); }} />
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
