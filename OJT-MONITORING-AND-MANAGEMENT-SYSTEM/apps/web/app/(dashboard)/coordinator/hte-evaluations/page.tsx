'use client';

import { useEffect, useMemo, useState } from 'react';
import Alert from '@/src/components/ui/Alert';
import { Badge } from '@/src/components/ui/Badge';
import CoordinatorSectionNav from '@/src/components/coordinator/CoordinatorSectionNav';
import { listHteEvaluations, type HteEvaluationForCoordinator } from '@/src/services/hteEvaluations';
import { HTE_EVALUATION_SECTIONS, HTE_RATING_MAX, scoreHteSection } from '@ojt/shared';

const average = (values: number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0);

export default function CoordinatorHteEvaluationsPage() {
  const [rows, setRows] = useState<HteEvaluationForCoordinator[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    listHteEvaluations().then(result => {
      setLoading(false);
      if (result.error) setError(result.error.message);
      else setRows(result.data ?? []);
    });
  }, []);

  // One card per Host Training Establishment, best average first.
  const companies = useMemo(() => {
    const byCompany = new Map<string, { name: string; items: HteEvaluationForCoordinator[] }>();
    for (const row of rows) {
      const entry = byCompany.get(row.company_id) ?? { name: row.companies?.company_name ?? 'Unknown HTE', items: [] };
      entry.items.push(row);
      byCompany.set(row.company_id, entry);
    }
    return [...byCompany.values()].sort((a, b) => average(b.items.map(i => Number(i.total_score))) - average(a.items.map(i => Number(i.total_score))));
  }, [rows]);

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-5xl mx-auto page-fade-in">
      <CoordinatorSectionNav section="evaluations" />
      <div>
        <p className="text-xs font-black st text-emerald-800">Partner quality</p>
        <h1 className="text-2xl font-bold text-slate-900">HTE feedback</h1>
        <p className="text-sm text-slate-500 mt-1">
          What students said about their Host Training Establishment after completing OJT. Supervisors cannot see these answers.
        </p>
      </div>
      {error && <Alert type="error" message={error} />}
      {loading ? <p className="py-16 text-center text-sm text-slate-500">Loading HTE feedback…</p> : companies.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">No students have submitted an HTE evaluation yet.</div>
      ) : companies.map(company => (
        <article key={company.name} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-bold text-slate-900">{company.name}</h2>
              <p className="text-xs text-slate-500">{company.items.length} response{company.items.length === 1 ? '' : 's'}</p>
            </div>
            <Badge className="bg-emerald-50 text-emerald-800 border-emerald-200">{average(company.items.map(i => Number(i.total_score))).toFixed(1)} / 100</Badge>
          </div>
          <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {HTE_EVALUATION_SECTIONS.map(section => (
              <div key={section.id} className="rounded-xl bg-slate-50 p-3">
                <dt className="text-xs text-slate-500">{section.id}. {section.title}</dt>
                <dd className="text-sm font-bold text-slate-900">{average(company.items.map(i => scoreHteSection(i.ratings, section.id))).toFixed(0)}%</dd>
              </div>
            ))}
          </dl>
          <details className="text-sm">
            <summary className="cursor-pointer text-xs font-semibold text-emerald-800">Show individual responses</summary>
            <div className="mt-3 space-y-3">
              {company.items.map(item => (
                <div key={item.hte_evaluation_id} className="rounded-xl border border-slate-200 p-3 space-y-1">
                  <p className="font-semibold text-slate-900">
                    {item.students.users.full_name} <span className="text-xs font-normal text-slate-500">· {item.students.student_number} · {item.students.course}</span>
                  </p>
                  <p className="text-xs text-slate-500">
                    {item.department_assigned} · {item.field_of_training} · {new Date(item.submitted_at).toLocaleDateString()} · {Number(item.total_score).toFixed(0)} / 100
                  </p>
                  <p className="text-xs text-slate-500">
                    Ratings (1-{HTE_RATING_MAX}): {HTE_EVALUATION_SECTIONS.flatMap(s => s.criteria).map(c => `${c.id}:${item.ratings[c.id] ?? '-'}`).join('  ')}
                  </p>
                  <p className="rounded-lg bg-slate-50 p-2 text-slate-700">{item.comments || 'No comments.'}</p>
                </div>
              ))}
            </div>
          </details>
        </article>
      ))}
    </div>
  );
}
