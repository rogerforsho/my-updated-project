import 'server-only';
import { createClient } from '@/src/lib/supabase/server';
import { departmentScope, canManageDepartmentStudent } from '@/src/lib/department-scope';
import { serviceClient, authActionLimit } from './internal';
import { defaultStudentPassword } from '@/src/lib/default-password';
import { recordAuditEvent } from '@/src/lib/audit';
import { toPublicSupabaseUrl } from '@/src/lib/supabase/public-url';
import type { AppResult } from '@ojt/shared';
async function assertCoordinator() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, role: '', departments: [] as string[], authorized: false };
  const { data } = await supabase
    .from('users')
    .select('role, account_status')
    .eq('user_id', user.id)
    .single();
  const scope = await departmentScope(supabase, user.id, data?.role ?? '');
  return {
    supabase,
    user,
    role: data?.role ?? '',
    departments: scope.departments,
    authorized: !scope.error && data?.role === 'Coordinator' && data?.account_status === 'active',
  };
}

export async function listPendingStudents(
  page = 1,
  pageSize = 20,
  courseFilter?: string
): Promise<AppResult<{ students: Array<{ user_id: string; full_name: string; email: string; student_number: string; course: string; year_level: number; created_at: string; id_card_path?: string | null; id_card_front_signed_url?: string | null; id_card_back_signed_url?: string | null }>; total: number; departments: string[] }>> {
  const { supabase, departments, authorized } = await assertCoordinator();
  if (!authorized) return { data: null, error: { code: 'FORBIDDEN', message: 'Access denied.' } };

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from('users')
    .select('user_id, full_name, email, created_at, students!inner(student_number, course, year_level, id_card_path, id_card_front_path, id_card_back_path)', { count: 'exact' })
    .eq('role', 'Student')
    .eq('account_status', 'pending')
    .order('created_at', { ascending: false })
    .range(from, to);
  if (courseFilter && courseFilter !== 'All') query = query.eq('students.course', courseFilter);
  const { data, error, count } = await query;

  if (error) return { data: null, error: { code: 'SERVER_FAILURE', message: 'Failed to load pending students.' } };

  const service = serviceClient();
  const students = await Promise.all((data ?? []).map(async (row: any) => {
    const frontPath = row.students?.id_card_front_path ?? row.students?.id_card_path;
    const backPath = row.students?.id_card_back_path;
    let id_card_front_signed_url = null;
    let id_card_back_signed_url = null;
    if (frontPath) {
      try {
        const { data: signed } = await service.storage.from('private-documents').createSignedUrl(frontPath, 3600);
        id_card_front_signed_url = signed?.signedUrl ? toPublicSupabaseUrl(signed.signedUrl) : null;
        if (backPath) {
          const { data: backSigned } = await service.storage.from('private-documents').createSignedUrl(backPath, 3600);
          id_card_back_signed_url = backSigned?.signedUrl ? toPublicSupabaseUrl(backSigned.signedUrl) : null;
        }
      } catch {
        // Fallback silently if signed URL generation fails
      }
    }
    return {
      user_id: row.user_id,
      full_name: row.full_name,
      email: row.email,
      created_at: row.created_at,
      student_number: row.students?.student_number ?? '',
      course: row.students?.course ?? '',
      year_level: row.students?.year_level ?? 0,
      id_card_path: frontPath ?? null,
      id_card_front_signed_url,
      id_card_back_signed_url,
    };
  }));

  return { data: { students, total: count ?? 0, departments }, error: null };
}

export async function listActiveStudents(
  page = 1,
  pageSize = 20,
  searchQuery = ''
): Promise<AppResult<{ students: Array<{ user_id: string; full_name: string; email: string; student_number: string; course: string; year_level: number; account_status: string; created_at: string }>; total: number }>> {
  const { supabase, authorized } = await assertCoordinator();
  if (!authorized) return { data: null, error: { code: 'FORBIDDEN', message: 'Access denied.' } };
  if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 100)
    return { data: null, error: { code: 'VALIDATION_FAILURE', message: 'Invalid page or page size.' } };

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const term = searchQuery.trim().replace(/[%,_*()\\]/g, ' ').replace(/\s+/g, ' ').slice(0, 100);

  let query = supabase
    .from('users')
    .select('user_id, full_name, email, account_status, created_at, students!inner(student_number, course, year_level), student_search:students()', { count: 'exact' })
    .eq('role', 'Student')
    .eq('account_status', 'active');
  if (term) {
    const pattern = '*' + term + '*';
    query = query.or('full_name.ilike.' + pattern + ',email.ilike.' + pattern + ',student_search.not.is.null')
      .or('student_number.ilike.' + pattern + ',course.ilike.' + pattern, { referencedTable: 'student_search' });
  }
  const { data, error, count } = await query
    .order('created_at', { ascending: false })
    .range(from, to);

  if (error) return { data: null, error: { code: 'SERVER_FAILURE', message: 'Failed to load active students.' } };

  const students = (data ?? []).map((row: any) => ({
    user_id: row.user_id,
    full_name: row.full_name,
    email: row.email,
    account_status: row.account_status,
    created_at: row.created_at,
    student_number: row.students?.student_number ?? '',
    course: row.students?.course ?? '',
    year_level: row.students?.year_level ?? 0,
  }));

  return { data: { students, total: count ?? 0 }, error: null };
}

