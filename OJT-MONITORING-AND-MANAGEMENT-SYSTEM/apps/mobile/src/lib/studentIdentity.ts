import type { AppResult } from '@ojt/shared';
import { supabase } from './supabase';

export interface StudentIdentity {
  user_id: string;
  student_id: string;
}

type Fail = { data: null; error: { code: 'UNAUTHORIZED'; message: string } };

// The signed-in auth user, or the one UNAUTHORIZED failure shape every service returns.
export async function requireUser(unauthorizedMessage = 'Not authenticated.'): Promise<AppResult<{ user_id: string }>> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { data: null, error: { code: 'UNAUTHORIZED', message: unauthorizedMessage } } as Fail;
  return { data: { user_id: user.id }, error: null };
}

// The signed-in student: UNAUTHORIZED when signed out, NOT_FOUND when there is no student row.
export async function requireStudent(
  unauthorizedMessage = 'Not authenticated.',
  notFoundMessage = 'Student profile not found.',
): Promise<AppResult<StudentIdentity>> {
  const who = await requireUser(unauthorizedMessage);
  if (!who.data) return { data: null, error: who.error };
  const { data: student, error } = await supabase.from('students')
    .select('student_id').eq('user_id', who.data.user_id).maybeSingle();
  if (error || !student) return { data: null, error: { code: 'NOT_FOUND', message: notFoundMessage } };
  return { data: { user_id: who.data.user_id, student_id: student.student_id }, error: null };
}
