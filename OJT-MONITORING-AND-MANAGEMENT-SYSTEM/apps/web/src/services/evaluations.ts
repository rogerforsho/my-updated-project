'use server';

import { getTrustedActor } from '@/src/lib/trusted-actor';

import { canManageDepartmentRecord, canManageDepartmentStudent, departmentScope, restrictDepartment } from '@/src/lib/department-scope';
import { recordAuditEvent } from '@/src/lib/audit';
import type { AppResult, DbEvaluation, DbEvaluationAppeal, EvaluationAppealStatus } from '@ojt/shared';

type EvaluationWithAppeal = DbEvaluation & {
  original_performance_score?: number | null;
  appeal?: DbEvaluationAppeal | null;
};

export interface EvaluationWithStudent extends DbEvaluation {
  students: {
    student_number: string;
    course: string;
    users: { full_name: string };
  };
}

// Supervisor input: each criterion is rated 1-5. Stored as weighted points (out of the weight) so the 100-point grade stays.
export interface EvaluationRubricCriteria {
  technical_competence: number; // 1-5, weight 25
  productivity_dependability: number; // 1-5, weight 20
  attendance_punctuality: number; // 1-5, weight 20
  communication_skills: number; // 1-5, weight 15
  work_ethics_professionalism: number; // 1-5, weight 20
}

const RUBRIC_WEIGHTS: Record<keyof EvaluationRubricCriteria, number> = {
  technical_competence: 25, productivity_dependability: 20, attendance_punctuality: 20,
  communication_skills: 15, work_ethics_professionalism: 20,
};

export interface EvaluationInput {
  student_id: string;
  evaluation_type?: 'midterm' | 'final';
  performance_score: number | null;
  feedback: string;
  criteria?: EvaluationRubricCriteria;
}

export async function listEvaluationsForSupervisor(
  page = 1,
  pageSize = 20
): Promise<AppResult<{ evaluations: EvaluationWithStudent[]; total: number }>> {
  const { supabase, user, profile } = await getTrustedActor();
  if (!user || profile?.role !== 'Supervisor' || profile?.account_status !== 'active')
    return { data: null, error: { code: 'FORBIDDEN', message: 'Access denied.' } };

  const { data: supervisorId } = await supabase.rpc('get_my_supervisor_id');
  const supervisor = supervisorId ? { supervisor_id: supervisorId } : null;

  if (!supervisor)
    return { data: null, error: { code: 'NOT_FOUND', message: 'Supervisor profile not found.' } };

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const { data, error, count } = await supabase
    .from('evaluations')
    .select(`*, students ( student_number, course, users ( full_name ) )`, { count: 'exact' })
    .eq('supervisor_id', supervisor.supervisor_id)
    .order('evaluation_date', { ascending: false })
    .range(from, to);

  if (error)
    return { data: null, error: { code: 'SERVER_FAILURE', message: 'Failed to load evaluations.' } };

  return { data: { evaluations: data as EvaluationWithStudent[], total: count ?? 0 }, error: null };
}

