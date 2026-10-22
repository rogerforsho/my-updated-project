'use client';

import { useEffect, useState, useCallback } from 'react';
import Button from '@/src/components/ui/Button';
import Alert from '@/src/components/ui/Alert';
import Modal from '@/src/components/ui/Modal';
import { Badge } from '@/src/components/ui/Badge';
import {
  createEvaluation, listAssignedStudentsForEvaluation, listEvaluationsForSupervisor,
  type EvaluationRubricCriteria
} from '@/src/services/evaluations';

const PAGE_SIZE = 20;

const DEFAULT_CRITERIA: EvaluationRubricCriteria = {
  technical_competence: 4,
  productivity_dependability: 4,
  attendance_punctuality: 4,
  communication_skills: 4,
  work_ethics_professionalism: 4,
};

// Each criterion is rated 1-5; the weight turns the rating into points of the 100-point grade.
const RUBRIC: { key: keyof EvaluationRubricCriteria; label: string; hint: string; weight: number }[] = [
  { key: 'technical_competence', label: '1. Technical Competence', hint: 'Quality of output, technical skill', weight: 25 },
  { key: 'productivity_dependability', label: '2. Productivity & Dependability', hint: 'Deadlines, task completion', weight: 20 },
  { key: 'attendance_punctuality', label: '3. Attendance & Punctuality', hint: 'Time compliance, shift discipline', weight: 20 },
  { key: 'communication_skills', label: '4. Communication & Teamwork', hint: 'Team collaboration, clarity', weight: 15 },
  { key: 'work_ethics_professionalism', label: '5. Professionalism, Work Ethics & Initiative', hint: 'Etiquette, proactive problem solving', weight: 20 },
];
const RATING_LABELS = ['', 'Poor', 'Fair', 'Satisfactory', 'Very Good', 'Excellent'];
const isValidRatings = (value: unknown): value is EvaluationRubricCriteria =>
  !!value && RUBRIC.every(({ key }) => [1, 2, 3, 4, 5].includes((value as Record<string, unknown>)[key] as number));

