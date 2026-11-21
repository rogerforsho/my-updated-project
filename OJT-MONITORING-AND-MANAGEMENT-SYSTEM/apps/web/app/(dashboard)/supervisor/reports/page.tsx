'use client';

import { RowsLoading } from '@/src/components/ui/RowsLoading';
import { useEffect, useState, useCallback, useMemo } from 'react';
import Button from '@/src/components/ui/Button';
import Alert from '@/src/components/ui/Alert';
import Modal from '@/src/components/ui/Modal';
import { SearchBox } from '@/src/components/ui/ListControls';
import { FileText } from '@/src/components/ui/Icons';
import {
  listReportsForSupervisor,
  endorseReportBySupervisor,
  type ReportWithStudent
} from '@/src/services/reports';
import { getSignedDocumentUrl } from '@/src/services/storage';
import { describeReportType } from '@ojt/shared';
import { isoDate, presetRange } from '@/src/lib/manila-date';

// Anything not approved or returned (including unexpected stored values) stays in Needs review so no report vanishes.
const isDecided = (r: ReportWithStudent) => r.supervisor_decision === 'approved' || r.supervisor_decision === 'returned';

const LANES = [
  { key: 'pending', title: 'Needs review', dot: 'bg-amber-400', empty: 'Nothing is waiting for you.', pill: 'to review', test: (r: ReportWithStudent) => !isDecided(r) },
  { key: 'approved', title: 'Approved', dot: 'bg-emerald-500', empty: 'No approved reports.', pill: 'approved', test: (r: ReportWithStudent) => r.supervisor_decision === 'approved' },
  { key: 'returned', title: 'Returned', dot: 'bg-rose-500', empty: 'No reports sent back for correction.', pill: 'returned', test: (r: ReportWithStudent) => r.supervisor_decision === 'returned' },
] as const;
type LaneKey = (typeof LANES)[number]['key'];

const RANGES = [['all', 'All time'], ['week', 'This week'], ['month', 'This month']] as const;
type Range = (typeof RANGES)[number][0];

const initials = (name?: string | null) => (name ?? '?').split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();
const shortDate = (d: string) => new Date(d).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
const plural = (n: number) => `${n} ${n === 1 ? 'report' : 'reports'}`;

