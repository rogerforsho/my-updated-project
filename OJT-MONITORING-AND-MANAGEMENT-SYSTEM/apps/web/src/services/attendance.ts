'use server';

import { getTrustedActor } from '@/src/lib/trusted-actor';

import { getServiceClient } from '@/src/lib/supabase/service';
import { toPublicSupabaseUrl } from '@/src/lib/supabase/public-url';
import { recordAuditEvent } from '@/src/lib/audit';
import type { AppResult, DbAttendance, VerificationStatus } from '@ojt/shared';


export interface AttendanceWithStudent extends DbAttendance {
  students: {
    student_number: string;
    course: string;
    users: { full_name: string };
  };
}



export async function listAttendanceForSupervisor(
  page = 1,
  pageSize = 20,
  verificationFilter?: VerificationStatus,
  search?: string
): Promise<AppResult<{ records: AttendanceWithStudent[]; total: number }>> {
  const { supabase, user, profile } = await getTrustedActor();
  if (!user || profile?.role !== 'Supervisor' || profile?.account_status !== 'active')
    return { data: null, error: { code: 'FORBIDDEN', message: 'Access denied.' } };

  const { data: supervisorId } = await supabase.rpc('get_my_supervisor_id');
  const supervisor = supervisorId ? { supervisor_id: supervisorId } : null;

  if (!supervisor)
    return { data: null, error: { code: 'NOT_FOUND', message: 'Supervisor profile not found.' } };

  // Get assigned student IDs first
  const { data: assignments } = await supabase
    .from('student_assignments')
    .select('student_id')
    .eq('supervisor_id', supervisor.supervisor_id);

  const studentIds = (assignments ?? []).map((a: { student_id: string }) => a.student_id);
  if (studentIds.length === 0)
    return { data: { records: [], total: 0 }, error: null };

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const q = search?.trim().replace(/[%_,()]/g, '');
  let query = supabase
    .from('attendance')
    .select(`*, students${q ? '!inner' : ''} ( student_number, course, users${q ? '!inner' : ''} ( full_name ) )`, { count: 'exact' })
    .in('student_id', studentIds)
    .order('attendance_date', { ascending: false })
    .range(from, to);

  if (verificationFilter) query = query.eq('verification_status', verificationFilter);
  // one table per query: a student number has digits, otherwise match the name
  if (q) query = /\d/.test(q)
    ? query.ilike('students.student_number', `%${q}%`)
    : query.ilike('students.users.full_name', `%${q}%`);

  const { data, error, count } = await query;

  if (error)
    return { data: null, error: { code: 'SERVER_FAILURE', message: 'Failed to load attendance records.' } };

  return { data: { records: data as AttendanceWithStudent[], total: count ?? 0 }, error: null };
}

export async function verifyAttendance(
  attendance_id: string,
  verification_status: 'verified' | 'rejected'
): Promise<AppResult<null>> {
  if (!attendance_id)
    return { data: null, error: { code: 'VALIDATION_FAILURE', message: 'Attendance ID is required.' } };
  if (!['verified', 'rejected'].includes(verification_status))
    return { data: null, error: { code: 'VALIDATION_FAILURE', message: 'Invalid verification status.' } };

  const { supabase, user, profile } = await getTrustedActor();
  if (!user || profile?.role !== 'Supervisor' || profile?.account_status !== 'active')
    return { data: null, error: { code: 'FORBIDDEN', message: 'Access denied.' } };

  const { data: supervisorId } = await supabase.rpc('get_my_supervisor_id');
  const supervisor = supervisorId ? { supervisor_id: supervisorId } : null;

  if (!supervisor)
    return { data: null, error: { code: 'NOT_FOUND', message: 'Supervisor profile not found.' } };

  // IDOR check - verify this attendance belongs to an assigned student
  const { data: record } = await supabase
    .from('attendance')
    .select('student_id, verification_status')
    .eq('attendance_id', attendance_id)
    .single();

  if (!record)
    return { data: null, error: { code: 'NOT_FOUND', message: 'Attendance record not found.' } };

  const { data: assignment } = await supabase
    .from('student_assignments')
    .select('assignment_id')
    .eq('student_id', record.student_id)
    .eq('supervisor_id', supervisor.supervisor_id)
    .eq('assignment_status', 'active')
    .maybeSingle();

  if (!assignment)
    return { data: null, error: { code: 'FORBIDDEN', message: 'You are not assigned to this student.' } };

  if (record.verification_status !== 'pending')
    return { data: null, error: { code: 'DUPLICATE_REQUEST', message: 'Attendance already verified.' } };

  const { data: updated, error } = await supabase
    .from('attendance')
    .update({ verification_status, updated_at: new Date().toISOString() })
    .eq('attendance_id', attendance_id)
    .eq('verification_status', 'pending')
    .select('attendance_id').maybeSingle();

  if (error)
    return { data: null, error: { code: 'SERVER_FAILURE', message: 'Failed to update verification.' } };
  if (!updated)
    return { data: null, error: { code: 'DUPLICATE_REQUEST', message: 'This attendance was already processed. Refresh the list.' } };

  return { data: null, error: null };
}

