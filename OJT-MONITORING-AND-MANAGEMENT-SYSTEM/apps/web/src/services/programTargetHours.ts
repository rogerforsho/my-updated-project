'use server';

import { getTrustedActor } from '@/src/lib/trusted-actor';
import type { AppResult } from '@ojt/shared';

export interface ProgramTargetHours {
  course: string;
  required_hours: number;
  confirmed_at: string | null;
  /** Students who would move to a new value: still on the current one, no certificate. */
  following_students: number;
}

const COURSES = ['BSIT', 'BS-CPE', 'BSBA-HRM', 'BSENTREP'];

/** Row Level Security limits the rows to the Coordinator's granted departments. */
export async function listProgramTargetHours(): Promise<AppResult<ProgramTargetHours[]>> {
  const { supabase, user } = await getTrustedActor();
  if (!user) return { data: null, error: { code: 'UNAUTHORIZED', message: 'Not authenticated.' } };
  const { data, error } = await supabase.from('program_target_hours')
    .select('course, required_hours, confirmed_at').order('course');
  if (error) return { data: null, error: { code: 'SERVER_FAILURE', message: 'Could not load Target Hours.' } };
  const rows = await Promise.all((data ?? []).map(async (r) => {
    const { data: n } = await supabase.rpc('count_students_following_target_hours', { p_course: r.course });
    return { ...r, following_students: Number(n ?? 0) } as ProgramTargetHours;
  }));
  return { data: rows, error: null };
}

/** The database function decides who may save; these checks only give a readable error. */
export async function setProgramTargetHours(course: string, hours: number): Promise<AppResult<{ moved: number }>> {
  const { supabase, user, profile } = await getTrustedActor();
  if (!user || !profile) return { data: null, error: { code: 'UNAUTHORIZED', message: 'Not authenticated.' } };
  if (profile.role !== 'Coordinator') return { data: null, error: { code: 'FORBIDDEN', message: 'Only a Coordinator sets Target Hours.' } };
  if (!COURSES.includes(course)) return { data: null, error: { code: 'VALIDATION_FAILURE', message: 'Choose a program.' } };
  if (!Number.isInteger(hours) || hours < 1 || hours > 840) {
    return { data: null, error: { code: 'VALIDATION_FAILURE', message: 'Enter whole hours from 1 to 840.' } };
  }
  const { data, error } = await supabase.rpc('set_program_target_hours', { p_course: course, p_hours: hours });
  if (error) {
    if (error.code === '42501') return { data: null, error: { code: 'FORBIDDEN', message: 'You are not granted that program\'s department.' } };
    if (error.code === '22023') return { data: null, error: { code: 'VALIDATION_FAILURE', message: error.message } };
    return { data: null, error: { code: 'SERVER_FAILURE', message: 'Could not save Target Hours.' } };
  }
  return { data: { moved: Number(data ?? 0) }, error: null };
}
