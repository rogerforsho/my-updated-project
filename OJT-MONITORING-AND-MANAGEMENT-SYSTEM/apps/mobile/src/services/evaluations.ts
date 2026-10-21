import { supabase } from '../lib/supabase';
import type { AppResult, DbEvaluation, DbEvaluationAppeal } from '@ojt/shared';

export type StudentEvaluationRecord = DbEvaluation & {
  appeal: DbEvaluationAppeal | null;
  effective_score: number | null;
};

export interface StudentCompletionRecord {
  final_grade: number;
  recorded_at: string;
  finalized_at: string | null;
  certificate_status: 'active' | 'revoked' | null;
}

export async function listOwnEvaluations(): Promise<AppResult<{
  evaluations: StudentEvaluationRecord[];
  completion: StudentCompletionRecord | null;
}>> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { data: null, error: { code: 'UNAUTHORIZED', message: 'Sign in again to view evaluations.' } };
  const { data: student, error: studentError } = await supabase.from('students')
    .select('student_id').eq('user_id', user.id).maybeSingle();
  if (studentError || !student) return { data: null, error: { code: 'NOT_FOUND', message: 'Student profile not found.' } };
  const [{ data: grade, error: gradeError }, { data: certificate, error: certificateError }] = await Promise.all([
    supabase.from('ojt_final_grades').select('final_grade, recorded_at').eq('student_id', student.student_id).maybeSingle(),
    supabase.from('certificates').select('finalized_at, status').eq('student_id', student.student_id).maybeSingle(),
  ]);
  if (gradeError || certificateError) return { data: null, error: { code: 'SERVER_FAILURE', message: 'Failed to load your completion record.' } };
  const { data: evaluations, error } = await supabase.from('evaluations').select('*')
    .eq('student_id', student.student_id).order('evaluation_date', { ascending: false });
  if (error) return { data: null, error: { code: 'SERVER_FAILURE', message: 'Failed to load your evaluations.' } };
  const { data: appeals, error: appealError } = await supabase.from('evaluation_appeals').select('*')
    .eq('student_id', student.student_id).order('created_at', { ascending: false });
  if (appealError) return { data: null, error: { code: 'SERVER_FAILURE', message: 'Failed to load your appeal history.' } };
  const latest = new Map<string, DbEvaluationAppeal>();
  for (const appeal of (appeals ?? []) as DbEvaluationAppeal[]) {
    if (!latest.has(appeal.evaluation_id)) latest.set(appeal.evaluation_id, appeal);
  }
  return {
    data: {
      evaluations: ((evaluations ?? []) as DbEvaluation[]).map(evaluation => {
      const appeal = latest.get(evaluation.evaluation_id) ?? null;
      return {
        ...evaluation,
        appeal,
        effective_score: appeal?.status === 'adjusted' ? appeal.resolved_score : evaluation.performance_score,
      };
      }),
      completion: grade ? {
        final_grade: Number(grade.final_grade),
        recorded_at: grade.recorded_at,
        finalized_at: certificate?.finalized_at ?? null,
        certificate_status: certificate?.status ?? null,
      } : null,
    },
    error: null,
  };
}

export async function submitOwnEvaluationAppeal(input: {
  evaluation_id: string;
  appeal_reason: string;
  supporting_details?: string;
}): Promise<AppResult<null>> {
  const reason = input.appeal_reason?.trim();
  const evidence = input.supporting_details?.trim() || null;
  if (!input.evaluation_id || !reason || reason.length < 20 || reason.length > 3000 || (evidence && evidence.length > 3000))
    return { data: null, error: { code: 'VALIDATION_FAILURE', message: 'Explain the basis for your appeal in 20 to 3,000 characters.' } };
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { data: null, error: { code: 'UNAUTHORIZED', message: 'Sign in again before submitting an appeal.' } };
  const { data: student, error: studentError } = await supabase.from('students')
    .select('student_id').eq('user_id', user.id).maybeSingle();
  if (studentError || !student) return { data: null, error: { code: 'NOT_FOUND', message: 'Student profile not found.' } };
  const { error } = await supabase.from('evaluation_appeals').insert({
    evaluation_id: input.evaluation_id,
    student_id: student.student_id,
    submitted_by: user.id,
    appeal_reason: reason,
    supporting_details: evidence,
  });
  if (error?.code === '23505') return { data: null, error: { code: 'DUPLICATE_REQUEST', message: 'An appeal for this evaluation is already pending.' } };
  if (error) return { data: null, error: { code: 'SERVER_FAILURE', message: 'Could not submit your evaluation appeal.' } };
  return { data: null, error: null };
}
