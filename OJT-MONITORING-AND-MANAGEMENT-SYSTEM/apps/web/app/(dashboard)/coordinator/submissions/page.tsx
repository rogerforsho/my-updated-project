'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import Button from '@/src/components/ui/Button';
import Alert from '@/src/components/ui/Alert';
import { Badge } from '@/src/components/ui/Badge';
import Modal from '@/src/components/ui/Modal';
import {
  getGatewayComplianceSummary,
  sendRequirementReminder,
  listReportsForCoordinator,
  reviewReport,
  type ReportWithStudent,
  type StudentGatewayStatus,
  type GatewayComplianceSummary,
} from '@/src/services/reports';
import { getSignedDocumentUrl } from '@/src/services/storage';
import { GATEWAY_DOCUMENT_SPECS, SUPERVISOR_REVIEW_REPORT_TYPES, matchesDoc } from '@ojt/shared';

export default function CoordinatorSubmissionsPage() {
  // Top-level tab: 'compliance' (Who needs requirements) vs 'feed' (Document review stream)
  const [activeTab, setActiveTab] = useState<'compliance' | 'feed'>('compliance');

  // Compliance Roster State
  const [complianceData, setComplianceData] = useState<GatewayComplianceSummary | null>(null);
  const [loadingCompliance, setLoadingCompliance] = useState(true);
  const [complianceSearch, setComplianceSearch] = useState('');
  const [complianceFilter, setComplianceFilter] = useState<'all' | 'needs_requirements' | 'ready_for_review' | 'ready_for_placement' | 'deployed'>('needs_requirements');
  const [courseFilter, setCourseFilter] = useState<string>('all');
  const [inspectingStudent, setInspectingStudent] = useState<StudentGatewayStatus | null>(null);
  const [remindingStudentId, setRemindingStudentId] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  // Document Feed State
  const [reports, setReports] = useState<ReportWithStudent[]>([]);
  const [totalReports, setTotalReports] = useState(0);
  const [reportPage, setReportPage] = useState(1);
  const [loadingReports, setLoadingReports] = useState(true);
  const [feedStatusFilter, setFeedStatusFilter] = useState<'all' | 'submitted' | 'approved' | 'rejected'>('all');
  const [reviewingReport, setReviewingReport] = useState<ReportWithStudent | null>(null);
  const [reviewRemarks, setReviewRemarks] = useState('');
  const [submittingAction, setSubmittingAction] = useState(false);
  const [openingDocId, setOpeningDocId] = useState<string | null>(null);

  const [error, setError] = useState('');

  // ─── Load Gateway Compliance Data ──────────────────────────────────────────
  const loadCompliance = useCallback(async () => {
    setLoadingCompliance(true);
    const res = await getGatewayComplianceSummary();
    setLoadingCompliance(false);
    if (res.error) {
      setError(res.error.message);
      return;
    }
    setComplianceData(res.data);
  }, []);

  // ─── Load Document Feed Data ───────────────────────────────────────────────
  const loadReports = useCallback(async (p: number) => {
    setLoadingReports(true);
    const res = await listReportsForCoordinator(p, 20);
    setLoadingReports(false);
    if (res.error) {
      setError(res.error.message);
      return;
    }
    setReports(res.data!.reports);
    setTotalReports(res.data!.total);
  }, []);

  useEffect(() => {
    loadCompliance();
  }, [loadCompliance]);

  useEffect(() => {
    if (activeTab === 'feed') {
      loadReports(reportPage);
    }
  }, [activeTab, reportPage, loadReports]);

  // ─── Document Preview Handler ──────────────────────────────────────────────
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

  // ─── Document Review Decision ──────────────────────────────────────────────
  async function submitDecision(status: 'approved' | 'rejected') {
    if (!reviewingReport) return;
    setSubmittingAction(true);
    const result = await reviewReport(reviewingReport.report_id, status, reviewRemarks);
    setSubmittingAction(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    setReviewingReport(null);
    setReviewRemarks('');
    setSuccessToast(`Submission successfully marked as ${status}.`);
    setTimeout(() => setSuccessToast(null), 4000);
    // Refresh both views
    loadReports(reportPage);
    loadCompliance();
  }

  // ─── Send In-App Reminder to Student ───────────────────────────────────────
  async function handleSendReminder(student: StudentGatewayStatus) {
    if (!student.user_id) {
      alert('Unable to identify student account.');
      return;
    }
    setRemindingStudentId(student.student_id);
    const res = await sendRequirementReminder(student.user_id, student.missing_documents);
    setRemindingStudentId(null);
    if (res.error) {
      alert(res.error.message);
      return;
    }
    setSuccessToast(`Reminder sent to ${student.full_name} for ${student.missing_documents.length} missing requirement(s).`);
    setTimeout(() => setSuccessToast(null), 4000);
  }

  // ─── Filtered Students Roster ──────────────────────────────────────────────
  const filteredStudents = useMemo(() => {
    if (!complianceData?.students) return [];

    return complianceData.students.filter(student => {
      // 1. Text Search (Name or Student Number)
      if (complianceSearch.trim()) {
        const query = complianceSearch.toLowerCase();
        const matchesName = student.full_name.toLowerCase().includes(query);
        const matchesNumber = student.student_number.toLowerCase().includes(query);
        if (!matchesName && !matchesNumber) return false;
      }

      // 2. Course Filter
      if (courseFilter !== 'all' && student.course !== courseFilter) {
        return false;
      }

      // 3. Compliance Status Filter
      if (complianceFilter === 'needs_requirements') {
        return student.compliance_state === 'not_started' || student.compliance_state === 'in_progress';
      }
      if (complianceFilter === 'ready_for_review') {
        return student.compliance_state === 'ready_for_review';
      }
      if (complianceFilter === 'ready_for_placement') {
        return student.compliance_state === 'ready_for_placement';
      }
      if (complianceFilter === 'deployed') {
        return student.compliance_state === 'deployed';
      }

      return true; // 'all'
    });
  }, [complianceData, complianceSearch, courseFilter, complianceFilter]);

  // ─── Filtered Document Feed ────────────────────────────────────────────────
  const filteredReports = reports.filter(r => {
    if (feedStatusFilter === 'all') return true;
    return r.status === feedStatusFilter;
  });

  const totalPages = Math.max(1, Math.ceil(totalReports / 20));

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto page-fade-in">
      {/* Page Title & Main Tabs */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">Requirement & Document Submissions</h1>
            <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-[#0A3824]">
              CdM Practicum
            </span>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Track student pre-deployment compliance, identify missing documents, and approve submissions.
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center bg-slate-100/90 p-1.5 rounded-xl border border-slate-200 self-start md:self-auto">
          <button
            onClick={() => setActiveTab('compliance')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'compliance'
                ? 'bg-[#0A3824] text-[var(--cdm-sand)] shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <span>📋 Pre-Deployment Tracker</span>
            {complianceData && complianceData.needs_requirements > 0 && (
              <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-black ${
                activeTab === 'compliance' ? 'bg-[var(--cdm-sand)] text-[#0A3824]' : 'bg-rose-500 text-white'
              }`}>
                {complianceData.needs_requirements}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('feed')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'feed'
                ? 'bg-[#0A3824] text-[var(--cdm-sand)] shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <span>📑 Document Review Feed</span>
            {totalReports > 0 && (
              <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-black ${
                activeTab === 'feed' ? 'bg-[var(--cdm-sand)] text-[#0A3824]' : 'bg-slate-300 text-slate-700'
              }`}>
                {totalReports}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Notifications / Alerts */}
      {error && <Alert type="error" message={error} />}
      {successToast && <Alert type="success" message={successToast} />}

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* TAB 1: PRE-DEPLOYMENT GATEWAY COMPLIANCE ("WHO NEEDS REQUIREMENTS")     */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'compliance' && (
        <div className="space-y-6">
          {/* 4 Summary KPI Metric Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* 1. Needs Requirements */}
            <div
              onClick={() => setComplianceFilter('needs_requirements')}
              className={`p-4 rounded-2xl border transition-all cursor-pointer ${
                complianceFilter === 'needs_requirements'
                  ? 'bg-amber-50/70 border-amber-300 ring-2 ring-amber-400/40 shadow-sm'
                  : 'bg-white border-slate-200/80 hover:border-amber-200 hover:bg-amber-50/30'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-amber-800 uppercase tracking-wider">Needs Requirements</span>
                <span className="text-lg">⚠️</span>
              </div>
              <p className="text-3xl font-black text-amber-900 mt-2">
                {complianceData?.needs_requirements ?? 0}
              </p>
              <p className="text-xs text-amber-700 mt-1 font-medium">
                Incomplete documents; attendance locked
              </p>
            </div>

            {/* 2. Ready for Review */}
            <div
              onClick={() => setComplianceFilter('ready_for_review')}
              className={`p-4 rounded-2xl border transition-all cursor-pointer ${
                complianceFilter === 'ready_for_review'
                  ? 'bg-blue-50/70 border-blue-300 ring-2 ring-blue-400/40 shadow-sm'
                  : 'bg-white border-slate-200/80 hover:border-blue-200 hover:bg-blue-50/30'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-blue-800 uppercase tracking-wider">Ready for Review</span>
                <span className="text-lg">⏳</span>
              </div>
              <p className="text-3xl font-black text-blue-900 mt-2">
                {complianceData?.ready_for_review ?? 0}
              </p>
              <p className="text-xs text-blue-700 mt-1 font-medium">
                Both required documents uploaded; awaiting Coordinator review
              </p>
            </div>

            {/* 3. Ready for Placement */}
            <div
              onClick={() => setComplianceFilter('ready_for_placement')}
              className={`p-4 rounded-2xl border transition-all cursor-pointer ${
                complianceFilter === 'ready_for_placement'
                  ? 'bg-emerald-50/70 border-emerald-300 ring-2 ring-emerald-400/40 shadow-sm'
                  : 'bg-white border-slate-200/80 hover:border-emerald-200 hover:bg-emerald-50/30'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-emerald-800 uppercase tracking-wider">Ready for Placement</span>
                <span className="text-lg">🎯</span>
              </div>
              <p className="text-3xl font-black text-emerald-900 mt-2">
                {complianceData?.ready_for_placement ?? 0}
              </p>
              <p className="text-xs text-emerald-700 mt-1 font-medium">
                Both required documents approved; eligible for company assignment
              </p>
            </div>

            {/* 4. Deployed */}
            <div
              onClick={() => setComplianceFilter('deployed')}
              className={`p-4 rounded-2xl border transition-all cursor-pointer ${
                complianceFilter === 'deployed'
                  ? 'bg-[#0A3824]/10 border-[#0A3824]/30 ring-2 ring-[#0A3824]/30 shadow-sm'
                  : 'bg-white border-slate-200/80 hover:border-[#0A3824]/20 hover:bg-[#0A3824]/5'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[#0A3824] uppercase tracking-wider">Active Deployed</span>
                <span className="text-lg">🏢</span>
              </div>
              <p className="text-3xl font-black text-[#0A3824] mt-2">
                {complianceData?.deployed ?? 0}
              </p>
              <p className="text-xs text-slate-600 mt-1 font-medium">
                Assigned to host training company
              </p>
            </div>
          </div>

          {/* Search & Filter Bar */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
            {/* Search Input */}
            <div className="relative flex-1">
              <input
                type="text"
                value={complianceSearch}
                onChange={e => setComplianceSearch(e.target.value)}
                placeholder="Search trainee name or student number..."
                className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-200 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0A3824]"
              />
              <span className="absolute left-3 top-2.5 text-slate-400 text-sm">🔍</span>
              {complianceSearch && (
                <button
                  onClick={() => setComplianceSearch('')}
                  className="absolute right-3 top-2.5 text-xs text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Filter Buttons */}
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={courseFilter}
                onChange={e => setCourseFilter(e.target.value)}
                className="px-3 py-2 rounded-xl text-xs font-bold border border-slate-200 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#0A3824] cursor-pointer"
              >
                <option value="all">All Departments / Courses</option>
                <option value="BSIT">ICS: BS Information Technology</option>
                <option value="BSCpE">ICS: BS Computer Engineering</option>
                <option value="BSBA-HRM">IBE: BSBA Human Resource Mgmt</option>
                <option value="BS-Entrep">IBE: BS Entrepreneurship</option>
              </select>

              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
                {(
                  [
                    { key: 'all', label: 'All Trainees' },
                    { key: 'needs_requirements', label: '⚠️ Incomplete' },
                    { key: 'ready_for_review', label: '⏳ Needs Review' },
                    { key: 'ready_for_placement', label: '🎯 Cleared' },
                    { key: 'deployed', label: '🏢 Deployed' },
                  ] as const
                ).map(tab => (
                  <button
                    key={tab.key}
                    onClick={() => setComplianceFilter(tab.key)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      complianceFilter === tab.key
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Student Compliance Roster Table */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
            {loadingCompliance ? (
              <div className="flex flex-col items-center justify-center py-20 text-slate-400">
                <div className="w-8 h-8 border-3 border-emerald-600 border-t-transparent rounded-full animate-spin mb-3" />
                <p className="text-sm font-semibold text-slate-700">Analyzing Trainee Compliance...</p>
                <p className="text-xs text-slate-400 mt-1">Cross-referencing registered students with required credentials.</p>
              </div>
            ) : filteredStudents.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-slate-400">
                <span className="text-4xl mb-3">🎓</span>
                <p className="text-sm font-semibold text-slate-700">No students match this filter</p>
                <p className="text-xs text-slate-400 mt-1">Try clearing your search query or selecting &quot;All Trainees&quot;.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-slate-200/80 bg-slate-50/80 text-xs font-semibold text-slate-600 uppercase tracking-wider">
                    <tr>
                      <th className="text-left px-5 py-3.5">Student Trainee</th>
                      <th className="text-left px-5 py-3.5">Progress</th>
                      <th className="text-left px-5 py-3.5">5 Pre-Deployment Gateway Documents</th>
                      <th className="text-left px-5 py-3.5">Compliance Status</th>
                      <th className="text-right px-5 py-3.5">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredStudents.map(student => {
                      const percent = Math.round((student.submitted_count / student.total_required) * 100);
                      const isComplete = student.approved_count === student.total_required;

                      return (
                        <tr key={student.student_id} className="hover:bg-slate-50/60 transition-colors">
                          {/* Student Trainee Info */}
                          <td className="px-5 py-4">
                            <p className="font-bold text-slate-900">{student.full_name}</p>
                            <p className="text-xs text-slate-400 font-mono mt-0.5">
                              {student.student_number} • {student.course} (Yr {student.year_level})
                            </p>
                            <p className="text-[11px] text-slate-400 mt-0.5">{student.email}</p>
                          </td>

                          {/* Progress Bar */}
                          <td className="px-5 py-4 min-w-[140px]">
                            <div className="flex items-center justify-between text-xs font-bold mb-1">
                              <span className={isComplete ? 'text-emerald-700' : 'text-slate-700'}>
                                {student.submitted_count} / {student.total_required} Submitted
                              </span>
                              <span className="text-[11px] text-slate-400">
                                ({student.approved_count} Approved)
                              </span>
                            </div>
                            <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                              <div
                                className={`h-2 rounded-full transition-all duration-500 ${
                                  isComplete
                                    ? 'bg-emerald-500'
                                    : student.submitted_count === 5
                                    ? 'bg-blue-500'
                                    : student.submitted_count > 0
                                    ? 'bg-amber-400'
                                    : 'bg-rose-300'
                                }`}
                                style={{ width: `${percent}%` }}
                              />
                            </div>
                          </td>

                          {/* Two required gateway documents */}
                          <td className="px-5 py-4">
                            <div className="flex flex-wrap gap-1.5 max-w-md">
                              {student.documents.map(doc => {
                                let badgeClass = 'bg-slate-100 text-slate-500 border-slate-200';
                                let icon = '✕';
                                if (doc.status === 'approved') {
                                  badgeClass = 'bg-emerald-50 text-emerald-700 border-emerald-200 font-bold';
                                  icon = '✓';
                                } else if (doc.status === 'submitted') {
                                  badgeClass = 'bg-amber-50 text-amber-700 border-amber-200 font-semibold';
                                  icon = '⏳';
                                } else if (doc.status === 'rejected') {
                                  badgeClass = 'bg-rose-50 text-rose-700 border-rose-200 line-through';
                                  icon = '✕';
                                }

                                return (
                                  <span
                                    key={doc.spec_id}
                                    title={`${doc.spec_name}: ${doc.status.toUpperCase()}`}
                                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] border ${badgeClass}`}
                                  >
                                    <span>{icon}</span>
                                    <span>{doc.spec_name.split(' ')[0]}</span>
                                  </span>
                                );
                              })}
                            </div>
                            {student.missing_documents.length > 0 && (
                              <p className="text-[11px] text-rose-600 mt-1 font-medium">
                                Missing: {student.missing_documents.join(', ')}
                              </p>
                            )}
                          </td>

                          {/* Compliance Status Badge */}
                          <td className="px-5 py-4">
                            {student.compliance_state === 'deployed' && (
                              <div>
                                <Badge className="bg-[#0A3824]/10 text-[#0A3824] border-[#0A3824]/20 text-xs font-bold">
                                  🏢 DEPLOYED
                                </Badge>
                                <p className="text-[11px] text-slate-500 font-medium mt-0.5 truncate max-w-[150px]">
                                  {student.assigned_company}
                                </p>
                              </div>
                            )}
                            {student.compliance_state === 'ready_for_placement' && (
                              <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300 text-xs font-bold">
                                🎯 READY FOR PLACEMENT
                              </Badge>
                            )}
                            {student.compliance_state === 'ready_for_review' && (
                              <Badge className="bg-blue-50 text-blue-700 border-blue-200 text-xs font-bold">
                                ⏳ READY FOR REVIEW
                              </Badge>
                            )}
                            {student.compliance_state === 'in_progress' && (
                              <Badge className="bg-amber-50 text-amber-700 border-amber-200 text-xs font-bold">
                                ⚠️ INCOMPLETE ({student.missing_documents.length} MISSING)
                              </Badge>
                            )}
                            {student.compliance_state === 'not_started' && (
                              <Badge className="bg-rose-50 text-rose-700 border-rose-200 text-xs font-bold">
                                ✕ NOT STARTED (0/5)
                              </Badge>
                            )}
                          </td>

                          {/* Action Buttons */}
                          <td className="px-5 py-4 text-right">
                            <div className="flex items-center justify-end gap-2">
                              {student.missing_documents.length > 0 && (
                                <button
                                  onClick={() => handleSendReminder(student)}
                                  disabled={remindingStudentId === student.student_id}
                                  title="Send in-app reminder notification to this student"
                                  className="px-2.5 py-1.5 rounded-lg text-xs font-bold text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200 transition-all cursor-pointer disabled:opacity-50"
                                >
                                  {remindingStudentId === student.student_id ? 'Sending...' : '🔔 Remind'}
                                </button>
                              )}
                              <Button
                                variant="ghost"
                                onClick={() => setInspectingStudent(student)}
                                className="text-xs font-bold text-[#0A3824] hover:bg-emerald-50 cursor-pointer"
                              >
                                Inspect →
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* TAB 2: DOCUMENT REVIEW FEED (INDIVIDUAL UPLOAD STREAM)                   */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'feed' && (
        <div className="space-y-6">
          {/* Status Filter Buttons */}
          <div className="flex items-center justify-between gap-4">
            <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider">
              Submitted Documents ({filteredReports.length} Shown)
            </p>
            <div className="flex items-center gap-2">
              {(['all', 'submitted', 'approved', 'rejected'] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => setFeedStatusFilter(tab)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold capitalize transition-all cursor-pointer ${
                    feedStatusFilter === tab
                      ? 'bg-[#0A3824] text-[var(--cdm-sand)] shadow-sm'
                      : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  {tab === 'all' ? 'All Submissions' : tab}
                </button>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
            {loadingReports ? (
              <div className="flex items-center justify-center py-20 text-slate-400 text-sm">
                Loading submissions...
              </div>
            ) : filteredReports.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-slate-400">
                <span className="text-4xl mb-3">📁</span>
                <p className="text-sm font-semibold text-slate-700">No submissions found</p>
                <p className="text-xs text-slate-400 mt-1">No documents match the current filter.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-slate-200/80 bg-slate-50/80 text-xs font-semibold text-slate-600 uppercase tracking-wider">
                    <tr>
                      <th className="text-left px-5 py-3.5">Student Trainee</th>
                      <th className="text-left px-5 py-3.5">Document Requirement</th>
                      <th className="text-left px-5 py-3.5">Document File</th>
                      <th className="text-left px-5 py-3.5">Supervisor Decision / Notes</th>
                      <th className="text-left px-5 py-3.5">Workflow Status</th>
                      <th className="text-right px-5 py-3.5">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredReports.map(r => (
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
                              <span className="font-bold text-slate-500">Student Note:</span> {r.remarks}
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
                          {r.supervisor_feedback || r.supervisor_decision ? (
                            <div className="bg-emerald-50/70 border border-emerald-200 p-2 rounded-lg max-w-xs">
                              {r.supervisor_decision && <p className="font-bold uppercase text-emerald-900">{r.supervisor_decision}</p>}
                              <p className="text-emerald-900 font-semibold">{r.supervisor_feedback}</p>
                              <span className="text-[10px] text-emerald-700 block mt-1">
                                Decision recorded {r.supervisor_decided_at ? new Date(r.supervisor_decided_at).toLocaleDateString() : ''}
                              </span>
                            </div>
                          ) : (
                            <span className="text-slate-400 italic">No supervisor remarks</span>
                          )}
                        </td>
                        <td className="px-5 py-4">
                          <Badge className={`text-xs font-bold ${
                            (r.supervisor_decision || r.status) === 'approved' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                            (r.supervisor_decision || r.status) === 'rejected' ? 'bg-rose-50 text-rose-700 border-rose-200' :
                            'bg-amber-50 text-amber-700 border-amber-200'
                          }`}>
                            {(r.supervisor_decision || r.status).replace(/_/g, ' ').toUpperCase()}
                          </Badge>
                        </td>
                        <td className="px-5 py-4 text-right">
                          {GATEWAY_DOCUMENT_SPECS.some(spec => matchesDoc(r.report_type, spec.name)) ? <Button
                            variant="ghost"
                            onClick={() => {
                              setReviewingReport(r);
                              setReviewRemarks(r.remarks || '');
                            }}
                            className="text-xs font-bold text-[#0A3824] hover:bg-emerald-50 cursor-pointer"
                          >
                            Review gateway document
                          </Button> : <span className="text-xs text-slate-500">{r.report_type.toLowerCase().includes('incident') ? 'Coordinator follow-up' : SUPERVISOR_REVIEW_REPORT_TYPES.some(type => type.toLowerCase() === r.report_type.trim().toLowerCase()) ? 'Supervisor review' : 'Progress tracking'}</span>}
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
              <span>Page {reportPage} of {totalPages}</span>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={() => setReportPage(p => Math.max(1, p - 1))} disabled={reportPage === 1}>
                  Previous
                </Button>
                <Button variant="ghost" onClick={() => setReportPage(p => Math.min(totalPages, p + 1))} disabled={reportPage === totalPages}>
                  Next
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* MODAL 1: STUDENT GATEWAY INSPECTOR                                      */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      <Modal
        title={`Pre-Deployment Gateway: ${inspectingStudent?.full_name || 'Trainee'}`}
        open={!!inspectingStudent}
        onClose={() => setInspectingStudent(null)}
        footer={
          <div className="flex items-center justify-between w-full">
            {inspectingStudent?.missing_documents && inspectingStudent.missing_documents.length > 0 ? (
              <button
                onClick={() => {
                  if (inspectingStudent) handleSendReminder(inspectingStudent);
                }}
                disabled={remindingStudentId === inspectingStudent?.student_id}
                className="px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-50 text-amber-900 border border-amber-300 hover:bg-amber-100 cursor-pointer"
              >
                {remindingStudentId === inspectingStudent?.student_id ? 'Sending...' : '🔔 Dispatch Requirement Reminder'}
              </button>
            ) : (
              <span className="text-xs text-emerald-700 font-semibold">
                ✓ Both required gateway documents are accounted for
              </span>
            )}
            <Button variant="ghost" onClick={() => setInspectingStudent(null)}>
              Close
            </Button>
          </div>
        }
      >
        {inspectingStudent && (
          <div className="space-y-5">
            {/* Trainee Card */}
            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-800 text-sm">{inspectingStudent.full_name}</span>
                <span className="font-mono text-slate-500">{inspectingStudent.student_number}</span>
              </div>
              <p className="text-slate-600">
                Department & Course: <span className="font-semibold text-slate-800">{inspectingStudent.course}</span> • Year Level {inspectingStudent.year_level}
              </p>
              <p className="text-slate-600">
                Email Address: <span className="font-mono text-slate-700">{inspectingStudent.email}</span>
              </p>
              {inspectingStudent.assigned_company ? (
                <p className="text-[#0A3824] font-semibold pt-1 border-t border-slate-200">
                  Assigned Host Training Establishment: {inspectingStudent.assigned_company}
                </p>
              ) : (
                <p className="text-amber-800 font-semibold pt-1 border-t border-slate-200">
                  Status: Not yet deployed to a company. Gateway clearance required.
                </p>
              )}
            </div>

            {/* Required gateway documents */}
            <div className="space-y-2.5">
              <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                Required Pre-Deployment Credentials (5 Specifications)
              </h4>
              <div className="space-y-2">
                {inspectingStudent.documents.map((doc, idx) => (
                  <div
                    key={doc.spec_id}
                    className={`p-3 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                      doc.status === 'approved'
                        ? 'bg-emerald-50/50 border-emerald-200'
                        : doc.status === 'submitted'
                        ? 'bg-amber-50/50 border-amber-200'
                        : doc.status === 'rejected'
                        ? 'bg-rose-50/50 border-rose-200'
                        : 'bg-slate-50 border-slate-200'
                    }`}
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold bg-white border border-slate-300">
                          {idx + 1}
                        </span>
                        <p className="font-bold text-slate-900 text-xs">{doc.spec_name}</p>
                      </div>
                      {doc.submission_date && (
                        <p className="text-[11px] text-slate-500 mt-1 pl-7">
                          Uploaded on {new Date(doc.submission_date).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </p>
                      )}
                      {doc.remarks && (
                        <p className="text-[11px] text-slate-600 mt-0.5 pl-7 italic">
                          Note: &ldquo;{doc.remarks}&rdquo;
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-2 self-end sm:self-auto pl-7 sm:pl-0">
                      <Badge className={`text-[11px] font-bold ${
                        doc.status === 'approved' ? 'bg-emerald-100 text-emerald-800 border-emerald-300' :
                        doc.status === 'submitted' ? 'bg-amber-100 text-amber-800 border-amber-300' :
                        doc.status === 'rejected' ? 'bg-rose-100 text-rose-800 border-rose-300' :
                        'bg-slate-200 text-slate-600 border-slate-300'
                      }`}>
                        {doc.status.toUpperCase()}
                      </Badge>

                      {doc.file_path && doc.report_id && (
                        <button
                          onClick={() => handleOpenDocument(doc.file_path!, doc.report_id!)}
                          disabled={openingDocId === doc.report_id}
                          className="px-2.5 py-1 rounded text-xs font-bold bg-white text-[#0A3824] border border-slate-300 hover:bg-slate-50 cursor-pointer shadow-2xs"
                        >
                          {openingDocId === doc.report_id ? '...' : 'View PDF'}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* MODAL 2: COORDINATOR SIGN-OFF MODAL                                     */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      <Modal
        title={`Sign-off: ${reviewingReport?.students?.users?.full_name || 'Submission'}`}
        open={!!reviewingReport}
        onClose={() => setReviewingReport(null)}
        footer={
          <div className="flex items-center justify-between w-full gap-2">
            <Button
              variant="ghost"
              onClick={() => setReviewingReport(null)}
              disabled={submittingAction}
            >
              Cancel
            </Button>
            <div className="flex gap-2">
              <Button
                onClick={() => submitDecision('rejected')}
                loading={submittingAction}
                className="bg-rose-600 hover:bg-rose-700 text-white font-bold"
              >
                Reject Submission
              </Button>
              <Button
                onClick={() => submitDecision('approved')}
                loading={submittingAction}
                className="bg-[#0A3824] hover:bg-[#092E1D] text-[var(--cdm-sand)] font-bold"
              >
                Approve & Sign Off
              </Button>
            </div>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-1">
            <p className="font-bold text-slate-800">
              Requirement: <span className="capitalize">{reviewingReport?.report_type.replace(/_/g, ' ')}</span>
            </p>
            <p className="text-slate-500">
              Student Number: <span className="font-mono">{reviewingReport?.students?.student_number}</span> ({reviewingReport?.students?.course})
            </p>
            {reviewingReport?.supervisor_feedback && (
              <p className="text-emerald-800 font-semibold pt-1 border-t border-slate-200">
                Mentor Endorsement: {reviewingReport.supervisor_feedback}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              OJT Coordinator Assessment Remarks
            </label>
            <textarea
              value={reviewRemarks}
              onChange={e => setReviewRemarks(e.target.value)}
              placeholder="Add feedback, reasons for revision, or clearance acknowledgement..."
              rows={3}
              className="w-full rounded-xl border border-slate-200 p-3 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-[#0A3824]"
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}
