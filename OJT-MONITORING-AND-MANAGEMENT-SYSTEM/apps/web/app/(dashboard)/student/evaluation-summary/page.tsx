import { redirect } from 'next/navigation';
import { createClient } from '@/src/lib/supabase/server';
import { getStudentEvaluationSummary } from '@/src/services/evaluations';
import EvaluationSummaryClient from './EvaluationSummaryClient';

export default async function StudentEvaluationSummaryPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/auth/sign-in');

  const summary = await getStudentEvaluationSummary();

  if (summary.error || !summary.data) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto page-fade-in text-center text-slate-500">
        <p className="font-semibold text-slate-700">Evaluation records not found.</p>
        <p className="text-xs text-slate-400 mt-1">
          Your company supervisor has not yet submitted your midterm or final performance rating.
        </p>
      </div>
    );
  }

  return <EvaluationSummaryClient summary={summary.data} />;
}