export async function createEvaluation(input: EvaluationInput): Promise<AppResult<null>> {
  if (!input.student_id) return { data: null, error: { code: 'VALIDATION_FAILURE', message: 'Student is required.' } };
  if (input.evaluation_type && !['midterm', 'final'].includes(input.evaluation_type))
    return { data: null, error: { code: 'VALIDATION_FAILURE', message: 'Invalid evaluation type.' } };
  const keys = Object.keys(RUBRIC_WEIGHTS) as (keyof EvaluationRubricCriteria)[];
  const ratings = keys.map(key => input.criteria?.[key]);
  if (ratings.some(value => !Number.isInteger(value) || value! < 1 || value! > 5))
    return { data: null, error: { code: 'VALIDATION_FAILURE', message: 'Rate every criterion from 1 to 5.' } };
  if (ratings.some(value => value! < 3) && !input.feedback?.trim())
    return { data: null, error: { code: 'VALIDATION_FAILURE', message: 'A comment is required when any rating is below 3.' } };

  const { supabase, user, profile } = await getTrustedActor();
  if (!user || profile?.role !== 'Supervisor' || profile?.account_status !== 'active')
    return { data: null, error: { code: 'FORBIDDEN', message: 'Access denied.' } };

  const { data: supervisorId } = await supabase.rpc('get_my_supervisor_id');
  const supervisor = supervisorId ? { supervisor_id: supervisorId } : null;

  if (!supervisor)
    return { data: null, error: { code: 'NOT_FOUND', message: 'Supervisor profile not found.' } };

  const { data: assignment } = await supabase
    .from('student_assignments')
    .select('assignment_id')
    .eq('student_id', input.student_id)
    .eq('supervisor_id', supervisor.supervisor_id)
    .eq('assignment_status', 'active')
    .maybeSingle();

  if (!assignment)
    return { data: null, error: { code: 'FORBIDDEN', message: 'You are not assigned to this student.' } };

  const evalType = input.evaluation_type || 'final';

  const points = Object.fromEntries(keys.map(key => [key, (RUBRIC_WEIGHTS[key] * input.criteria![key]) / 5]));
  const computedScore = Object.values(points).reduce((sum, value) => sum + value, 0);

  const { data: evalRecord, error } = await supabase.from('evaluations').insert({
    student_id: input.student_id,
    supervisor_id: supervisor.supervisor_id,
    evaluation_type: evalType,
    performance_score: computedScore,
    rubric_scores: points,
    feedback: input.feedback?.trim() ?? '',
    evaluation_date: new Date().toISOString().slice(0, 10),
  }).select('evaluation_id').single();

  if (error?.code === '23505') return { data: null, error: { code: 'DUPLICATE_REQUEST', message: 'This evaluation stage was already submitted. Any concern must go through the student appeal process.' } };
  if (error || !evalRecord) return { data: null, error: { code: 'SERVER_FAILURE', message: 'Failed to create evaluation.' } };

  await recordAuditEvent({
    actor_user_id: user.id,
    action: 'EVALUATION_SUBMITTED',
    entity_type: 'evaluation',
    entity_id: evalRecord.evaluation_id,
    details: { student_id: input.student_id, evaluation_type: evalType, score: computedScore, criteria: input.criteria },
  });

  return { data: null, error: null };
}

export interface StudentEvaluationSummary {
  student_id: string;
  student_name: string;
  student_number: string;
  course: string;
  company_name: string;
  supervisor_name: string;
  midterm: EvaluationWithAppeal | null;
  final: EvaluationWithAppeal | null;
  overall_rating: number | null;
  has_passed: boolean;
}