export async function updateStudentAccountStatus(
  user_id: string,
  status: 'active' | 'rejected',
  reason?: string
): Promise<AppResult<{ notificationCreated: boolean; emailQueued: boolean }>> {
  if (!user_id) return { data: null, error: { code: 'VALIDATION_FAILURE', message: 'User ID is required.' } };
  if (!['active', 'rejected'].includes(status))
    return { data: null, error: { code: 'VALIDATION_FAILURE', message: 'Invalid approval status.' } };
  if (status === 'rejected' && (reason?.trim().length ?? 0) < 10)
    return { data: null, error: { code: 'VALIDATION_FAILURE', message: 'A rejection reason of at least 10 characters is required.' } };

  const { supabase, user, role, authorized } = await assertCoordinator();
  if (!authorized) return { data: null, error: { code: 'FORBIDDEN', message: 'Access denied.' } };
  if (!user || !await canManageDepartmentStudent(supabase, user.id, role, user_id, 'user_id'))
    return { data: null, error: { code: 'FORBIDDEN', message: 'Student is outside your department.' } };

  const { data, error } = await supabase.rpc('review_student_registration', {
    p_user_id: user_id,
    p_status: status,
    p_reason: reason?.trim().slice(0, 1000) || null,
  });
  if (error) {
    console.error('[updateStudentAccountStatus] transactional review failed');
    return { data: null, error: { code: 'SERVER_FAILURE', message: 'Failed to process the registration review.' } };
  }

  const result = Array.isArray(data) ? data[0] : data;
  if (result?.result_status === 'email_unconfirmed')
    return { data: null, error: { code: 'FORBIDDEN', message: 'The student must confirm their email before OJT Coordinator approval.' } };
  if (result?.result_status === 'forbidden')
    return { data: null, error: { code: 'FORBIDDEN', message: 'Student is outside your department.' } };
  if (result?.result_status === 'not_found')
    return { data: null, error: { code: 'NOT_FOUND', message: 'Pending student registration not found. It may already have been processed.' } };
  if (result?.result_status !== 'ok')
    return { data: null, error: { code: 'VALIDATION_FAILURE', message: 'Invalid registration review request.' } };

  return { data: { notificationCreated: true, emailQueued: true }, error: null };
}

export async function resetStudentPasswordToDefault(
  user_id: string
): Promise<AppResult<{ hint: string }>> {
  if (!user_id) return { data: null, error: { code: 'VALIDATION_FAILURE', message: 'User ID is required.' } };

  const { supabase, user, role, authorized } = await assertCoordinator();
  if (!authorized || !user) return { data: null, error: { code: 'FORBIDDEN', message: 'Access denied.' } };
  if (!await canManageDepartmentStudent(supabase, user.id, role, user_id, 'user_id'))
    return { data: null, error: { code: 'FORBIDDEN', message: 'Student is outside your department.' } };

  const limited = await authActionLimit('password_reset_admin', user.id, 30, 3600, 'user');
  if (limited) return { data: null, error: limited };

  const service = serviceClient();
  const { data: student } = await service.from('students')
    .select('student_number, users!inner(role, account_status)')
    .eq('user_id', user_id).maybeSingle();
  const profile = Array.isArray((student as any)?.users) ? (student as any).users[0] : (student as any)?.users;
  if (!student || profile?.role !== 'Student' || profile?.account_status !== 'active')
    return { data: null, error: { code: 'NOT_FOUND', message: 'Active student not found.' } };

  const { error: authError } = await service.auth.admin.updateUserById(user_id, {
    password: defaultStudentPassword(student.student_number),
  });
  if (authError) {
    console.error('[resetStudentPasswordToDefault] password update failed');
    return { data: null, error: { code: 'SERVER_FAILURE', message: 'Failed to reset the password.' } };
  }
  const { error: flagError } = await service.from('users').update({ must_change_password: true }).eq('user_id', user_id);
  if (flagError) console.error('[resetStudentPasswordToDefault] could not set must_change_password');

  await recordAuditEvent({
    actor_user_id: user.id,
    action: 'STUDENT_PASSWORD_RESET_TO_DEFAULT',
    entity_type: 'user',
    entity_id: user_id,
  });
  return {
    data: { hint: 'The password is now the student number (prefixed "cdm-" if shorter than 8 characters). The student must change it at next sign-in.' },
    error: null,
  };
}