export default function SupervisorEvaluationsPage() {
  const [evaluations, setEvaluations] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [studentId, setStudentId] = useState('');
  const [evaluationType, setEvaluationType] = useState<'midterm' | 'final'>('midterm');
  const [feedback, setFeedback] = useState('');
  const [criteria, setCriteria] = useState<EvaluationRubricCriteria>(DEFAULT_CRITERIA);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [students, setStudents] = useState<{ student_id: string; full_name: string; student_number: string; course: string }[]>([]);

  const computedTotalScore = RUBRIC.reduce((sum, { key, weight }) => sum + (weight * criteria[key]) / 5, 0);
  const commentRequired = RUBRIC.some(({ key }) => criteria[key] < 3);

  const load = useCallback(async (p: number) => {
    setLoading(true);
    setError('');
    const result = await listEvaluationsForSupervisor(p, PAGE_SIZE);
    setLoading(false);
    if (result.error) { setError(result.error.message); return; }
    setEvaluations(result.data!.evaluations);
    setTotal(result.data!.total);
  }, []);

  useEffect(() => {
    let mounted = true;
    const fetchData = async () => {
      if (!mounted) return;
      await load(page);
      const studentsResult = await listAssignedStudentsForEvaluation();
      if (mounted) setStudents(studentsResult.data ?? []);
    };
    fetchData();
    return () => { mounted = false; };
  }, [page, load]);

  const [draftRestored, setDraftRestored] = useState(false);

  // Restore draft when student is selected
  function handleStudentSelect(id: string) {
    setStudentId(id);
    setDraftRestored(false);
    if (!id) return;
    try {
      const saved = localStorage.getItem(`ojt_eval_draft_${id}`);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.feedback) setFeedback(parsed.feedback);
        if (isValidRatings(parsed.criteria)) setCriteria(parsed.criteria);
        if (parsed.evaluationType) setEvaluationType(parsed.evaluationType);
        setDraftRestored(true);
      }
    } catch {}
  }

  // Auto-save draft on input change (debounced 1s)
  useEffect(() => {
    if (!studentId || !modalOpen) return;
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(`ojt_eval_draft_${studentId}`, JSON.stringify({
          evaluationType,
          feedback,
          criteria,
          timestamp: new Date().toISOString(),
        }));
      } catch {}
    }, 1000);
    return () => clearTimeout(timer);
  }, [studentId, evaluationType, feedback, criteria, modalOpen]);

  async function handleSave() {
    setFormError('');
    if (!studentId) {
      setFormError('Please select a student trainee to evaluate.');
      return;
    }
    if (commentRequired && !feedback.trim()) {
      setFormError('A comment is required when any rating is below 3.');
      return;
    }

    setSaving(true);
    const result = await createEvaluation({
      student_id: studentId,
      evaluation_type: evaluationType,
      performance_score: computedTotalScore,
      feedback: feedback.trim(),
      criteria,
    });
    setSaving(false);
    if (result.error) { setFormError(result.error.message); return; }

    // Clear saved draft on success
    try {
      localStorage.removeItem(`ojt_eval_draft_${studentId}`);
    } catch {}

    setModalOpen(false);
    setStudentId('');
    setFeedback('');
    setCriteria(DEFAULT_CRITERIA);
    setDraftRestored(false);
    load(page);
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function getScoreBadge(score: number | null) {
    if (score === null) return <span className="text-slate-400">—</span>;
    if (score >= 90) return <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 text-xs font-bold">{score}% (Outstanding)</Badge>;
    if (score >= 80) return <Badge className="bg-teal-50 text-teal-700 border-teal-200 text-xs font-bold">{score}% (Very Satisfactory)</Badge>;
    if (score >= 75) return <Badge className="bg-amber-50 text-amber-700 border-amber-200 text-xs font-bold">{score}% (Satisfactory - Passed)</Badge>;
    return <Badge className="bg-red-50 text-red-700 border-red-200 text-xs font-bold">{score}% (Needs Improvement)</Badge>;
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-6xl mx-auto page-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Trainee Performance Evaluations</h1>
          <p className="text-sm text-slate-500 mt-0.5">Rate each competency on a 5-point scale. A comment is required for any rating below 3.</p>
        </div>
        <Button
          onClick={async () => {
            setStudentId('');
            setFeedback('');
            setCriteria(DEFAULT_CRITERIA);
            setFormError('');
            setModalOpen(true);
            const res = await listAssignedStudentsForEvaluation();
            if (res.data) setStudents(res.data);
          }}
          className="bg-[#0A3824] hover:bg-[#092E1D] text-[var(--cdm-sand)] font-bold"
        >
          + Rate Assigned Trainee
        </Button>
      </div>

      {error && <div className="mb-4"><Alert type="error" message={error} /></div>}

      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20 text-slate-400 text-sm">Loading evaluations...</div>
        ) : evaluations.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400">
            <span className="text-4xl mb-3">⭐</span>
            <p className="text-sm font-semibold text-slate-700">No evaluations submitted yet</p>
            <p className="text-xs text-slate-400 mt-1">Submit competency ratings for your assigned interns.</p>
          </div>
        ) : (
          <div className="overflow-x-auto" role="region" aria-label="Trainee evaluation records" tabIndex={0}>
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-slate-200/80 bg-slate-50 text-xs font-semibold text-slate-600 uppercase tracking-wider">
                <th className="text-left px-5 py-3.5">Student Trainee</th>
                <th className="text-left px-5 py-3.5">Stage</th>
                <th className="text-left px-5 py-3.5">Performance Rating</th>
                <th className="text-left px-5 py-3.5">Supervisor Feedback</th>
                <th className="text-left px-5 py-3.5">Date Submitted</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {evaluations.map(e => (
                <tr key={e.evaluation_id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-5 py-4">
                    <p className="font-bold text-slate-900">{e.students?.users?.full_name}</p>
                    <p className="text-xs text-slate-400 font-mono mt-0.5">{e.students?.student_number} • {e.students?.course}</p>
                  </td>
                  <td className="px-5 py-4">
                    <Badge className={`text-[10px] font-extrabold uppercase ${
                      e.evaluation_type === 'midterm'
                        ? 'bg-amber-50 text-amber-800 border-amber-200'
                        : 'bg-[#0A3824]/10 text-[#0A3824] border-[#0A3824]/30'
                    }`}>
                      {e.evaluation_type === 'midterm' ? 'Midterm (243h)' : 'Final (486h)'}
                    </Badge>
                  </td>
                  <td className="px-5 py-4">
                    {getScoreBadge(e.performance_score)}
                  </td>
                  <td className="px-5 py-4 text-slate-700 max-w-md">
                    <p className="line-clamp-2">{e.feedback}</p>
                  </td>
                  <td className="px-5 py-4 text-slate-500 text-xs font-medium">
                    {new Date(e.evaluation_date).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
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
            <Button variant="ghost" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>Previous</Button>
            <Button variant="ghost" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>Next</Button>
          </div>
        </div>
      )}

      {/* 5-Dimension Rubric Evaluation Modal */}
      <Modal
        title="Trainee Performance Evaluation (5-Dimension Rubric)"
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        size="xl"
        footer={
          <div className="flex items-center justify-between gap-3 w-full">
            <div className="flex items-center gap-2 text-xs">
              <span className="text-slate-500 font-medium">Calculated Rating:</span>
              <span className="font-bold font-mono text-[#0A3824] text-sm">{computedTotalScore}%</span>
            </div>
            <div className="flex gap-2.5">
              <Button variant="ghost" onClick={() => setModalOpen(false)} className="px-4">
                Cancel
              </Button>
              <Button
                onClick={handleSave}
                loading={saving}
                disabled={students.length === 0 || !studentId}
                className="bg-[#0A3824] hover:bg-[#092E1D] text-[var(--cdm-sand)] font-bold shadow-md px-5"
              >
                Submit Official Evaluation
              </Button>
            </div>
          </div>
        }
      >
        <div className="space-y-4">
          {/* Evaluation Stage Selector */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              Practicum Evaluation Milestone Stage <span className="text-rose-500">*</span>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setEvaluationType('midterm')}
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                  evaluationType === 'midterm'
                    ? 'border-[#0A3824] bg-emerald-50/70 ring-2 ring-[#0A3824]'
                    : 'border-slate-200 bg-white hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black text-slate-900">Midterm Evaluation</span>
                  <span className="text-[10px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
                    243h Target
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 mt-1">Midway progress checkpoint (50% completion)</p>
              </button>

              <button
                type="button"
                onClick={() => setEvaluationType('final')}
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                  evaluationType === 'final'
                    ? 'border-[#0A3824] bg-emerald-50/70 ring-2 ring-[#0A3824]'
                    : 'border-slate-200 bg-white hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black text-slate-900">Final Exit Appraisal</span>
                  <span className="text-[10px] font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-full">
                    486h Clearance
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 mt-1">Final exit appraisal for degree clearance</p>
              </button>
            </div>
          </div>

          {/* Trainee Selection */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              Assigned Trainee <span className="text-rose-500">*</span>
            </label>
            {students.length === 0 ? (
              <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 flex flex-col gap-1">
                <span className="font-bold flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-amber-500" />
                  No Trainees Currently Assigned
                </span>
                <span className="text-amber-800/90 leading-relaxed">
                  You do not have any students assigned to your supervisor account yet, or your company assignment is pending confirmation from the OJT Coordinator.
                </span>
              </div>
            ) : (
              <select
                value={studentId}
                onChange={e => handleStudentSelect(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-[#0A3824] shadow-xs"
              >
                <option value="">Select assigned trainee ({students.length} available)</option>
                {students.map(s => (
                  <option key={s.student_id} value={s.student_id}>
                    {s.full_name} — {s.student_number} ({s.course})
                  </option>
                ))}
              </select>
            )}

            {draftRestored && (
              <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-center justify-between">
                <span>✓ Restored unsaved evaluation draft from your previous session.</span>
                <button
                  type="button"
                  onClick={() => {
                    setFeedback('');
                    setCriteria(DEFAULT_CRITERIA);
                    setDraftRestored(false);
                    try { localStorage.removeItem(`ojt_eval_draft_${studentId}`); } catch {}
                  }}
                  className="text-xs text-emerald-700 underline font-semibold ml-2 hover:text-emerald-900"
                >
                  Discard Draft
                </button>
              </div>
            )}
          </div>

          {/* Rubric Dimension Sliders / Inputs */}
          <div className="p-4 sm:p-5 rounded-2xl bg-slate-50/80 border border-slate-200/90 space-y-3.5 shadow-inner">
            <div className="flex items-center justify-between border-b border-slate-200 pb-2">
              <h4 className="text-xs font-black text-slate-900 uppercase tracking-wider">
                CHED Practicum Competency Rubric
              </h4>
              <span className="text-[11px] font-bold text-[#0A3824] bg-emerald-100/80 px-2.5 py-0.5 rounded-full border border-emerald-300">
                5-Point Scale
              </span>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {RUBRIC.map(({ key, label, hint, weight }) => (
                <div key={key} className="space-y-1 p-3 bg-white rounded-xl border border-slate-200/70 shadow-2xs">
                  <label htmlFor={`rating-${key}`} className="flex justify-between items-center gap-2 text-xs font-semibold text-slate-800">
                    <span className="truncate">{label}</span>
                    <span className="text-[10px] text-slate-400 shrink-0">{weight}% weight</span>
                  </label>
                  <select
                    id={`rating-${key}`}
                    value={criteria[key]}
                    onChange={e => setCriteria(c => ({ ...c, [key]: Number(e.target.value) }))}
                    className={`w-full rounded-lg border px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-[#0A3824] ${criteria[key] < 3 ? 'border-red-300 bg-red-50 text-red-800' : 'border-slate-200 bg-white text-slate-900'}`}
                  >
                    {[5, 4, 3, 2, 1].map(r => <option key={r} value={r}>{r} - {RATING_LABELS[r]}</option>)}
                  </select>
                  <p className="text-[10px] text-slate-400">{hint}</p>
                </div>
              ))}
            </div>

            {/* Composite Score Card */}
            <div className="p-3.5 rounded-xl bg-white border border-[#0A3824]/30 flex flex-col sm:flex-row sm:items-center justify-between gap-2 shadow-xs">
              <div>
                <span className="text-xs font-bold text-slate-800">Overall Calculated Competency Rating:</span>
                <p className="text-[11px] text-slate-500">Auto-aggregated composite across all 5 dimensions</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-2xl font-black font-mono text-[#0A3824]">{computedTotalScore}%</span>
                <span className={`text-xs font-extrabold px-2.5 py-1 rounded-full border ${
                  computedTotalScore >= 90 ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                  computedTotalScore >= 80 ? 'bg-teal-50 text-teal-700 border-teal-200' :
                  computedTotalScore >= 75 ? 'bg-amber-50 text-amber-700 border-amber-200' :
                  'bg-red-50 text-red-700 border-red-200'
                }`}>
                  {computedTotalScore >= 90 ? 'Outstanding' :
                   computedTotalScore >= 80 ? 'Very Satisfactory' :
                   computedTotalScore >= 75 ? 'Satisfactory' : 'Needs Improvement'}
                </span>
              </div>
            </div>
          </div>

          {/* Qualitative Feedback */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              Qualitative Feedback & Mentor Remarks {commentRequired && <span className="text-rose-500">*</span>}
            </label>
            <p className={`text-[11px] ${commentRequired ? 'text-red-700 font-semibold' : 'text-slate-500'}`}>
              {commentRequired ? 'Required: at least one rating is below 3. Explain the low rating.' : 'Optional when every rating is 3 or higher. Required for any rating below 3.'}
            </p>
            <textarea
              value={feedback}
              onChange={e => setFeedback(e.target.value)}
              rows={3}
              placeholder="Detail the trainee's technical strengths, key contributions during their practicum shift, and recommended areas for continuous improvement..."
              className="w-full rounded-xl border border-slate-200 p-3 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-[#0A3824] shadow-xs"
              required={commentRequired}
              aria-required={commentRequired}
            />
          </div>

          {formError && <Alert type="error" message={formError} />}
        </div>
      </Modal>
    </div>
  );
}