export default function SupervisorReportsPage() {
  const [reports, setReports] = useState<ReportWithStudent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [search, setSearch] = useState('');
  const [range, setRange] = useState<Range>('all');

  const [drawer, setDrawer] = useState<{ studentId: string; lane: LaneKey } | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [remarks, setRemarks] = useState<Record<string, string>>({});
  const [batchRemark, setBatchRemark] = useState('');
  const [busy, setBusy] = useState(false);
  const [openingDocId, setOpeningDocId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    // shortcut: one 1000-row fetch so reports can be grouped per student; add server-side grouping if a supervisor ever passes 1000 journals.
    const result = await listReportsForSupervisor(1, 1000);
    setLoading(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    setReports(result.data!.reports);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleOpenDocument(filePath: string, reportId: string) {
    setOpeningDocId(reportId);
    const result = await getSignedDocumentUrl(filePath, 120);
    setOpeningDocId(null);
    if (result.error || !result.data?.signedUrl) {
      setError(result.error?.message || 'Failed to generate document preview link.');
      return;
    }
    window.open(result.data.signedUrl, '_blank', 'noopener,noreferrer');
  }

  async function decide(items: ReportWithStudent[], decision: 'approved' | 'returned', feedback: (r: ReportWithStudent) => string) {
    if (items.some((r) => !feedback(r).trim())) {
      setError('Please provide remarks before submitting.');
      return;
    }
    setBusy(true);
    setError('');
    setSuccess('');
    let ok = 0;
    let failed = '';
    for (const r of items) {
      const res = await endorseReportBySupervisor(r.report_id, decision, feedback(r).trim());
      if (res.error) failed = res.error.message;
      else ok++;
    }
    setBusy(false);
    if (ok) setSuccess(`${plural(ok)} ${decision}.`);
    if (failed) setError(`${items.length - ok} could not be saved: ${failed}`);
    setSelected(new Set());
    setBatchRemark('');
    setExpandedId(null);
    await load();
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const [from, to] = presetRange(range);
    return reports.filter((r) => {
      if (q && !`${r.students?.users?.full_name ?? ''} ${r.students?.student_number ?? ''}`.toLowerCase().includes(q)) return false;
      if (!from) return true;
      const day = isoDate(new Date(r.submission_date));
      return day >= from && day <= to;
    });
  }, [reports, search, range]);

  // Rows arrive newest first, so each group's first item is the student's latest submission.
  const lanes = useMemo(() => LANES.map((lane) => {
    const items = filtered.filter(lane.test);
    const groups = new Map<string, ReportWithStudent[]>();
    for (const r of items) groups.set(r.student_id, [...(groups.get(r.student_id) ?? []), r]);
    return { lane, count: items.length, groups: Array.from(groups.values()) };
  }), [filtered]);

  const drawerLane = drawer ? LANES.find((l) => l.key === drawer.lane)! : null;
  // Drawer reads the unfiltered list so the date/search filter never hides part of a student's history.
  const drawerReports = drawer && drawerLane
    ? reports.filter((r) => r.student_id === drawer.studentId && drawerLane.test(r))
    : [];
  const drawerStudent = drawerReports[0]?.students;
  const canDecide = drawer?.lane === 'pending';

  // Close the drawer once a student has nothing left in that lane.
  useEffect(() => {
    if (drawer && !loading && drawerReports.length === 0) setDrawer(null);
  }, [drawer, loading, drawerReports.length]);

  const closeDrawer = () => { setDrawer(null); setSelected(new Set()); setExpandedId(null); setBatchRemark(''); };
  const waiting = reports.filter((r) => !isDecided(r)).length;
  const selectedItems = drawerReports.filter((r) => selected.has(r.report_id));

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-[1600px] mx-auto page-fade-in">
      <header>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Trainee Weekly Journals</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Approve or return the weekly journals (PDF) of your assigned interns, one card per student. Each submission receives one recorded decision. Approved journals are later merged into one PDF for the OJT Coordinator.
          {!loading && reports.length > 0 && (
            <span className="font-semibold text-slate-700"> {waiting === 0 ? 'You are all caught up.' : `${waiting} ${waiting === 1 ? 'is' : 'are'} waiting for your review.`}</span>
          )}
        </p>
      </header>

      {success && <Alert type="info" message={success} />}
      {error && <Alert type="error" message={error} />}

      {loading && reports.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
          <RowsLoading label="Loading trainee reports" />
        </div>
      ) : reports.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm flex flex-col items-center justify-center py-20">
          <FileText className="w-8 h-8 text-slate-300 mb-3" />
          <p className="text-sm font-semibold text-slate-700">No reports submitted yet</p>
          <p className="text-xs text-slate-500 mt-1">
            Your assigned trainees will submit their weekly journals here.
          </p>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <SearchBox value={search} onChange={setSearch} placeholder="Search by student name or ID" />
            <div role="group" aria-label="Submission date" className="inline-flex rounded-full bg-slate-100 p-1">
              {RANGES.map(([k, label]) => (
                <button key={k} type="button" aria-pressed={range === k} onClick={() => setRange(k)}
                  className={`px-4 py-1.5 rounded-full text-xs font-bold cursor-pointer ${range === k ? 'bg-[#0A3824] text-[#E4DBC4] shadow' : 'text-slate-600'}`}>{label}</button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
            {lanes.map(({ lane, count, groups }) => (
              <section key={lane.key} aria-labelledby={`lane-${lane.key}`} className="rounded-2xl bg-slate-50 border border-slate-200/80 dark:border-slate-800 min-w-0">
                <h2 id={`lane-${lane.key}`} className="px-4 py-3.5 flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
                  <span className={`w-2.5 h-2.5 rounded-full ${lane.dot}`} aria-hidden="true" />
                  {lane.title}
                  <span className="ml-auto min-w-6 text-center rounded-full bg-white border border-slate-200 px-2 py-0.5 text-xs font-semibold tabular-nums text-slate-600">{count}</span>
                </h2>
                <ul className="px-3 pb-3 space-y-3 lg:max-h-[calc(100vh-18rem)] lg:overflow-y-auto">
                  {groups.map((rs) => {
                    const s = rs[0].students;
                    const name = s?.users?.full_name;
                    return (
                      <li key={rs[0].student_id}>
                        <article className="rounded-xl bg-white border border-slate-200/80 dark:border-slate-800 p-4 shadow-xs space-y-3 transition-[transform,box-shadow] duration-150 hover:-translate-y-0.5 hover:shadow-sm">
                          <div className="flex items-center gap-3">
                            <span aria-hidden="true" className="grid place-items-center w-9 h-9 shrink-0 rounded-full bg-emerald-50 text-xs font-bold text-[#0A3824]">{initials(name)}</span>
                            <div className="min-w-0">
                              <p className="font-bold text-sm text-slate-900 truncate">{name}</p>
                              <p className="text-xs text-slate-500 font-mono truncate">{s?.student_number} • {s?.course}</p>
                            </div>
                          </div>
                          <div className="flex items-center justify-between gap-2">
                            <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-bold text-slate-700">{rs.length} {lane.pill === 'to review' ? 'to review' : lane.pill}</span>
                            <span className="text-xs text-slate-500">Latest: {shortDate(rs[0].submission_date)}</span>
                          </div>
                          <Button
                            variant={lane.key === 'pending' ? 'primary' : 'outline'}
                            size="sm"
                            className="w-full"
                            onClick={() => { setDrawer({ studentId: rs[0].student_id, lane: lane.key }); setSelected(new Set()); setExpandedId(null); }}
                          >
                            {lane.key === 'pending' ? `Review Reports (${rs.length})` : `View History (${rs.length})`}
                          </Button>
                        </article>
                      </li>
                    );
                  })}
                  {groups.length === 0 && (
                    <li className="py-8 text-center text-xs text-slate-500">{lane.empty}</li>
                  )}
                </ul>
              </section>
            ))}
          </div>
        </>
      )}

      <Modal
        title={`${drawerStudent?.users?.full_name ?? 'Student'} · ${drawerLane?.title ?? ''}`}
        open={!!drawer}
        onClose={closeDrawer}
        size="2xl"
      >
        <div className="space-y-4">
          {canDecide && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 space-y-2.5">
              <label className="flex items-center gap-2 text-xs font-bold text-slate-700">
                <input
                  type="checkbox"
                  checked={drawerReports.length > 0 && selected.size === drawerReports.length}
                  onChange={(e) => setSelected(e.target.checked ? new Set(drawerReports.map((r) => r.report_id)) : new Set())}
                />
                Select all ({drawerReports.length})
              </label>
              <textarea
                value={batchRemark}
                onChange={(e) => setBatchRemark(e.target.value)}
                placeholder="One remark applied to every selected journal"
                aria-label="Remark for batch approval"
                rows={2}
                className="w-full rounded-xl border border-slate-200 bg-white p-2.5 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-[#0A3824]"
              />
              <Button
                size="sm"
                loading={busy}
                disabled={selected.size === 0 || !batchRemark.trim()}
                onClick={() => decide(selectedItems, 'approved', () => batchRemark)}
                className="bg-[#0A3824] hover:bg-[#092E1D] text-[var(--cdm-sand)] font-bold"
              >
                Batch Approve Selected ({selected.size})
              </Button>
            </div>
          )}

          <ul className="space-y-2.5">
            {drawerReports.map((r) => {
              const open = expandedId === r.report_id;
              const type = describeReportType(r.report_type);
              const status = r.supervisor_decision ?? 'pending';
              return (
                <li key={r.report_id} className="rounded-xl border border-slate-200 bg-white">
                  <div className="flex items-center gap-3 p-3">
                    {canDecide && (
                      <input
                        type="checkbox"
                        aria-label={`Select ${type.label} ${shortDate(r.submission_date)}`}
                        checked={selected.has(r.report_id)}
                        onChange={(e) => setSelected((prev) => {
                          const next = new Set(prev);
                          if (e.target.checked) next.add(r.report_id); else next.delete(r.report_id);
                          return next;
                        })}
                      />
                    )}
                    <button
                      type="button"
                      aria-expanded={open}
                      onClick={() => setExpandedId(open ? null : r.report_id)}
                      className="flex-1 min-w-0 text-left cursor-pointer"
                    >
                      <p className="text-sm font-semibold text-slate-800 capitalize">
                        {type.label}
                        {type.legacy && <span className="text-xs text-amber-700 font-normal normal-case"> (retired type)</span>}
                        <span className="text-xs text-slate-500 font-normal normal-case"> · {shortDate(r.submission_date)}</span>
                      </p>
                      {r.supervisor_feedback && <p className="text-xs text-slate-500 truncate">Your remarks: {r.supervisor_feedback}</p>}
                    </button>
                    <span className={`shrink-0 rounded-full border px-2.5 py-0.5 text-xs font-bold capitalize ${status === 'approved' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : status === 'returned' ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>{status}</span>
                  </div>

                  {open && (
                    <div className="border-t border-slate-100 p-3 space-y-3">
                      {r.remarks && (
                        <p className="text-xs text-slate-600 bg-slate-50 p-2 rounded-lg border border-slate-100">
                          <span className="font-bold text-slate-500">Intern note:</span> {r.remarks}
                        </p>
                      )}
                      {r.supervisor_feedback && (
                        <p className={`text-xs p-2 rounded-lg border ${r.supervisor_decision === 'returned' ? 'bg-rose-50 border-rose-200 text-rose-900' : 'bg-emerald-50/70 border-emerald-200 text-emerald-900'}`}>
                          <span className="font-bold">Your remarks:</span> {r.supervisor_feedback}
                          {r.supervisor_decided_at && <span className="block mt-1 opacity-80">Decided {shortDate(r.supervisor_decided_at)}</span>}
                        </p>
                      )}
                      <Button variant="outline" size="sm" onClick={() => handleOpenDocument(r.file_path, r.report_id)} disabled={openingDocId === r.report_id}>
                        <FileText className="w-3.5 h-3.5" />
                        {openingDocId === r.report_id ? 'Opening…' : 'Open document'}
                      </Button>
                      {canDecide && (
                        <div className="space-y-2">
                          <textarea
                            value={remarks[r.report_id] ?? ''}
                            onChange={(e) => setRemarks((m) => ({ ...m, [r.report_id]: e.target.value }))}
                            placeholder="Confirm the intern's tasks for the week, or note what to correct…"
                            aria-label="Supervisor remarks"
                            rows={3}
                            className="w-full rounded-xl border border-slate-200 p-2.5 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-[#0A3824]"
                          />
                          <div className="flex justify-end gap-2">
                            <Button size="sm" loading={busy} disabled={!(remarks[r.report_id] ?? '').trim()} onClick={() => decide([r], 'returned', (x) => remarks[x.report_id] ?? '')} className="bg-rose-600 hover:bg-rose-700 text-white font-bold">Return</Button>
                            <Button size="sm" loading={busy} disabled={!(remarks[r.report_id] ?? '').trim()} onClick={() => decide([r], 'approved', (x) => remarks[x.report_id] ?? '')} className="bg-[#0A3824] hover:bg-[#092E1D] text-[var(--cdm-sand)] font-bold">Approve</Button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      </Modal>
    </div>
  );
}
