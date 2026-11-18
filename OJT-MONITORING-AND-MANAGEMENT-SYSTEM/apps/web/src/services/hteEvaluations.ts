'use server';

import { getTrustedActor } from '@/src/lib/trusted-actor';
import type { AppResult, HteRatings } from '@ojt/shared';

export interface HteEvaluationForCoordinator {
  hte_evaluation_id: string;
  company_id: string;
  department_assigned: string;
  field_of_training: string;
  ratings: HteRatings;
  total_score: number;
  comments: string | null;
  submitted_at: string;
  companies: { company_name: string } | null;
  students: { student_number: string; course: string; users: { full_name: string } };
}

/** The department's HTE evaluations. Row Level Security limits a Coordinator to their granted departments. */
export async function listHteEvaluations(): Promise<AppResult<HteEvaluationForCoordinator[]>> {
  const { supabase, user, profile } = await getTrustedActor();
  if (!user || profile?.role !== 'Coordinator' || profile.account_status !== 'active')
    return { data: null, error: { code: 'FORBIDDEN', message: 'OJT Coordinator access required.' } };
  const { data, error } = await supabase.from('hte_evaluations')
    .select('hte_evaluation_id, company_id, department_assigned, field_of_training, ratings, total_score, comments, submitted_at, companies(company_name), students!inner(student_number, course, users!inner(full_name))')
    .order('submitted_at', { ascending: false });
  if (error) return { data: null, error: { code: 'SERVER_FAILURE', message: 'Failed to load HTE evaluations.' } };
  return { data: (data ?? []) as unknown as HteEvaluationForCoordinator[], error: null };
}
