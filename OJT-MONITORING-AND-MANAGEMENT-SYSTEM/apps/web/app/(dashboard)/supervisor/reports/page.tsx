'use client';

import { RowsLoading } from '@/src/components/ui/RowsLoading';
import { useEffect, useState, useCallback } from 'react';
import Button from '@/src/components/ui/Button';
import Alert from '@/src/components/ui/Alert';
import Modal from '@/src/components/ui/Modal';
import { FileText } from '@/src/components/ui/Icons';
import {
  listReportsForSupervisor,
  endorseReportBySupervisor,
  type ReportWithStudent
} from '@/src/services/reports';
import { getSignedDocumentUrl } from '@/src/services/storage';

// Anything not approved or returned (including unexpected stored values) stays in Needs review so no report vanishes.
const isDecided = (r: ReportWithStudent) => r.supervisor_decision === 'approved' || r.supervisor_decision === 'returned';

const LANES = [
  { key: 'pending', title: 'Needs review', dot: 'bg-amber-400', empty: 'Nothing is waiting for you.', test: (r: ReportWithStudent) => !isDecided(r) },
  { key: 'approved', title: 'Approved', dot: 'bg-emerald-500', empty: 'No approved reports on this page.', test: (r: ReportWithStudent) => r.supervisor_decision === 'approved' },
  { key: 'returned', title: 'Returned', dot: 'bg-rose-500', empty: 'No reports sent back for correction.', test: (r: ReportWithStudent) => r.supervisor_decision === 'returned' },
] as const;

const initials = (name?: string | null) => (name ?? '?').split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();
const shortDate = (d: string) => new Date(d).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });

