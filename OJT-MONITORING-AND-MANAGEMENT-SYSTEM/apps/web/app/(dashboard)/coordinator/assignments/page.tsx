'use client';

import { useEffect, useState, useCallback } from 'react';
import Button from '@/src/components/ui/Button';
import Alert from '@/src/components/ui/Alert';
import Badge from '@/src/components/ui/Badge';
import Modal from '@/src/components/ui/Modal';
import Input from '@/src/components/ui/Input';
import {
  listAssignments, createAssignment, updateAssignmentStatus, updateStudentStatus,
  listStudentsForAssignment, listSupervisorsForCompany,
  type AssignmentDetail, type StudentAssignmentOption,
} from '@/src/services/assignments';
import { CompanyPicker } from '@/src/components/ui/CompanyPicker';
import { listCompanyBranches, getCompanyCapacity } from '@/src/services/companies';
import {
  listPracticumSchedules, reviewPracticumSchedule,
  type ScheduleDetail,
} from '@/src/services/schedule';
import { PagerBar, SearchBox, usePageSize } from '@/src/components/ui/ListControls';
import type { AssignmentStatus, DbCompanyBranch, StudentStatus } from '@ojt/shared';


const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function AssignmentsPage() {
  const [activeTab, setActiveTab] = useState<'assignments' | 'proposals'>('assignments');
  const [assignments, setAssignments] = useState<AssignmentDetail[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, changePageSize] = usePageSize();
  const [searchText, setSearchText] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Proposals State
  const [proposals, setProposals] = useState<ScheduleDetail[]>([]);
  const [proposalsTotal, setProposalsTotal] = useState(0);
  const [proposalsLoading, setProposalsLoading] = useState(false);
  const [proposalsFilter, setProposalsFilter] = useState<'pending' | 'all'>('pending');

  // Manual Assignment Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const [students, setStudents] = useState<StudentAssignmentOption[]>([]);
  const [supervisors, setSupervisors] = useState<{ supervisor_id: string; full_name: string; position: string }[]>([]);
  const [branches, setBranches] = useState<DbCompanyBranch[]>([]);
  const [capacity, setCapacity] = useState<{ active: number; limit: number; atCapacity: boolean } | null>(null);

  const [form, setForm] = useState({
    student_id: '', company_id: '', branch_id: '', supervisor_id: '', start_date: '', end_date: '',
  });

  // Review Proposal Modal State
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [selectedProposal, setSelectedProposal] = useState<ScheduleDetail | null>(null);
  const [reviewForm, setReviewForm] = useState({
    company_id: '',
    branch_id: '',
    supervisor_id: '',
    start_date: '',
    end_date: '',
    feedback: '',
  });
  const [reviewSupervisors, setReviewSupervisors] = useState<{ supervisor_id: string; full_name: string; position: string }[]>([]);
  const [reviewBranches, setReviewBranches] = useState<DbCompanyBranch[]>([]);
  const [reviewCapacity, setReviewCapacity] = useState<{ active: number; limit: number; atCapacity: boolean } | null>(null);
  const [reviewError, setReviewError] = useState('');
  const [reviewSubmitting, setReviewSubmitting] = useState(false);

  const loadAssignments = useCallback(async (p: number) => {
    setLoading(true);
    setError('');
    const result = await listAssignments(p, pageSize, search);
    setLoading(false);
    if (result.error) { setError(result.error.message); return; }
    setAssignments(result.data!.assignments);
    setTotal(result.data!.total);
  }, [pageSize, search]);

  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchText.trim()); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [searchText]);

  const loadProposals = useCallback(async (filter: 'pending' | 'all') => {
    setProposalsLoading(true);
    const result = await listPracticumSchedules(filter, 1, 50);
    setProposalsLoading(false);
    if (result.error) { setError(result.error.message); return; }
    setProposals(result.data?.schedules || []);
    setProposalsTotal(result.data?.total || 0);
  }, []);

  useEffect(() => {
    let isMounted = true;

    const fetchData = async () => {
      if (isMounted) {
        await loadAssignments(page);
        await loadProposals(proposalsFilter);
      }
    };

    fetchData();
    return () => {
      isMounted = false;
    };
  }, [page, loadAssignments, loadProposals, proposalsFilter]);

  async function openCreate() {
    setForm({ student_id: '', company_id: '', branch_id: '', supervisor_id: '', start_date: '', end_date: '' });
    setFormError('');
    setSupervisors([]);
    setCapacity(null);
    setBranches([]);

    const studentsRes = await listStudentsForAssignment();
    if (studentsRes.data) setStudents(studentsRes.data);
    setModalOpen(true);
  }

  async function handleCompanyChange(company_id: string) {
    setForm(f => ({ ...f, company_id, branch_id: '', supervisor_id: '' }));
    setCapacity(null);
    if (!company_id) { setSupervisors([]); setBranches([]); return; }

    const [supRes, capRes, branchRes] = await Promise.all([
      listSupervisorsForCompany(company_id),
      getCompanyCapacity(company_id),
      listCompanyBranches(company_id),
    ]);

    if (supRes.data) setSupervisors(supRes.data);
    if (branchRes.data) {
      setBranches(branchRes.data);
      setForm(f => ({ ...f, branch_id: branchRes.data?.[0]?.branch_id ?? '' }));
    }
    if (capRes.data) {
      setCapacity({
        active: capRes.data.active_interns,
        limit: capRes.data.recommended_capacity,
        atCapacity: capRes.data.is_at_capacity,
      });
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setFormError('');
    setSaving(true);
    const result = await createAssignment({
      student_id: form.student_id,
      company_id: form.company_id,
      branch_id: form.branch_id,
      supervisor_id: form.supervisor_id,
      start_date: form.start_date,
      end_date: form.end_date || undefined,
    });
    setSaving(false);
    if (result.error) { setFormError(result.error.message); return; }
    setModalOpen(false);
    loadAssignments(page);
  }

  async function handleStatusChange(assignment_id: string, status: AssignmentStatus) {
    const result = await updateAssignmentStatus(assignment_id, status);
    if (result.error) { setError(result.error.message); return; }
    loadAssignments(page);
  }

  async function handleStudentStatusChange(student_id: string, status: StudentStatus) {
    if (!window.confirm(`Set this student's status to ${status.toUpperCase()}?`)) return;
    const result = await updateStudentStatus(student_id, status);
    if (result.error) { setError(result.error.message); return; }
    loadAssignments(page);
  }

  // Handle reviewing a student proposal
  async function openReviewProposal(prop: ScheduleDetail) {
    setSelectedProposal(prop);
    setReviewError('');
    setReviewSubmitting(false);

    const initialCompanyId = prop.company_id || '';
    const branchRes = initialCompanyId ? await listCompanyBranches(initialCompanyId) : null;
    const initialBranchId = prop.branch_id || branchRes?.data?.[0]?.branch_id || '';
    setReviewBranches(branchRes?.data || []);
    setReviewForm({
      company_id: initialCompanyId,
      branch_id: initialBranchId,
      supervisor_id: '',
      start_date: prop.start_date || '',
      end_date: prop.end_date || '',
      feedback: prop.coordinator_feedback || '',
    });

    if (initialCompanyId) {
      const [supRes, capRes] = await Promise.all([
        listSupervisorsForCompany(initialCompanyId),
        getCompanyCapacity(initialCompanyId),
      ]);
      if (supRes.data) setReviewSupervisors(supRes.data);
      if (capRes.data) {
        setReviewCapacity({
          active: capRes.data.active_interns,
          limit: capRes.data.recommended_capacity,
          atCapacity: capRes.data.is_at_capacity,
        });
      }
    } else {
      setReviewSupervisors([]);
      setReviewCapacity(null);
    }

    setReviewModalOpen(true);
  }

  async function handleReviewCompanyChange(company_id: string) {
    setReviewForm(f => ({ ...f, company_id, branch_id: '', supervisor_id: '' }));
    setReviewCapacity(null);
    if (!company_id) { setReviewSupervisors([]); setReviewBranches([]); return; }

    const [supRes, capRes, branchRes] = await Promise.all([
      listSupervisorsForCompany(company_id),
      getCompanyCapacity(company_id),
      listCompanyBranches(company_id),
    ]);

    if (supRes.data) setReviewSupervisors(supRes.data);
    if (branchRes.data) {
      setReviewBranches(branchRes.data);
      setReviewForm(f => ({ ...f, branch_id: branchRes.data?.[0]?.branch_id ?? '' }));
    }
    if (capRes.data) {
      setReviewCapacity({
        active: capRes.data.active_interns,
        limit: capRes.data.recommended_capacity,
        atCapacity: capRes.data.is_at_capacity,
      });
    }
  }

  async function handleProposalDecision(action: 'approve' | 'reject' | 'modify') {
    if (!selectedProposal) return;
    setReviewError('');

    if (action === 'approve') {
      if (!reviewForm.company_id) {
        setReviewError('Please select a Host Training Establishment to deploy this trainee.');
        return;
      }
      if (!reviewForm.supervisor_id) {
        setReviewError('Please assign a Designated Industry Supervisor.');
        return;
      }
      if (!reviewForm.start_date) {
        setReviewError('Please specify the Placement Start Date.');
        return;
      }
    }

    setReviewSubmitting(true);
    const res = await reviewPracticumSchedule(selectedProposal.schedule_id, action, {
      company_id: reviewForm.company_id,
      branch_id: reviewForm.branch_id,
      supervisor_id: reviewForm.supervisor_id,
      start_date: reviewForm.start_date,
      end_date: reviewForm.end_date,
      feedback: reviewForm.feedback,
    });
    setReviewSubmitting(false);

    if (res.error) {
      setReviewError(res.error.message);
      return;
    }

    setReviewModalOpen(false);
    loadProposals(proposalsFilter);
    loadAssignments(page);
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto page-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Trainee Deployment & Assignments</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Manage company assignments and review student practicum schedule commitments
          </p>
        </div>
        <Button onClick={openCreate}>+ Direct Assignment</Button>
      </div>

      {error && (
        <div className="mb-4">
          <Alert type="error" message={error} />
        </div>
      )}

      {/* Tabs navigation */}
      <div className="flex items-center gap-2 border-b border-slate-200 mb-6">
        <button
          onClick={() => setActiveTab('assignments')}
          className={`pb-3 px-4 text-sm font-semibold transition-colors border-b-2 relative ${
            activeTab === 'assignments'
              ? 'border-[#0A3824] text-[#0A3824]'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          Active Deployments ({total})
        </button>
        <button
          onClick={() => setActiveTab('proposals')}
          className={`pb-3 px-4 text-sm font-semibold transition-colors border-b-2 relative flex items-center gap-2 ${
            activeTab === 'proposals'
              ? 'border-[#0A3824] text-[#0A3824]'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          <span>Practicum Schedule Proposals</span>
          {proposals.filter(p => p.status === 'pending').length > 0 && (
            <span className="px-2 py-0.5 text-xs font-bold rounded-full bg-amber-500 text-white animate-pulse">
              {proposals.filter(p => p.status === 'pending').length}
            </span>
          )}
        </button>
      </div>

      {activeTab === 'assignments' ? (
        <>
          <div className="mb-3"><SearchBox value={searchText} onChange={setSearchText} placeholder="Search student name or ID..." /></div>
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            {loading ? (
              <div className="flex items-center justify-center py-20 text-slate-400 text-sm">Loading...</div>
            ) : assignments.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-slate-400">
                <span className="text-4xl mb-3">📋</span>
                <p className="text-sm">{search ? 'No assignments match your search.' : 'No assignments recorded yet.'}</p>
              </div>
            ) : (
              <div className="overflow-x-auto" role="region" aria-label="Active trainee assignments" tabIndex={0}>
              <table className="w-full min-w-[800px] text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/50">
                    <th className="text-left px-5 py-3.5 font-medium text-slate-500">Student</th>
                    <th className="text-left px-5 py-3.5 font-medium text-slate-500">Host Establishment</th>
                    <th className="text-left px-5 py-3.5 font-medium text-slate-500">Designated Supervisor</th>
                    <th className="text-left px-5 py-3.5 font-medium text-slate-500">Placement Date</th>
                    <th className="text-left px-5 py-3.5 font-medium text-slate-500">Status</th>
                    <th className="px-5 py-3.5" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {assignments.map(a => (
                    <tr key={a.assignment_id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-5 py-4">
                        <p className="font-medium text-slate-900">{a.students?.users?.full_name}</p>
                        <p className="text-[11px] text-slate-500 tabular-nums">{a.students?.student_number} • {a.students?.course}</p>
                        <div className="mt-1 flex items-center gap-2">
                          <Badge status={a.students?.status}>{a.students?.status?.toUpperCase()}</Badge>
                          <select
                            aria-label={`Set student status for ${a.students?.users?.full_name ?? 'student'}`}
                            value=""
                            onChange={e => e.target.value && handleStudentStatusChange(a.student_id, e.target.value as StudentStatus)}
                            className="text-xs border border-slate-200 rounded px-1 py-0.5"
                          >
                            <option value="">Set status…</option>
                            <option value="dropped">DROPPED</option>
                            <option value="inc">INC</option>
                            <option value="terminated">TERMINATED</option>
                          </select>
                        </div>
                      </td>
                      <td className="px-5 py-4 text-slate-700 font-medium">{a.companies?.company_name}<span className="block text-xs font-normal text-slate-500">{a.company_branches?.branch_name || 'Branch unavailable'}</span></td>
                      <td className="px-5 py-4">
                        <p className="text-slate-700">{a.supervisors?.users?.full_name}</p>
                        <p className="text-xs text-slate-400">{a.supervisors?.position}</p>
                      </td>
                      <td className="px-5 py-4 text-slate-500">{a.start_date}</td>
                      <td className="px-5 py-4"><Badge status={a.assignment_status} /></td>
                      <td className="px-5 py-4">
                        {a.assignment_status === 'active' && (
                          <div className="flex gap-2 justify-end">
                            <Button variant="ghost" onClick={() => handleStatusChange(a.assignment_id, 'completed')}>Complete</Button>
                            <Button variant="ghost" onClick={() => handleStatusChange(a.assignment_id, 'terminated')} className="text-rose-600 hover:bg-rose-50">Terminate</Button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            )}
          </div>

          <div className="mt-4"><PagerBar page={page} totalPages={totalPages} total={total} setPage={setPage} pageSize={pageSize} setPageSize={(n) => { changePageSize(n); setPage(1); }} /></div>
        </>
      ) : (
        /* Schedule Proposals Tab */
        <div className="space-y-4">
          <div className="flex items-center justify-between bg-slate-50 p-3 rounded-xl border border-slate-200">
            <div className="text-xs text-slate-600">
              Student-submitted schedule proposals are cleared by pre-deployment gateway (2/2 mandatory documents).
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => { setProposalsFilter('pending'); loadProposals('pending'); }}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  proposalsFilter === 'pending'
                    ? 'bg-[var(--cdm-green)] text-white shadow-xs'
                    : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                }`}
              >
                Pending Review
              </button>
              <button
                onClick={() => { setProposalsFilter('all'); loadProposals('all'); }}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  proposalsFilter === 'all'
                    ? 'bg-[var(--cdm-green)] text-white shadow-xs'
                    : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                }`}
              >
                All History ({proposalsTotal})
              </button>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            {proposalsLoading ? (
              <div className="flex items-center justify-center py-20 text-slate-400 text-sm">Loading proposals...</div>
            ) : proposals.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-slate-400">
                <span className="text-4xl mb-3">🗓️</span>
                <p className="text-sm">No practicum schedule proposals found.</p>
              </div>
            ) : (
              <div className="overflow-x-auto" role="region" aria-label="Practicum schedule proposals" tabIndex={0}>
              <table className="w-full min-w-[900px] text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/50">
                    <th className="text-left px-5 py-3.5 font-medium text-slate-500">Student</th>
                    <th className="text-left px-5 py-3.5 font-medium text-slate-500">Proposed HTE</th>
                    <th className="text-left px-5 py-3.5 font-medium text-slate-500">Modality</th>
                    <th className="text-left px-5 py-3.5 font-medium text-slate-500">Days & Commitment</th>
                    <th className="text-left px-5 py-3.5 font-medium text-slate-500">Proposed Timeline</th>
                    <th className="text-left px-5 py-3.5 font-medium text-slate-500">Status</th>
                    <th className="px-5 py-3.5 text-right font-medium text-slate-500">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {proposals.map(p => {
                    const daysStr = (p.work_days || []).map(d => DAY_NAMES[d]).join(', ');
                    const statusColors: Record<string, string> = {
                      pending: 'bg-amber-100 text-amber-800 border-amber-200',
                      approved: 'bg-emerald-100 text-emerald-800 border-emerald-200',
                      rejected: 'bg-rose-100 text-rose-800 border-rose-200',
                      modified: 'bg-blue-100 text-blue-800 border-blue-200',
                    };

                    return (
                      <tr key={p.schedule_id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-5 py-4">
                          <p className="font-medium text-slate-900">{p.students?.users?.full_name}</p>
                          <p className="text-[11px] text-slate-500 tabular-nums">{p.students?.student_number} • {p.students?.course}</p>
                        </td>
                        <td className="px-5 py-4">
                          <p className="text-slate-800 font-medium">
                            {p.companies?.company_name || p.custom_company_name || 'Not specified'}
                          </p>
                          {p.companies?.address && (
                            <p className="text-xs text-slate-400 line-clamp-1">{p.companies.address}</p>
                          )}
                        </td>
                        <td className="px-5 py-4">
                          <span className="capitalize px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700">
                            {p.work_modality}
                          </span>
                        </td>
                        <td className="px-5 py-4">
                          <div className="space-y-0.5">
                            <p className="text-xs font-semibold text-slate-700">{daysStr || 'None'}</p>
                            <p className="text-[11px] text-slate-500">
                              {p.time_in} - {p.time_out} ({p.daily_hours}h/day • {p.weekly_hours}h/wk)
                            </p>
                          </div>
                        </td>
                        <td className="px-5 py-4 text-xs text-slate-600">
                          <div>Start: <span className="font-medium text-slate-800">{p.start_date}</span></div>
                          {p.end_date && <div>End: <span className="font-medium text-slate-800">{p.end_date}</span></div>}
                        </td>
                        <td className="px-5 py-4">
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-bold border ${statusColors[p.status] || 'bg-slate-100 text-slate-600'}`}>
                            {p.status.toUpperCase()}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-right">
                          <Button
                            variant={p.status === 'pending' ? 'primary' : 'outline'}
                            onClick={() => openReviewProposal(p)}
                            className="text-xs py-1.5 px-3"
                          >
                            {p.status === 'pending' ? 'Review & Deploy' : 'View Details'}
                          </Button>
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

      {/* Review & Deploy Proposal Modal */}
      <Modal
        title="Review Practicum Commitment & Deploy Trainee"
        open={reviewModalOpen}
        onClose={() => setReviewModalOpen(false)}
      >
        {selectedProposal && (
          <div className="space-y-4">
            {reviewError && <Alert type="error" message={reviewError} />}

            {/* Trainee Card */}
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-1">
              <div className="flex justify-between items-center">
                <span className="font-bold text-slate-800 text-sm">{selectedProposal.students?.users?.full_name}</span>
                <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold border border-emerald-200">
                  Gateway 2/2 Cleared ✓
                </span>
              </div>
              <p className="text-slate-500">
                {selectedProposal.students?.student_number} • {selectedProposal.students?.course}
              </p>
            </div>

            {/* CHED CMO 104 Commitment Snapshot */}
            <div className="p-3.5 bg-emerald-50/80 border border-emerald-200 rounded-xl space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-emerald-900 uppercase tracking-wider">
                  CHED CMO 104 Compliance Summary
                </span>
                <span className="text-[11px] font-semibold text-emerald-700 bg-white px-2 py-0.5 rounded-full border border-emerald-300">
                  {selectedProposal.work_modality.toUpperCase()}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-white p-2 rounded-lg border border-emerald-100">
                  <span className="text-slate-500 block">Daily Shift:</span>
                  <span className="font-bold text-slate-800">{selectedProposal.time_in} - {selectedProposal.time_out}</span>
                  <span className="text-[11px] text-emerald-700 block">({selectedProposal.daily_hours} hrs/day • ≤ 8.0 limit)</span>
                </div>
                <div className="bg-white p-2 rounded-lg border border-emerald-100">
                  <span className="text-slate-500 block">Weekly Commitment:</span>
                  <span className="font-bold text-slate-800">
                    {(selectedProposal.work_days || []).map(d => DAY_NAMES[d]).join(', ')}
                  </span>
                  <span className="text-[11px] text-emerald-700 block">({selectedProposal.weekly_hours} hrs/wk • ≤ 40.0 limit)</span>
                </div>
              </div>
              {selectedProposal.student_notes && (
                <div className="text-xs text-slate-600 bg-white/70 p-2 rounded-lg">
                  <span className="font-medium text-slate-700">Trainee Notes:</span> &ldquo;{selectedProposal.student_notes}&rdquo;
                </div>
              )}
            </div>

            {/* Host Training Establishment Selection */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                Host Training Establishment (HTE)
              </label>
              {selectedProposal.custom_company_name && !selectedProposal.company_id && (
                <p className="text-xs text-amber-700 bg-amber-50 p-2 rounded-lg border border-amber-200 mb-1">
                  Student indicated custom partner: <strong className="font-bold">{selectedProposal.custom_company_name}</strong>. Please select the matching registered company or register it first.
                </p>
              )}
              <CompanyPicker openOnly label="" value={reviewForm.company_id} valueLabel={selectedProposal.companies?.company_name ?? ''} onChange={(id) => handleReviewCompanyChange(id)} />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">Approved HTE Branch</label>
              <select value={reviewForm.branch_id} onChange={e => setReviewForm(f => ({ ...f, branch_id: e.target.value }))}
                disabled={!reviewForm.company_id} required className="rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm disabled:opacity-50">
                <option value="">Select approved branch</option>
                {reviewBranches.map(b => <option key={b.branch_id} value={b.branch_id}>{b.branch_name} — {b.address}</option>)}
              </select>
            </div>

            {/* Capacity tracker */}
            {reviewCapacity && (
              <div className={`p-2.5 rounded-xl border text-xs flex items-center justify-between ${
                reviewCapacity.atCapacity ? 'bg-amber-50 border-amber-200 text-amber-900' : 'bg-emerald-50 border-emerald-200 text-emerald-900'
              }`}>
                <span className="font-semibold">Company Intern Capacity:</span>
                <span className="font-bold px-2 py-0.5 rounded-full bg-white border border-current shadow-xs">
                  {reviewCapacity.active} / {reviewCapacity.limit} Slots Filled
                </span>
              </div>
            )}

            {/* Designated Supervisor */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                Designated Company Supervisor
              </label>
              <select
                value={reviewForm.supervisor_id}
                onChange={e => setReviewForm(f => ({ ...f, supervisor_id: e.target.value }))}
                disabled={!reviewForm.company_id}
                className="rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-[#0A3824] disabled:opacity-50"
                required
              >
                <option value="">Select industry supervisor</option>
                {reviewSupervisors.map(s => (
                  <option key={s.supervisor_id} value={s.supervisor_id}>{s.full_name} ({s.position})</option>
                ))}
              </select>
            </div>

            {/* Placement Dates */}
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Placement Start Date"
                type="date"
                value={reviewForm.start_date}
                onChange={e => setReviewForm(f => ({ ...f, start_date: e.target.value }))}
                required
              />
              <Input
                label="Expected End Date (Optional)"
                type="date"
                value={reviewForm.end_date}
                onChange={e => setReviewForm(f => ({ ...f, end_date: e.target.value }))}
              />
            </div>

            {/* OJT Coordinator Feedback */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                OJT Coordinator Feedback / Remarks
              </label>
              <textarea
                value={reviewForm.feedback}
                onChange={e => setReviewForm(f => ({ ...f, feedback: e.target.value }))}
                placeholder="Optional notes or instructions for the trainee..."
                rows={2}
                className="rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-[#0A3824]"
              />
            </div>

            {/* Action buttons */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-slate-200">
              <div className="flex gap-2 w-full sm:w-auto">
                <Button
                  variant="outline"
                  type="button"
                  onClick={() => handleProposalDecision('reject')}
                  disabled={reviewSubmitting}
                  className="text-rose-600 border-rose-200 hover:bg-rose-50 text-xs"
                >
                  Reject Proposal
                </Button>
                <Button
                  variant="outline"
                  type="button"
                  onClick={() => handleProposalDecision('modify')}
                  disabled={reviewSubmitting}
                  className="text-amber-700 border-amber-200 hover:bg-amber-50 text-xs"
                >
                  Request Changes
                </Button>
              </div>
              <div className="flex gap-2 w-full sm:w-auto justify-end">
                <Button variant="ghost" type="button" onClick={() => setReviewModalOpen(false)}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  loading={reviewSubmitting}
                  onClick={() => handleProposalDecision('approve')}
                >
                  Approve & Deploy Trainee
                </Button>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* Manual / Direct Assignment Modal */}
      <Modal title="Deploy Trainee to Partner Establishment" open={modalOpen} onClose={() => setModalOpen(false)}>
        <form onSubmit={handleCreate} className="space-y-4">
          {formError && <Alert type="error" message={formError} />}

          {/* Student */}
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-slate-700">Trainee</label>
            <select
              value={form.student_id}
              onChange={e => setForm(f => ({ ...f, student_id: e.target.value }))}
              className="rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-[#0A3824] focus:border-[#0A3824]"
              required
            >
              <option value="">Select trainee</option>
              {students.map(s => (
                <option key={s.student_id} value={s.student_id} disabled={s.has_active_assignment}>
                  {s.is_gateway_cleared ? '✓' : '⚠️'} {s.full_name} ({s.student_number} - {s.course}) {s.is_gateway_cleared ? '[CLEARED 2/2]' : `[INCOMPLETE: ${s.gateway_approved_count}/2]`}{s.has_active_assignment ? ' (Already Deployed)' : ''}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-slate-700">Approved HTE Branch</label>
            <select value={form.branch_id} onChange={e => setForm(f => ({ ...f, branch_id: e.target.value }))}
              disabled={!form.company_id} required className="rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm disabled:opacity-50">
              <option value="">Select approved branch</option>
              {branches.map(b => <option key={b.branch_id} value={b.branch_id}>{b.branch_name} — {b.address}</option>)}
            </select>
          </div>

          {/* Gateway Compliance Warning */}
          {(() => {
            const selectedStudent = students.find(s => s.student_id === form.student_id);
            if (!selectedStudent) return null;
            if (!selectedStudent.is_gateway_cleared) {
              return (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 space-y-1">
                  <p className="font-bold flex items-center gap-1.5 text-amber-800">
                    <span>⚠️</span> Pre-Deployment Gateway Incomplete ({selectedStudent.gateway_approved_count}/2)
                  </p>
                  <p className="text-amber-800">
                    This trainee cannot be deployed yet. Missing/unapproved credentials:
                  </p>
                  <p className="font-semibold text-rose-700 pl-2 border-l-2 border-rose-300">
                    {selectedStudent.missing_gateway_documents.join(', ')}
                  </p>
                  <p className="text-[11px] text-amber-700 pt-1">
                    Please approve these documents under the Submissions portal before creating an assignment.
                  </p>
                </div>
              );
            }
            return (
              <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-900 flex items-center gap-2">
                <span className="text-emerald-600 font-bold">✓</span>
                <span className="font-semibold">Gateway Clearance Verified: Mandatory pre-deployment credentials approved (2/2).</span>
              </div>
            );
          })()}

          {/* Company */}
          <div className="flex flex-col gap-1">
            <CompanyPicker openOnly label="Host Training Establishment (HTE)" value={form.company_id} onChange={(id) => handleCompanyChange(id)} />
          </div>

          {/* Live Capacity Indicator */}
          {capacity && (
            <div className={`p-3 rounded-xl border text-xs flex items-center justify-between transition-all ${
              capacity.atCapacity ? 'bg-amber-50/80 border-amber-200 text-amber-900' : 'bg-emerald-50/80 border-emerald-200 text-emerald-900'
            }`}>
              <span className="font-semibold">Current Active Trainees:</span>
              <span className="font-bold px-2.5 py-0.5 rounded-full bg-white border border-current shadow-xs">
                {capacity.active} / {capacity.limit} Slots Filled
              </span>
            </div>
          )}

          {/* Supervisor */}
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-slate-700">Designated Industry Supervisor</label>
            <select
              value={form.supervisor_id}
              onChange={e => setForm(f => ({ ...f, supervisor_id: e.target.value }))}
              disabled={!form.company_id}
              className="rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-[#0A3824] focus:border-[#0A3824] disabled:opacity-50"
              required
            >
              <option value="">Select supervisor</option>
              {supervisors.map(s => (
                <option key={s.supervisor_id} value={s.supervisor_id}>{s.full_name} ({s.position})</option>
              ))}
            </select>
          </div>

          {/* Start Date */}
          <Input
            label="Placement Start Date"
            type="date"
            value={form.start_date}
            onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))}
            required
          />

          {/* End Date */}
          <Input
            label="Expected End Date (Optional)"
            type="date"
            value={form.end_date}
            onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))}
          />

          {(() => {
            const selectedStudent = students.find(s => s.student_id === form.student_id);
            const isBlocked = selectedStudent && !selectedStudent.is_gateway_cleared;

            return (
              <div className="flex justify-end gap-3 pt-2">
                <Button variant="ghost" type="button" onClick={() => setModalOpen(false)}>Cancel</Button>
                <Button
                  type="submit"
                  loading={saving}
                  disabled={Boolean(isBlocked)}
                  className={isBlocked ? 'opacity-50 cursor-not-allowed bg-slate-400' : ''}
                >
                  {isBlocked ? 'Gateway Clearance Required (2/2)' : 'Confirm Deployment'}
                </Button>
              </div>
            );
          })()}
        </form>
      </Modal>
    </div>
  );
}