export async function batchVerifyAttendance(attendanceIds: string[]): Promise<AppResult<{ verifiedCount: number }>> {
  if (!Array.isArray(attendanceIds) || attendanceIds.length === 0 || attendanceIds.length > 20 ||
      attendanceIds.some(id => typeof id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)))
    return { data: null, error: { code: 'VALIDATION_FAILURE', message: 'Choose between 1 and 20 visible attendance records.' } };
  const requestedIds = [...new Set(attendanceIds)];
  const { supabase, user, profile } = await getTrustedActor();
  if (!user || profile?.role !== 'Supervisor' || profile?.account_status !== 'active')
    return { data: null, error: { code: 'FORBIDDEN', message: 'Access denied.' } };

  const { data: supervisorId } = await supabase.rpc('get_my_supervisor_id');
  const supervisor = supervisorId ? { supervisor_id: supervisorId } : null;

  if (!supervisor)
    return { data: null, error: { code: 'NOT_FOUND', message: 'Supervisor profile not found.' } };

  const { data: assignments, error: assignmentError } = await supabase
    .from('student_assignments')
    .select('student_id')
    .eq('supervisor_id', supervisor.supervisor_id)
    .eq('assignment_status', 'active');
  if (assignmentError)
    return { data: null, error: { code: 'SERVER_FAILURE', message: 'Unable to verify your assigned students.' } };

  const studentIds = (assignments ?? []).map((a: { student_id: string }) => a.student_id);
  if (studentIds.length === 0)
    return { data: { verifiedCount: 0 }, error: null };

  const { data: updated, error } = await supabase
    .from('attendance')
    .update({ verification_status: 'verified', updated_at: new Date().toISOString() })
    .in('attendance_id', requestedIds)
    .in('student_id', studentIds)
    .eq('verification_status', 'pending')
    .select('attendance_id');

  if (error)
    return { data: null, error: { code: 'SERVER_FAILURE', message: 'Failed to batch verify attendance.' } };

  if (updated?.length) await recordAuditEvent({
    actor_user_id: user.id, action: 'ATTENDANCE_BATCH_VERIFIED', entity_type: 'attendance',
    details: { attendance_ids: updated.map(row => row.attendance_id) },
  });

  return { data: { verifiedCount: updated?.length ?? 0 }, error: null };
}

/** A Coordinator can decide a single, in-scope attendance exception with a recorded reason. */
export async function coordinatorOverrideVerifyAttendance(
  attendance_id: string,
  verification_status: 'verified' | 'rejected',
  override_reason: string
): Promise<AppResult<null>> {
  if (!attendance_id || !['verified', 'rejected'].includes(verification_status))
    return { data: null, error: { code: 'VALIDATION_FAILURE', message: 'Choose an attendance record and a valid decision.' } };
  if (!override_reason?.trim() || override_reason.trim().length < 10 || override_reason.trim().length > 1000)
    return { data: null, error: { code: 'VALIDATION_FAILURE', message: 'Enter a reason between 10 and 1000 characters.' } };

  const { supabase, user, profile } = await getTrustedActor();
  if (!user || profile?.role !== 'Coordinator' || profile?.account_status !== 'active')
    return { data: null, error: { code: 'FORBIDDEN', message: 'OJT Coordinator access required.' } };

  const { error } = await supabase.rpc('coordinator_decide_attendance_exception', {
    p_attendance_id: attendance_id,
    p_verification_status: verification_status,
    p_override_reason: override_reason.trim(),
  });
  if (error?.code === '23505')
    return { data: null, error: { code: 'DUPLICATE_REQUEST', message: 'Attendance was reviewed by someone else. Refresh and inspect the record.' } };
  if (error?.code === '42501')
    return { data: null, error: { code: 'FORBIDDEN', message: 'Attendance is outside your department grants.' } };
  if (error?.code === 'P0002')
    return { data: null, error: { code: 'NOT_FOUND', message: 'Attendance record not found in your department.' } };
  if (error)
    return { data: null, error: { code: 'SERVER_FAILURE', message: 'Failed to apply and audit the attendance exception decision.' } };
  return { data: null, error: null };
}

