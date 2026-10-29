'use client';

import { useEffect, useState, useCallback } from 'react';
import Button from '@/src/components/ui/Button';
import Alert from '@/src/components/ui/Alert';
import { Badge } from '@/src/components/ui/Badge';
import Modal from '@/src/components/ui/Modal';
import {
  listReportsForSupervisor,
  endorseReportBySupervisor,
  type ReportWithStudent
} from '@/src/services/reports';
import { getSignedDocumentUrl } from '@/src/services/storage';
// PROTOTYPE (throwaway): three UI variants via ?variant=A|B|C on this route. Remove after a winner is picked.
import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import PrototypeSwitcher from './_prototype/PrototypeSwitcher';
import { VariantA, VariantB, VariantC } from './_prototype/Variants';

export default function SupervisorReportsPage() {
  return (
    <Suspense>
      <ReportsPageInner />
      <PrototypeSwitcher />
    </Suspense>
  );
}

function ReportsPageInner() {
  const variant = useSearchParams().get('variant');
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
  const [filter, setFilter] = useState<'all' | 'pending' | 'endorsed'>('all');

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

  const filteredReports = reports.filter((r) => {
    if (filter === 'pending') return !r.supervisor_decision;
    if (filter === 'endorsed') return !!r.supervisor_decision;
    return true;
  });

  const totalPages = Math.max(1, Math.ceil(total / 20));
  const vp = {
    reports: filteredReports,
    filter,
    setFilter,
    openDoc: handleOpenDocument,
    review: (r: ReportWithStudent) => { setEndorsingReport(r); setFeedback(r.supervisor_feedback || ''); },
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto page-fade-in">
      {variant === 'A' && <VariantA {...vp} />}
      {variant === 'B' && <VariantB {...vp} />}
      {variant === 'C' && <VariantC {...vp} />}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Trainee Accomplishment Reports</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Approve or return daily accomplishment reports for your assigned interns. Each submission receives one recorded decision.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {(['all', 'pending', 'endorsed'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setFilter(tab)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold capitalize transition-all cursor-pointer ${
                filter === tab
                  ? 'bg-[#0A3824] text-[var(--cdm-sand)] shadow-sm'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
              }`}
            >
              {tab === 'all' ? 'All Reports' : tab === 'pending' ? 'Needs Review' : 'Decided'}
            </button>
          ))}
        </div>
      </div>

      {success && (
        <Alert
          type="info"
          message={success}
        />
      )}
      {error && <Alert type="error" message={error} />}

      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20 text-slate-400 text-sm">
            Loading trainee reports...
          </div>
        ) : filteredReports.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400">
            <span className="text-4xl mb-3">📝</span>
            <p className="text-sm font-semibold text-slate-700">No reports submitted yet</p>
            <p className="text-xs text-slate-400 mt-1">
              Your assigned trainees will submit their weekly accomplishment journals here.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200/80 bg-slate-50/80 text-xs font-semibold text-slate-600 uppercase tracking-wider">
                <tr>
                  <th className="text-left px-5 py-3.5">Assigned Intern</th>
                  <th className="text-left px-5 py-3.5">Report Category</th>
                  <th className="text-left px-5 py-3.5">Document File</th>
                  <th className="text-left px-5 py-3.5">Your Mentor Remarks</th>
                  <th className="text-left px-5 py-3.5">Supervisor Decision</th>
                  <th className="text-right px-5 py-3.5">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredReports.map((r) => (
                  <tr key={r.report_id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="px-5 py-4">
                      <p className="font-bold text-slate-900">{r.students?.users?.full_name}</p>
                      <p className="text-xs text-slate-400 font-mono mt-0.5">
                        {r.students?.student_number} • {r.students?.course}
                      </p>
                    </td>
                    <td className="px-5 py-4">
                      <span className="font-semibold text-slate-800 capitalize">
                        {r.report_type.replace(/_/g, ' ')}
                      </span>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        Submitted {new Date(r.submission_date).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </p>
                      {r.remarks && (
                        <p className="text-xs text-slate-600 bg-slate-50 p-1.5 rounded mt-1 border border-slate-100">
                          <span className="font-bold text-slate-500">Intern Note:</span> {r.remarks}
                        </p>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      <button
                        onClick={() => handleOpenDocument(r.file_path, r.report_id)}
                        disabled={openingDocId === r.report_id}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 text-[#0A3824] border border-emerald-200 hover:bg-emerald-100 text-xs font-bold transition-all cursor-pointer"
                      >
                        {openingDocId === r.report_id ? 'Opening...' : '📄 View Document'}
                      </button>
                    </td>
                    <td className="px-5 py-4 text-xs">
                      {r.supervisor_decision ? (
                        <div className="bg-emerald-50/70 border border-emerald-200 p-2 rounded-lg max-w-xs">
                          <p className="font-bold uppercase text-emerald-900">{r.supervisor_decision}</p>
                          <p className="text-emerald-900 font-semibold">{r.supervisor_feedback}</p>
                          <span className="text-[10px] text-emerald-700 block mt-1">
                            Decision recorded {r.supervisor_decided_at ? new Date(r.supervisor_decided_at).toLocaleDateString() : ''}
                          </span>
                        </div>
                      ) : (
                        <span className="text-amber-600 font-medium">Pending your mentor review</span>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      <Badge className={`text-xs font-bold ${
                        r.supervisor_decision === 'approved' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                        r.supervisor_decision === 'returned' ? 'bg-rose-50 text-rose-700 border-rose-200' :
                        'bg-amber-50 text-amber-700 border-amber-200'
                      }`}>
                        {(r.supervisor_decision ?? 'pending').toUpperCase()}
                      </Badge>
                    </td>
                    <td className="px-5 py-4 text-right">
                      {!r.supervisor_decision && <Button
                        variant="ghost"
                        onClick={() => {
                          setEndorsingReport(r);
                          setFeedback(r.supervisor_feedback || '');
                        }}
                        className="text-xs font-bold text-[#0A3824] hover:bg-emerald-50"
                      >
                        Review report
                      </Button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

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
            <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
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
