import { supabase } from '../lib/supabase';
import { validateSchedulePolicy } from '@ojt/shared';
import type { AppResult, DbPracticumSchedule, WorkModality } from '@ojt/shared';
import { postWebBff } from '../lib/webBff';

export interface MobileScheduleInput {
  company_id?: string | null;
  custom_company_name?: string | null;
  work_modality: WorkModality;
  work_days: number[]; // 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat
  time_in: string; // "HH:MM" e.g. "08:00"
  time_out: string; // "HH:MM" e.g. "17:00"
  lunch_break_minutes: number;
  lunch_break_start: string | null;
  start_date: string;
  end_date?: string | null;
  student_notes?: string | null;
}

export async function fetchCompaniesList(): Promise<AppResult<Array<{ company_id: string; company_name: string; address: string }>>> {
  try {
    const { data, error } = await supabase
      .from('companies')
      .select('company_id, company_name, address')
      .eq('status', 'active')
      .order('company_name');

    if (error) {
      return { data: null, error: { code: 'SERVER_FAILURE', message: error.message } };
    }
    return { data: data || [], error: null };
  } catch (err: any) {
    return { data: null, error: { code: 'SERVER_FAILURE', message: err?.message || 'Failed to fetch companies' } };
  }
}

export async function fetchStudentScheduleProposal(): Promise<AppResult<DbPracticumSchedule | null>> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { data: null, error: { code: 'UNAUTHORIZED', message: 'Not logged in.' } };

    const { data: student } = await supabase
      .from('students')
      .select('student_id')
      .eq('user_id', user.id)
      .single();

    if (!student) return { data: null, error: { code: 'NOT_FOUND', message: 'Student not found.' } };

    const { data, error } = await supabase
      .from('practicum_schedules')
      .select(`
        *,
        companies ( company_id, company_name, address )
      `)
      .eq('student_id', student.student_id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      return { data: null, error: { code: 'SERVER_FAILURE', message: error.message } };
    }
    return { data: (data as DbPracticumSchedule) || null, error: null };
  } catch (err: any) {
    return { data: null, error: { code: 'SERVER_FAILURE', message: err?.message || 'Failed to fetch schedule' } };
  }
}

export async function submitScheduleProposal(
  input: MobileScheduleInput
): Promise<AppResult<DbPracticumSchedule>> {
  try {
    const policy = validateSchedulePolicy(input);
    if (!policy.ok) {
      return { data: null, error: { code: 'VALIDATION_FAILURE', message: policy.message } };
    }
    return postWebBff<DbPracticumSchedule>('/api/mobile/schedule-proposals', {
      ...input,
      lunch_break_minutes: policy.value.lunch_break_minutes,
      lunch_break_start: policy.value.lunch_break_start,
    });
  } catch (err: any) {
    return { data: null, error: { code: 'SERVER_FAILURE', message: err?.message || 'Failed to submit schedule' } };
  }
}