export async function getSelfieUrl(selfie_path: string): Promise<AppResult<{ url: string }>> {
  if (!selfie_path)
    return { data: null, error: { code: 'VALIDATION_FAILURE', message: 'Selfie path is required.' } };

  const { supabase, user, profile } = await getTrustedActor();
  if (!user || profile?.account_status !== 'active' || !['Supervisor', 'Coordinator'].includes(profile.role))
    return { data: null, error: { code: 'FORBIDDEN', message: 'Access denied.' } };

  const { data: timeIn } = await supabase.from('attendance').select('attendance_id')
    .eq('time_in_selfie_path', selfie_path).limit(1).maybeSingle();
  const { data: timeOut } = timeIn ? { data: null } : await supabase.from('attendance')
    .select('attendance_id').eq('time_out_selfie_path', selfie_path).limit(1).maybeSingle();
  if (!timeIn && !timeOut)
    return { data: null, error: { code: 'FORBIDDEN', message: 'Selfie is not available to this account.' } };
  if (selfie_path.startsWith('https://')) return { data: { url: selfie_path }, error: null };
  if (selfie_path.startsWith('http://'))
    return { data: null, error: { code: 'VALIDATION_FAILURE', message: 'Insecure selfie URL.' } };

  const { data, error } = await getServiceClient().storage.from('attendance-selfies').createSignedUrl(selfie_path, 300);
  if (error || !data)
    return { data: null, error: { code: 'SERVER_FAILURE', message: 'Failed to retrieve selfie.' } };
  return { data: { url: toPublicSupabaseUrl(data.signedUrl) }, error: null };
}

export async function listAttendanceForCoordinator(
  page = 1,
  pageSize = 20,
  verificationFilter?: VerificationStatus
): Promise<AppResult<{ records: AttendanceWithStudent[]; total: number }>> {
  const { supabase, profile } = await getTrustedActor();
  if (profile?.role !== 'Coordinator' || profile.account_status !== 'active')
    return { data: null, error: { code: 'FORBIDDEN', message: 'Access denied.' } };

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  let query = supabase.from('attendance')
    .select('*, students ( student_number, course, users ( full_name ) )', { count: 'exact' })
    .order('attendance_date', { ascending: false }).range(from, to);
  if (verificationFilter) query = query.eq('verification_status', verificationFilter);
  const { data, error, count } = await query;
  if (error) return { data: null, error: { code: 'SERVER_FAILURE', message: 'Failed to load attendance records.' } };
  return { data: { records: (data ?? []) as AttendanceWithStudent[], total: count ?? 0 }, error: null };
}

export async function listOwnAttendance(
  page = 1,
  pageSize = 20
): Promise<AppResult<{ records: DbAttendance[]; total: number }>> {
  const { supabase, user, profile } = await getTrustedActor();
  if (!user || profile?.role !== 'Student' || profile.account_status !== 'active')
    return { data: null, error: { code: 'FORBIDDEN', message: 'Access denied.' } };
  const { data: student } = await supabase.from('students').select('student_id').eq('user_id', user.id).single();
  if (!student) return { data: null, error: { code: 'NOT_FOUND', message: 'Student profile not found.' } };
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const { data, error, count } = await supabase.from('attendance').select('*', { count: 'exact' })
    .eq('student_id', student.student_id).order('attendance_date', { ascending: false }).range(from, to);
  if (error) return { data: null, error: { code: 'SERVER_FAILURE', message: 'Failed to load attendance.' } };
  return { data: { records: (data ?? []) as DbAttendance[], total: count ?? 0 }, error: null };
}