export async function getStudentEvaluationSummary(student_id?: string): Promise<AppResult<StudentEvaluationSummary>> {
  const { supabase, user, profile } = await getTrustedActor();
  if (!user || !profile || profile.account_status !== 'active')
    return { data: null, error: { code: 'FORBIDDEN', message: 'Access denied.' } };

  let targetStudentId = student_id;

  if (profile.role === 'Student') {
    const { data: s } = await supabase.from('students').select('student_id').eq('user_id', user.id).single();
    if (!s) return { data: null, error: { code: 'NOT_FOUND', message: 'Student profile not found.' } };
    targetStudentId = s.student_id;
  }

  if (!targetStudentId) {
    return { data: null, error: { code: 'VALIDATION_FAILURE', message: 'Student ID is required.' } };
  }

  if (profile.role === 'Supervisor') {
    const { data: supervisorId } = await supabase.rpc('get_my_supervisor_id');
    const supervisor = supervisorId ? { supervisor_id: supervisorId } : null;
    if (!supervisor) return { data: null, error: { code: 'FORBIDDEN', message: 'Access denied.' } };
    const { data: assignment, error } = await supabase.from('student_assignments').select('student_id')
      .eq('student_id', targetStudentId).eq('supervisor_id', supervisor.supervisor_id).eq('assignment_status', 'active').maybeSingle();
    if (error || !assignment) return { data: null, error: { code: 'FORBIDDEN', message: 'Student is not assigned to you.' } };
  } else if (profile.role !== 'Student' && !await canManageDepartmentStudent(supabase, user.id, profile.role, targetStudentId)) {
    return { data: null, error: { code: 'FORBIDDEN', message: 'Student is outside your department.' } };
  }
  // Fetch student info
  const { data: student } = await supabase
    .from('students')
    .select('student_id, student_number, course, users ( full_name )')
    .eq('student_id', targetStudentId)
    .single();

  if (!student) return { data: null, error: { code: 'NOT_FOUND', message: 'Student not found.' } };

  // Fetch assignment & supervisor
  const { data: assignment } = await supabase
    .from('student_assignments')
    .select('companies ( company_name ), supervisors ( users ( full_name ) )')
    .eq('student_id', targetStudentId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const compObj = Array.isArray(assignment?.companies) ? assignment?.companies[0] : assignment?.companies;
  const supObj = Array.isArray(assignment?.supervisors) ? assignment?.supervisors[0] : assignment?.supervisors;
  const supUser = Array.isArray(supObj?.users) ? supObj?.users[0] : supObj?.users;

  // Fetch evaluations
  const { data: evaluations } = await supabase
    .from('evaluations')
    .select('*')
    .eq('student_id', targetStudentId)
    .order('evaluation_date', { ascending: false });

  const evals = (evaluations ?? []) as DbEvaluation[];
  const { data: appeals, error: appealsError } = await supabase.from('evaluation_appeals')
    .select('*').eq('student_id', targetStudentId).order('created_at', { ascending: false });
  if (appealsError) return { data: null, error: { code: 'SERVER_FAILURE', message: 'Failed to load evaluation appeal history.' } };
  const latestAppealByEvaluation = new Map<string, DbEvaluationAppeal>();
  for (const appeal of (appeals ?? []) as DbEvaluationAppeal[]) {
    if (!latestAppealByEvaluation.has(appeal.evaluation_id)) latestAppealByEvaluation.set(appeal.evaluation_id, appeal);
  }
  const withAppeal = (evaluation: DbEvaluation | null): EvaluationWithAppeal | null => {
    if (!evaluation) return null;
    const appeal = latestAppealByEvaluation.get(evaluation.evaluation_id) ?? null;
    return {
      ...evaluation,
      original_performance_score: evaluation.performance_score,
      performance_score: appeal?.status === 'adjusted' ? appeal.resolved_score : evaluation.performance_score,
      appeal,
    };
  };
  const midterm = withAppeal(evals.find(e => e.evaluation_type === 'midterm') || null);
  const final = withAppeal(evals.find(e => e.evaluation_type === 'final') || (evals.length > 0 && !midterm ? evals[0] : null));

  let overallRating: number | null = null;
  if (midterm?.performance_score != null && final?.performance_score != null) {
    overallRating = Math.round((Number(midterm.performance_score) * 0.4 + Number(final.performance_score) * 0.6) * 10) / 10;
  } else if (final?.performance_score != null) {
    overallRating = Number(final.performance_score);
  } else if (midterm?.performance_score != null) {
    overallRating = Number(midterm.performance_score);
  }

  const hasPassed = (overallRating !== null && overallRating >= 75) || (final?.performance_score !== null && Number(final?.performance_score) >= 75);

  const studentUser = Array.isArray(student.users) ? student.users[0] : student.users;

  return {
    data: {
      student_id: targetStudentId,
      student_name: studentUser?.full_name || '',
      student_number: student.student_number,
      course: student.course,
      company_name: compObj?.company_name || 'Partner Host Training Establishment',
      supervisor_name: supUser?.full_name || 'Industry Supervisor',
      midterm,
      final,
      overall_rating: overallRating,
      has_passed: hasPassed,
    },
    error: null,
  };
}

export async function overrideEvaluation(
  evaluation_id: string,
  new_score: number,
  reason: string
): Promise<AppResult<null>> {
  if (!evaluation_id) return { data: null, error: { code: 'VALIDATION_FAILURE', message: 'Evaluation ID is required.' } };
  if (typeof new_score !== 'number' || !Number.isFinite(new_score) || new_score < 0 || new_score > 100) return { data: null, error: { code: 'VALIDATION_FAILURE', message: 'Score must be between 0 and 100.' } };
  if (!reason?.trim()) return { data: null, error: { code: 'VALIDATION_FAILURE', message: 'Override justification is required.' } };

  const { supabase, user, profile } = await getTrustedActor();
  if (!user || !profile || profile.role !== 'Coordinator' || profile.account_status !== 'active') {
    return { data: null, error: { code: 'FORBIDDEN', message: 'OJT Coordinator access required.' } };
  }

  if (!await canManageDepartmentRecord(supabase, user.id, profile.role, 'evaluations', 'evaluation_id', evaluation_id))
    return { data: null, error: { code: 'FORBIDDEN', message: 'Evaluation is outside your department.' } };
  return { data: null, error: { code: 'VALIDATION_FAILURE', message: 'Original evaluations are preserved. Decide a submitted student appeal instead.' } };
}

export type EvaluationAppealForCoordinator = DbEvaluationAppeal & {
  evaluations: Pick<DbEvaluation, 'evaluation_type' | 'performance_score' | 'feedback'>;
  students: { student_number: string; course: string; users: { full_name: string } };
};

export async function listEvaluationAppeals(): Promise<AppResult<EvaluationAppealForCoordinator[]>> {
  const { supabase, user, profile } = await getTrustedActor();
  if (!user || profile?.role !== 'Coordinator' || profile.account_status !== 'active')
    return { data: null, error: { code: 'FORBIDDEN', message: 'OJT Coordinator access required.' } };
  const { data, error } = await supabase.from('evaluation_appeals')
    .select('*, evaluations!inner(evaluation_type, performance_score, feedback), students!inner(student_number, course, users!inner(full_name))')
    .order('created_at', { ascending: false });
  if (error) return { data: null, error: { code: 'SERVER_FAILURE', message: 'Failed to load evaluation appeals.' } };
  return { data: (data ?? []) as EvaluationAppealForCoordinator[], error: null };
}

export type SubmittedEvaluationForCoordinator = Pick<DbEvaluation, 'evaluation_id' | 'evaluation_type' | 'performance_score' | 'feedback' | 'evaluation_date'> & {
  students: { student_number: string; course: string; users: { full_name: string } };
  supervisors: { users: { full_name: string } } | null;
};

export async function listSubmittedEvaluations(): Promise<AppResult<SubmittedEvaluationForCoordinator[]>> {
  const { supabase, user, profile } = await getTrustedActor();
  if (!user || profile?.role !== 'Coordinator' || profile.account_status !== 'active')
    return { data: null, error: { code: 'FORBIDDEN', message: 'OJT Coordinator access required.' } };
  const scope = await departmentScope(supabase, user.id, profile.role);
  if (scope.error) return { data: null, error: { code: 'FORBIDDEN', message: scope.error } };
  const { data: students, error: studentError } = await restrictDepartment(supabase.from('students').select('student_id'), scope.department);
  if (studentError) return { data: null, error: { code: 'SERVER_FAILURE', message: 'Failed to load evaluations.' } };
  const ids = (students ?? []).map(row => row.student_id);
  if (!ids.length) return { data: [], error: null };
  const { data, error } = await supabase.from('evaluations')
    .select('evaluation_id, evaluation_type, performance_score, feedback, evaluation_date, students!inner(student_number, course, users!inner(full_name)), supervisors(users(full_name))')
    .in('student_id', ids).order('evaluation_date', { ascending: false });
  if (error) return { data: null, error: { code: 'SERVER_FAILURE', message: 'Failed to load evaluations.' } };
  return { data: (data ?? []) as unknown as SubmittedEvaluationForCoordinator[], error: null };
}

export async function decideEvaluationAppeal(
  appealId: string,
  decision: Extract<EvaluationAppealStatus, 'upheld' | 'adjusted'>,
  resolvedScore: number | null,
  decisionReason: string,
): Promise<AppResult<null>> {
  if (!appealId || !['upheld', 'adjusted'].includes(decision) || !decisionReason?.trim())
    return { data: null, error: { code: 'VALIDATION_FAILURE', message: 'Select a decision and provide the reason.' } };
  if ((decision === 'adjusted' && (typeof resolvedScore !== 'number' || !Number.isFinite(resolvedScore) || resolvedScore < 0 || resolvedScore > 100))
      || (decision === 'upheld' && resolvedScore !== null))
    return { data: null, error: { code: 'VALIDATION_FAILURE', message: 'An adjusted decision needs a score from 0 to 100.' } };
  const { supabase, user, profile } = await getTrustedActor();
  if (!user || profile?.role !== 'Coordinator' || profile.account_status !== 'active')
    return { data: null, error: { code: 'FORBIDDEN', message: 'OJT Coordinator access required.' } };
  if (!await canManageDepartmentRecord(supabase, user.id, profile.role, 'evaluation_appeals', 'appeal_id', appealId))
    return { data: null, error: { code: 'FORBIDDEN', message: 'Appeal is outside your department.' } };
  const { data, error } = await supabase.from('evaluation_appeals').update({
    status: decision,
    decision_reason: decisionReason.trim(),
    resolved_score: decision === 'adjusted' ? resolvedScore : null,
    decided_by: user.id,
  }).eq('appeal_id', appealId).eq('status', 'pending').select('appeal_id').maybeSingle();
  if (error) return { data: null, error: { code: 'SERVER_FAILURE', message: 'Failed to decide evaluation appeal.' } };
  if (!data) return { data: null, error: { code: 'DUPLICATE_REQUEST', message: 'This appeal was already decided or is no longer available.' } };
  await recordAuditEvent({ actor_user_id: user.id, action: 'EVALUATION_APPEAL_DECIDED', entity_type: 'evaluation_appeal', entity_id: appealId, details: { decision, resolved_score: resolvedScore } });
  return { data: null, error: null };
}

export async function listAssignedStudents(): Promise<AppResult<{ student_id: string; full_name: string; student_number: string; course: string }[]>> {
  const { supabase, user, profile } = await getTrustedActor();
  if (!user || profile?.role !== 'Supervisor' || profile?.account_status !== 'active')
    return { data: null, error: { code: 'FORBIDDEN', message: 'Access denied.' } };

  const { data: supervisorId } = await supabase.rpc('get_my_supervisor_id');
  const supervisor = supervisorId ? { supervisor_id: supervisorId } : null;

  if (!supervisor)
    return { data: null, error: { code: 'NOT_FOUND', message: 'Supervisor profile not found.' } };

  const { data, error } = await supabase
    .from('student_assignments')
    .select(`student_id, students ( student_number, course, users ( full_name ) )`)
    .eq('supervisor_id', supervisor.supervisor_id);

  if (error) return { data: null, error: { code: 'SERVER_FAILURE', message: 'Failed to load assigned students.' } };

  return {
    data: (data ?? []).map((row: any) => ({
      student_id: row.student_id,
      full_name: row.students?.users?.full_name ?? '',
      student_number: row.students?.student_number ?? '',
      course: row.students?.course ?? '',
    })),
    error: null,
  };
}

export async function listAssignedStudentsForEvaluation() {
  return listAssignedStudents();
}
