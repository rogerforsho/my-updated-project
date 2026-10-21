import { supabase } from '../lib/supabase';
import type { AppResult } from '@ojt/shared';

export interface StudentProgressDetail {
  student_id: string;
  full_name: string;
  student_number: string;
  course: string;
  year_level: number;
  company_name: string;
  required_hours: number;
  completed_hours: number;
  remaining_hours: number;
  progress_status: string;
  percentage: number;
  verified_sessions_count: number;
}

export async function getOwnStudentProgress(): Promise<AppResult<StudentProgressDetail>> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { data: null, error: { code: 'UNAUTHORIZED', message: 'Not authenticated.' } };
  }

  const { data: profile } = await supabase
    .from('users')
    .select('full_name')
    .eq('user_id', user.id)
    .single();

  const { data: student, error: studentErr } = await supabase
    .from('students')
    .select(`
      student_id, student_number, course, year_level, required_hours,
      student_assignments (
        companies ( company_name )
      )
    `)
    .eq('user_id', user.id)
    .single();

  if (studentErr || !student) {
    return { data: null, error: { code: 'NOT_FOUND', message: 'Student profile not found.' } };
  }

  const { data: progress } = await supabase
    .from('internship_progress')
    .select('completed_hours, remaining_hours, progress_status')
    .eq('student_id', student.student_id)
    .maybeSingle();

  const { count: verifiedCount } = await supabase
    .from('attendance')
    .select('*', { count: 'exact', head: true })
    .eq('student_id', student.student_id)
    .eq('verification_status', 'verified');

  const required = student.required_hours || 486;
  const completed = progress?.completed_hours || 0;
  const remaining = Math.max(0, required - completed);
  const percentage = Math.min(100, Math.round((completed / required) * 100));

  const assignments = student.student_assignments as any[];
  const companyObj = assignments?.[0]?.companies;
  const companyName = companyObj?.company_name || 'Not yet assigned';

  return {
    data: {
      student_id: student.student_id,
      full_name: profile?.full_name || '',
      student_number: student.student_number,
      course: student.course,
      year_level: student.year_level,
      company_name: companyName,
      required_hours: required,
      completed_hours: completed,
      remaining_hours: remaining,
      progress_status: progress?.progress_status || (completed > 0 ? 'in_progress' : 'not_started'),
      percentage,
      verified_sessions_count: verifiedCount || 0,
    },
    error: null,
  };
}
