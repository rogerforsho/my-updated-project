'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSearchPaging, SearchBox, PagerBar } from '@/src/components/ui/ListControls';
import Alert from '@/src/components/ui/Alert';
import Button from '@/src/components/ui/Button';
import { Badge } from '@/src/components/ui/Badge';
import { decideEvaluationAppeal, listEvaluationAppeals, type EvaluationAppealForCoordinator } from '@/src/services/evaluations';

export default function CoordinatorEvaluationAppealsPage() {
  const [appeals, setAppeals] = useState<EvaluationAppealForCoordinator[]>([]);
  const list = useSearchPaging(appeals, (a) => `${a.students.users.full_name} ${a.students.student_number} ${a.students.course} ${a.status}`);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [scores, setScores] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const load = useCallback(async () => {
    setError('');
    const result = await listEvaluationAppeals();
    setLoading(false);
    if (result.error) setError(result.error.message);
    else setAppeals(result.data ?? []);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function decide(appeal: EvaluationAppealForCoordinator, decision: 'upheld' | 'adjusted') {
    setError('');
    setSuccess('');
    const reason = reasons[appeal.appeal_id]?.trim() ?? '';
    const scoreText = scores[appeal.appeal_id]?.trim() ?? '';
    if (decision === 'adjusted' && !scoreText) { setError('Enter the adjusted score before saving.'); return; }
    const score = decision === 'adjusted' ? Number(scoreText) : null;
    setSaving(appeal.appeal_id);
    const result = await decideEvaluationAppeal(appeal.appeal_id, decision, score, reason);
    setSaving('');
    if (result.error) { setError(result.error.message); return; }
    setSuccess('Appeal decision saved. The original supervisor evaluation remains unchanged.');
    await load();
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-5xl mx-auto page-fade-in">
      <div>
        <p className="text-[10px] font-black uppercase tracking-widest text-emerald-800">Academic review</p>
        <h1 className="text-2xl font-bold text-slate-900">Evaluation appeals</h1>
        <p className="text-sm text-slate-500 mt-1">Review appeals within your department. Decisions are recorded separately from the original evaluation.</p>
      </div>
      <SearchBox value={list.search} onChange={list.setSearch} placeholder="Search student, ID, course or status..." />
      {error && <Alert type="error" message={error} />}
      {success && <Alert type="success" message={success} />}
      {loading ? <p className="py-16 text-center text-sm text-slate-500">Loading appeals…</p> : appeals.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">No evaluation appeals have been submitted.</div>
      ) : list.visible.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">No appeals match your search.</div>
      ) : list.visible.map(appeal => (
        <article key={appeal.appeal_id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-bold text-slate-900">{appeal.students.users.full_name}</h2>
              <p className="text-xs text-slate-500">{appeal.students.student_number} · {appeal.students.course} · {appeal.evaluations.evaluation_type} evaluation</p>
            </div>
            <Badge className={appeal.status === 'pending' ? 'bg-amber-50 text-amber-800 border-amber-200' : 'bg-slate-100 text-slate-700 border-slate-200'}>{appeal.status}</Badge>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl bg-slate-50 p-3">
              <p className="text-[10px] font-bold uppercase text-slate-500">Original evaluation</p>
              <p className="mt-1 text-sm font-semibold text-slate-800">{appeal.evaluations.performance_score ?? 'Not scored'}% · {appeal.evaluations.feedback}</p>
            </div>
            <div className="rounded-xl bg-emerald-50/70 p-3">
              <p className="text-[10px] font-bold uppercase text-emerald-800">Student appeal</p>
              <p className="mt-1 text-sm text-slate-700">{appeal.appeal_reason}</p>
              {!!appeal.supporting_details && <p className="mt-2 text-xs text-slate-600">Supporting details: {appeal.supporting_details}</p>}
            </div>
          </div>
          {appeal.status === 'pending' ? (
            <div className="grid gap-3 border-t border-slate-100 pt-4 sm:grid-cols-2">
              <label className="text-xs font-semibold text-slate-700 sm:col-span-2">
                Coordinator decision reason
                <textarea value={reasons[appeal.appeal_id] ?? ''} onChange={event => setReasons(old => ({ ...old, [appeal.appeal_id]: event.target.value }))} maxLength={3000} rows={3} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal" placeholder="Explain the decision for the student." />
              </label>
              <label className="text-xs font-semibold text-slate-700">
                Adjusted score, if applicable
                <input type="number" min="0" max="100" step="0.01" value={scores[appeal.appeal_id] ?? ''} onChange={event => setScores(old => ({ ...old, [appeal.appeal_id]: event.target.value }))} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal" placeholder="0–100" />
              </label>
              <div className="flex flex-wrap items-end justify-end gap-2">
                <Button disabled={saving === appeal.appeal_id} onClick={() => decide(appeal, 'upheld')} className="bg-slate-700 text-white">Uphold original</Button>
                <Button disabled={saving === appeal.appeal_id} onClick={() => decide(appeal, 'adjusted')} className="bg-[var(--cdm-green)] text-white">Adjust evaluation</Button>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-slate-100 bg-slate-50 p-3 text-sm text-slate-700">
              <span className="font-semibold">Decision:</span> {appeal.decision_reason}
              {appeal.status === 'adjusted' && <span className="ml-2 font-bold text-emerald-800">Adjusted score: {appeal.resolved_score}%</span>}
            </div>
          )}
        </article>
      ))}
      <PagerBar {...list.pager} />
    </div>
  );
}