export default function SupervisorReportsPage() {
  const [reports, setReports] = useState<ReportWithStudent[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Endorsement Modal
  const [endorsingReport, setEndorsingReport] = useState<ReportWithStudent | null>(null);
  const [feedback, setFeedback] = useState('');
  const [submittingFeedback, setSubmittingFeedback] = useState(false);
  const [openingDocId, setOpeningDocId] = useState<string | null>(null);

  const load = useCallback(async (p: number) => {
    setLoading(true);
    setError('');
    const result = await listReportsForSupervisor(p, 20);
    setLoading(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    setReports(result.data!.reports);
    setTotal(result.data!.total);
  }, []);

  useEffect(() => {
    load(page);
  }, [page, load]);

  async function handleOpenDocument(filePath: string, reportId: string) {
    setOpeningDocId(reportId);
    const result = await getSignedDocumentUrl(filePath, 120);
    setOpeningDocId(null);
    if (result.error || !result.data?.signedUrl) {
      alert(result.error?.message || 'Failed to generate document preview link.');
      return;
    }
    window.open(result.data.signedUrl, '_blank', 'noopener,noreferrer');
  }

  async function handleSaveDecision(decision: 'approved' | 'returned') {
    if (!endorsingReport) return;
    if (!feedback.trim()) {
      alert('Please provide feedback or mentor comments before submitting.');
      return;
    }

    setSubmittingFeedback(true);
    const result = await endorseReportBySupervisor(endorsingReport.report_id, decision, feedback.trim());
    setSubmittingFeedback(false);

    if (result.error) {
      setError(result.error.message);
      return;
    }

    setSuccess(decision === 'approved' ? 'Report approved.' : 'Report returned to the student for correction.');
    setEndorsingReport(null);
    setFeedback('');
    load(page);
  }

  const totalPages = Math.max(1, Math.ceil(total / 20));
  const waiting = reports.filter((r) => !isDecided(r)).length;

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-[1600px] mx-auto page-fade-in">
      <header>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Trainee Accomplishment Reports</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Approve or return daily accomplishment reports for your assigned interns. Each submission receives one recorded decision.
          {!loading && reports.length > 0 && (
            <span className="font-semibold text-slate-700"> {waiting === 0 ? 'You are all caught up.' : `${waiting} on this page ${waiting === 1 ? 'is' : 'are'} waiting for your review.`}</span>
          )}
        </p>
      </header>

      {success && <Alert type="info" message={success} />}
      {error && <Alert type="error" message={error} />}

      {loading ? (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
          <RowsLoading label="Loading trainee reports" />
        </div>
      ) : reports.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm flex flex-col items-center justify-center py-20">
          <FileText className="w-8 h-8 text-slate-300 mb-3" />
          <p className="text-sm font-semibold text-slate-700">No reports submitted yet</p>
          <p className="text-xs text-slate-500 mt-1">
            Your assigned trainees will submit their weekly accomplishment journals here.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
          {LANES.map((lane) => {
            const items = reports.filter(lane.test);
            return (
              <section key={lane.key} aria-labelledby={`lane-${lane.key}`} className="rounded-2xl bg-slate-50 border border-slate-200/80 dark:border-slate-800 min-w-0">
                <h2 id={`lane-${lane.key}`} className="px-4 py-3.5 flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
                  <span className={`w-2.5 h-2.5 rounded-full ${lane.dot}`} aria-hidden="true" />
                  {lane.title}
                  <span className="ml-auto min-w-6 text-center rounded-full bg-white border border-slate-200 px-2 py-0.5 text-xs font-semibold tabular-nums text-slate-600">{items.length}</span>
                </h2>
                <ul className="px-3 pb-3 space-y-3 lg:max-h-[calc(100vh-15rem)] lg:overflow-y-auto">
                  {items.map((r) => {
                    const name = r.students?.users?.full_name;
                    return (
                      <li key={r.report_id}>
                        <article className="rounded-xl bg-white border border-slate-200/80 dark:border-slate-800 p-4 shadow-xs space-y-3 transition-[transform,box-shadow] duration-150 hover:-translate-y-0.5 hover:shadow-sm">
                          <div className="flex items-center gap-3">
                            <span aria-hidden="true" className="grid place-items-center w-9 h-9 shrink-0 rounded-full bg-emerald-50 text-xs font-bold text-[#0A3824]">{initials(name)}</span>
                            <div className="min-w-0">
                              <p className="font-bold text-sm text-slate-900 truncate">{name}</p>
                              <p className="text-xs text-slate-500 font-mono truncate">{r.students?.student_number} • {r.students?.course}</p>
                            </div>
                          </div>

                          <p className="text-sm font-semibold text-slate-800 capitalize">
                            {r.report_type.replace(/_/g, ' ')}
                            <span className="text-xs text-slate-500 font-normal normal-case"> · {shortDate(r.submission_date)}</span>
                          </p>

                          {r.remarks && (
                            <p className="text-xs text-slate-600 bg-slate-50 p-2 rounded-lg border border-slate-100">
                              <span className="font-bold text-slate-500">Intern note:</span> {r.remarks}
                            </p>
                          )}
                          {r.supervisor_feedback && (
                            <p className={`text-xs p-2 rounded-lg border ${r.supervisor_decision === 'returned' ? 'bg-rose-50 border-rose-200 text-rose-900' : 'bg-emerald-50/70 border-emerald-200 text-emerald-900'}`}>
                              <span className="font-bold">Your remarks:</span> {r.supervisor_feedback}
                              {r.supervisor_decided_at && <span className="block mt-1 opacity-80">Decided {new Date(r.supervisor_decided_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}</span>}
                            </p>
                          )}

                          <div className="flex gap-2 pt-0.5">
                            <Button
                              variant="outline"
                              size="sm"
                              className="flex-1"
                              onClick={() => handleOpenDocument(r.file_path, r.report_id)}
                              disabled={openingDocId === r.report_id}
                            >
                              <FileText className="w-3.5 h-3.5" />
                              {openingDocId === r.report_id ? 'Opening…' : 'View'}
                            </Button>
                            {!isDecided(r) && (
                              <Button
                                size="sm"
                                className="flex-1"
                                onClick={() => {
                                  setEndorsingReport(r);
                                  setFeedback(r.supervisor_feedback || '');
                                }}
                              >
                                Review
                              </Button>
                            )}
                          </div>
                        </article>
                      </li>
                    );
                  })}
                  {items.length === 0 && (
                    <li className="py-8 text-center text-xs text-slate-500">{lane.empty}</li>
                  )}
                </ul>
              </section>
            );
          })}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 text-sm text-slate-500">
          <span>Page {page} of {totalPages}</span>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>
              Previous
            </Button>
            <Button variant="ghost" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
              Next
            </Button>
          </div>
        </div>
      )}

      {/* Supervisor report decision modal */}
      <Modal
        title={`Supervisor Feedback: ${endorsingReport?.students?.users?.full_name || 'Accomplishment Log'}`}
        open={!!endorsingReport}
        onClose={() => setEndorsingReport(null)}
        footer={
          <div className="flex items-center justify-between w-full gap-2">
            <Button variant="ghost" onClick={() => setEndorsingReport(null)} disabled={submittingFeedback}>
              Cancel
            </Button>
            <Button onClick={() => handleSaveDecision('returned')} loading={submittingFeedback} className="bg-rose-600 hover:bg-rose-700 text-white font-bold">Return for correction</Button>
            <Button onClick={() => handleSaveDecision('approved')} loading={submittingFeedback} className="bg-[#0A3824] hover:bg-[#092E1D] text-[var(--cdm-sand)] font-bold">Approve report</Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-1">
            <p className="font-bold text-slate-800">
              Log Type: <span className="capitalize">{endorsingReport?.report_type.replace(/_/g, ' ')}</span>
            </p>
            <p className="text-slate-500">
              Intern: {endorsingReport?.students?.users?.full_name} ({endorsingReport?.students?.student_number})
            </p>
            {endorsingReport?.remarks && (
              <p className="text-slate-700 italic pt-1 border-t border-slate-200">
                &ldquo;{endorsingReport.remarks}&rdquo;
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold text-slate-700">
              Supervisor Mentor Feedback & Validation Remarks <span className="text-rose-500">*</span>
            </label>
            <textarea
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder="Confirm intern's accomplishments, verify weekly tasks performed, or note areas for improvement..."
              rows={4}
              className="w-full rounded-xl border border-slate-200 p-3 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-[#0A3824]"
              required
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}
