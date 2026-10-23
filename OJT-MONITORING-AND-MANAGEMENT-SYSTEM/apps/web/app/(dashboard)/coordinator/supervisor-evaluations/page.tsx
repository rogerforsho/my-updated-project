'use client';

import { useEffect, useState } from 'react';
import Alert from '@/src/components/ui/Alert';
import { Badge } from '@/src/components/ui/Badge';
import { listSubmittedEvaluations, type SubmittedEvaluationForCoordinator } from '@/src/services/evaluations';

export default function CoordinatorSupervisorEvaluationsPage() {
  const [rows, setRows] = useState<SubmittedEvaluationForCoordinator[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    listSubmittedEvaluations().then(result => {
      setLoading(false);
      if (result.error) setError(result.error.message);
      else setRows(result.data ?? []);
    });
  }, []);

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-5xl mx-auto page-fade-in">
      <div>
        <p className="text-[10px] font-black uppercase tracking-widest text-emerald-800">Academic review</p>
        <h1 className="text-2xl font-bold text-slate-900">Supervisor evaluations</h1>
        <p className="text-sm text-slate-500 mt-1">Evaluations submitted by Supervisors for students in your department.</p>
      </div>
      {error && <Alert type="error" message={error} />}
      {loading ? <p className="py-16 text-center text-sm text-slate-500">Loading evaluations…</p> : rows.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">No Supervisor evaluations have been submitted.</div>
      ) : rows.map(row => (
        <article key={row.evaluation_id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-2">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-bold text-slate-900">{row.students.users.full_name}</h2>
              <p className="text-xs text-slate-500">{row.students.student_number} · {row.students.course} · {row.evaluation_type} evaluation · {row.evaluation_date}</p>
              <p className="text-xs text-slate-500">Supervisor: {row.supervisors?.users.full_name ?? 'Unknown'}</p>
            </div>
            <Badge className="bg-emerald-50 text-emerald-800 border-emerald-200">{row.performance_score ?? 'Not scored'}%</Badge>
          </div>
          <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-700">{row.feedback || 'No feedback provided.'}</p>
        </article>
      ))}
    </div>
  );
}
