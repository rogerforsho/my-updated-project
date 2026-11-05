'use server';

import { createClient } from '@/src/lib/supabase/server';
import { getServiceClient } from '@/src/lib/supabase/service';
import { recordAuditEvent } from '@/src/lib/audit';
import { restrictDepartment } from '@/src/lib/department-scope';
import { courseDepartment } from '@/src/lib/departments';
import crypto from 'crypto';
import type { AppResult, UserRole, AccountStatus } from '@ojt/shared';

const serviceClient = getServiceClient;

async function assertSuperAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { authorized: false, user: null };
  const { data: assurance, error: assuranceError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (assuranceError || assurance?.currentLevel !== 'aal2') return { authorized: false, user };
  const { data: profile } = await supabase
    .from('users')
    .select('role, account_status')
    .eq('user_id', user.id)
    .single();
  return {
    authorized: profile?.role === 'Admin' && profile?.account_status === 'active',
    user,
  };
}

type Service = ReturnType<typeof serviceClient>;
const COORDINATOR_CAPABILITIES = ['academic_workflows', 'department_reports'];

// A Coordinator "has" the students of their granted departments; block while any of those departments has an active placement.
async function departmentStudentsBlocked(service: Service, departments: string[], action: string): Promise<AppResult<null> | null> {
  for (const department of departments) {
    const { count, error } = await restrictDepartment(
      service.from('students').select('student_id, student_assignments!inner(assignment_id)', { count: 'exact', head: true })
        .eq('student_assignments.assignment_status', 'active'),
      department as 'ICS' | 'IBE');
    if (error) return { data: null, error: { code: 'SERVER_FAILURE', message: 'Could not verify the Coordinator\'s active students.' } };
    if (count) return { data: null, error: { code: 'FORBIDDEN', message: `This Coordinator still has ${count} active student(s) in ${department}. Complete or reassign their placements before ${action}.` } };
  }
  return null;
}

async function coordinatorRemovalBlocked(service: Service, userId: string): Promise<AppResult<null> | null> {
  const { data: grants, error } = await service.from('staff_capability_grants').select('department_scope')
    .eq('user_id', userId).eq('capability', 'academic_workflows').is('revoked_at', null);
  if (error) return { data: null, error: { code: 'SERVER_FAILURE', message: 'Could not verify the Coordinator\'s active students.' } };
  return departmentStudentsBlocked(service, (grants ?? []).map(grant => grant.department_scope), 'deactivating the account');
}

async function supervisorRemovalBlocked(service: Service, userId: string): Promise<AppResult<null> | null> {
  const failure: AppResult<null> = { data: null, error: { code: 'SERVER_FAILURE', message: 'Could not verify the Supervisor\'s active students.' } };
  const { data: supervisor, error } = await service.from('supervisors').select('supervisor_id').eq('user_id', userId).maybeSingle();
  if (error) return failure;
  if (!supervisor) return null;
  const { count, error: countError } = await service.from('student_assignments').select('assignment_id', { count: 'exact', head: true })
    .eq('supervisor_id', supervisor.supervisor_id).eq('assignment_status', 'active');
  if (countError) return failure;
  if (count) return { data: null, error: { code: 'FORBIDDEN', message: `This Supervisor still supervises ${count} active student(s). Complete or reassign their placements before deactivating the account.` } };
  return null;
}

// Staff who still carry active students cannot be switched off.
function removalBlocked(service: Service, role: string, userId: string) {
  if (role === 'Coordinator') return coordinatorRemovalBlocked(service, userId);
  if (role === 'Supervisor') return supervisorRemovalBlocked(service, userId);
  return Promise.resolve(null);
}

export interface UserManagementItem {
  user_id: string;
  full_name: string;
  email: string;
  role: UserRole;
  account_status: AccountStatus;
  employee_number?: string | null;
  account_category: string;
  created_at: string;
  department: string | null;
}

export interface CreateSystemUserInput {
  full_name: string;
  email: string;
  role: 'OJT Coordinator';
  department_scopes: Array<'ICS' | 'IBE'>;
  employee_number?: string;
}

export async function listAllUsers(
  page = 1,
  pageSize = 20,
  roleFilter?: string,
  statusFilter?: string,
  search?: string,
  departmentFilter?: string
): Promise<AppResult<{ users: UserManagementItem[]; total: number }>> {
  const { authorized } = await assertSuperAdmin();
  if (!authorized) return { data: null, error: { code: 'FORBIDDEN', message: 'Super Admin access required.' } };

  const service = serviceClient();
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = service
    .from('users')
    .select('user_id, full_name, email, role, account_status, employee_number, account_category, created_at', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to);

  if (roleFilter && roleFilter !== 'all') query = query.eq('account_category', roleFilter);
  if (statusFilter && statusFilter !== 'all') query = query.eq('account_status', statusFilter);
  if (departmentFilter === 'ICS' || departmentFilter === 'IBE') {
    // Students belong by course, coordinators by an active department grant.
    const [students, grants] = await Promise.all([
      restrictDepartment(service.from('students').select('user_id'), departmentFilter),
      service.from('staff_capability_grants').select('user_id').eq('capability', 'academic_workflows')
        .eq('department_scope', departmentFilter).is('revoked_at', null),
    ]);
    if (students.error || grants.error)
      return { data: null, error: { code: 'SERVER_FAILURE', message: 'Failed to load user records.' } };
    const ids = [...(students.data ?? []), ...(grants.data ?? [])].map(row => row.user_id as string);
    query = query.in('user_id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000']);
  }
  if (search?.trim()) {
    query = query.or(`full_name.ilike.%${search.trim()}%,email.ilike.%${search.trim()}%`);
  }

  const { data, error, count } = await query;
  if (error)
    return { data: null, error: { code: 'SERVER_FAILURE', message: 'Failed to load user records.' } };

  const rows = data ?? [];
  const userIds = rows.map(row => row.user_id as string);
  const [studentRows, grantRows] = await Promise.all([
    service.from('students').select('user_id, course').in('user_id', userIds),
    service.from('staff_capability_grants').select('user_id, department_scope')
      .eq('capability', 'academic_workflows').is('revoked_at', null).in('user_id', userIds),
  ]);
  if (studentRows.error || grantRows.error)
    return { data: null, error: { code: 'SERVER_FAILURE', message: 'Failed to load user records.' } };
  const departments = new Map<string, Set<string>>();
  const addDepartment = (userId: string, department: string | null) => {
    if (!department) return;
    departments.set(userId, (departments.get(userId) ?? new Set()).add(department));
  };
  for (const row of studentRows.data ?? []) addDepartment(row.user_id, courseDepartment(row.course));
  for (const row of grantRows.data ?? []) addDepartment(row.user_id, row.department_scope);

  return {
    data: {
      users: rows.map(row => ({
        ...row,
        department: departments.has(row.user_id) ? [...departments.get(row.user_id)!].sort().join(', ') : null,
      })) as UserManagementItem[],
      total: count ?? 0,
    },
    error: null,
  };
}

export async function createSystemUser(
  input: CreateSystemUserInput
): Promise<AppResult<{ user_id: string }>> {
  const { authorized, user: adminUser } = await assertSuperAdmin();
  if (!authorized || !adminUser) {
    return { data: null, error: { code: 'FORBIDDEN', message: 'Super Admin access required.' } };
  }

  const fullName = input.full_name?.trim();
  const email = input.email?.trim().toLowerCase();
  const departments = [...new Set(input.department_scopes ?? [])];
  if (!fullName) return { data: null, error: { code: 'VALIDATION_FAILURE', message: 'Full name is required.' } };
  if (!email) return { data: null, error: { code: 'VALIDATION_FAILURE', message: 'Email is required.' } };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { data: null, error: { code: 'VALIDATION_FAILURE', message: 'Enter a valid email address.' } };
  if (input.role !== 'OJT Coordinator' || departments.length === 0 || departments.some(department => !['ICS', 'IBE'].includes(department))) {
    return { data: null, error: { code: 'VALIDATION_FAILURE', message: 'Select at least one OJT Coordinator department.' } };
  }

  const siteUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!siteUrl) return { data: null, error: { code: 'SERVER_FAILURE', message: 'Account invitation is not configured.' } };
  const service = serviceClient();
  const redirectTo = `${siteUrl.replace(/\/$/, '')}/auth/callback?next=${encodeURIComponent('/auth/set-password')}`;
  // GoTrue inserts auth.users before app_metadata applies, so register the email for the student-check trigger (service_role only table).
  const { error: pendingError } = await service.from('pending_staff_invites').upsert({ email, created_at: new Date().toISOString() });
  if (pendingError) return { data: null, error: { code: 'SERVER_FAILURE', message: 'Account invitation is not available right now.' } };
  let created;
  try {
    created = await service.auth.admin.createUser({
      email,
      email_confirm: true, // unconfirmed accounts could be claimed by a public signup with this email
      app_metadata: { role: 'Coordinator' },
      user_metadata: { full_name: fullName },
    });
  } finally {
    await service.from('pending_staff_invites').delete().eq('email', email);
  }
  const { data: authData, error: createError } = created;
  let authError = createError;
  if (!authError && authData.user) {
    const { error } = await service.auth.resetPasswordForEmail(email, { redirectTo }); // sends the one-time setup link
    if (error) {
      await service.auth.admin.deleteUser(authData.user.id);
      authError = error;
    }
  }

  if (authError || !authData.user) {
    const duplicate = /already|exists|unique/i.test(authError?.message ?? '');
    return { data: null, error: { code: duplicate ? 'DUPLICATE_REQUEST' : 'SERVER_FAILURE', message: duplicate ? 'Email address is already registered. No existing account was changed.' : 'Failed to send the setup invitation.' } };
  }

  const newUserId = authData.user.id;
  const { error: metadataError } = await service.auth.admin.updateUserById(newUserId, { app_metadata: { role: 'Coordinator' } });
  let setupError: { message: string } | null = metadataError;
  // The AFTER INSERT trigger defaults new accounts to Student; remove only this new account's placeholder row.
  if (!setupError) {
    const { error } = await service.from('students').delete().eq('user_id', newUserId).like('student_number', 'PENDING-%');
    setupError = error;
  }
  if (!setupError) {
    const { error } = await service.from('users').update({
      full_name: fullName,
      email,
      role: 'Coordinator',
      employee_number: input.employee_number?.trim() || `CO-${crypto.randomBytes(6).toString('hex').toUpperCase()}`,
      account_status: 'active',
      updated_at: new Date().toISOString(),
    }).eq('user_id', newUserId);
    setupError = error;
  }
  if (!setupError) {
    const { error } = await service.from('coordinators').insert({ user_id: newUserId, department: departments[0] });
    setupError = error;
  }
  if (!setupError) {
    const grants = departments.flatMap(department => [
      { user_id: newUserId, capability: 'academic_workflows', department_scope: department, granted_by_user_id: adminUser.id },
      { user_id: newUserId, capability: 'department_reports', department_scope: department, granted_by_user_id: adminUser.id },
    ]);
    const { error } = await service.from('staff_capability_grants').insert(grants);
    setupError = error;
  }

  if (setupError) {
    const { error: rollbackError } = await service.auth.admin.deleteUser(newUserId);
    if (rollbackError) console.error('[createSystemUser] Incomplete invited account requires cleanup:', newUserId);
    return { data: null, error: { code: 'SERVER_FAILURE', message: rollbackError
      ? 'Coordinator setup did not finish; the new account needs administrator cleanup before retrying.'
      : 'Coordinator setup did not finish. The newly invited account was removed; please check the details and retry.' } };
  }

  await recordAuditEvent({
    actor_user_id: adminUser.id,
    action: 'OJT_COORDINATOR_INVITED',
    entity_type: 'user',
    entity_id: newUserId,
    details: { role: 'OJT Coordinator', email, departments },
  });
  return { data: { user_id: newUserId }, error: null };
}

export async function updateUserAccountStatus(
  user_id: string,
  status: AccountStatus
): Promise<AppResult<null>> {
  const { authorized, user } = await assertSuperAdmin();
  if (!authorized || !user) return { data: null, error: { code: 'FORBIDDEN', message: 'Super Admin access required.' } };

  if (!['pending', 'active', 'rejected', 'inactive'].includes(status)) {
    return { data: null, error: { code: 'VALIDATION_FAILURE', message: 'Invalid status.' } };
  }
  const service = serviceClient();
  const { data: target } = await service.from('users').select('role, account_status').eq('user_id', user_id).maybeSingle();
  if (!target) return { data: null, error: { code: 'NOT_FOUND', message: 'User account no longer exists.' } };
  // Reactivating an inactive Student is account access (Super Admin); approving or rejecting a registration stays with the Coordinator.
  if (target.role === 'Student' && (status === 'rejected' || (status === 'active' && target.account_status !== 'inactive'))) {
    return { data: null, error: { code: 'FORBIDDEN', message: 'Student account approval and rejection belong to the OJT Coordinator.' } };
  }
  if (user_id === user.id && status !== 'active') {
    return { data: null, error: { code: 'VALIDATION_FAILURE', message: 'You cannot deactivate your own administrator account.' } };
  }
  if (status !== 'active') {
    const blocked = await removalBlocked(service, target.role, user_id);
    if (blocked) return blocked;
  }

  const { data: updatedUser, error } = await service
    .from('users')
    .update({ account_status: status, updated_at: new Date().toISOString() })
    .eq('user_id', user_id)
    .select('user_id').maybeSingle();

  if (error)
    return { data: null, error: { code: 'SERVER_FAILURE', message: 'Failed to update user status.' } };
  if (!updatedUser)
    return { data: null, error: { code: 'NOT_FOUND', message: 'User account no longer exists.' } };

  // Log Audit Event for Non-repudiation
  await recordAuditEvent({
    actor_user_id: user.id,
    action: `ACCOUNT_STATUS_${status.toUpperCase()}`,
    entity_type: 'user',
    entity_id: user_id,
    details: { new_status: status },
  });

  return { data: null, error: null };
}

export async function getSystemOverview(): Promise<AppResult<{
  totalUsers: number;
  activeUsers: number;
  pendingUsers: number;
  roleBreakdown: Record<string, number>;
}>> {
  const { authorized } = await assertSuperAdmin();
  if (!authorized) return { data: null, error: { code: 'FORBIDDEN', message: 'Super Admin access required.' } };

  const service = serviceClient();

  const roles = ['OJT Student', 'OJT Coordinator', 'Supervisor', 'Super Admin'];
  const results = await Promise.all([
    service.from('users').select('*', { count: 'exact', head: true }),
    service.from('users').select('*', { count: 'exact', head: true }).eq('account_status', 'active'),
    service.from('users').select('*', { count: 'exact', head: true }).eq('account_status', 'pending'),
    ...roles.map(role => service.from('users').select('user_id', { count: 'exact', head: true }).eq('account_category', role)),
  ]);
  if (results.some(result => result.error))
    return { data: null, error: { code: 'SERVER_FAILURE', message: 'System overview is temporarily unavailable.' } };
  const [totalUsers, activeUsers, pendingUsers] = results.slice(0, 3).map(result => result.count ?? 0);
  const roleBreakdown = Object.fromEntries(roles.map((role, index) => [role, results[index + 3].count ?? 0]));

  return {
    data: {
      totalUsers: totalUsers ?? 0,
      activeUsers: activeUsers ?? 0,
      pendingUsers: pendingUsers ?? 0,
      roleBreakdown,
    },
    error: null,
  };
}
export async function deactivateSystemUser(
  user_id: string,
  reason?: string
): Promise<AppResult<null>> {
  const { authorized, user: adminUser } = await assertSuperAdmin();
  if (!authorized || !adminUser) {
    return { data: null, error: { code: 'FORBIDDEN', message: 'Super Admin access required.' } };
  }

  if (adminUser.id === user_id) {
    return { data: null, error: { code: 'FORBIDDEN', message: 'You cannot deactivate your own Super Admin account.' } };
  }

  const service = serviceClient();

  // Preserve the profile and linked OJT history for audit and future reference.
  const { data: targetUser } = await service
    .from('users')
    .select('full_name, email, role')
    .eq('user_id', user_id)
    .maybeSingle();

  if (!targetUser) {
    return { data: null, error: { code: 'NOT_FOUND', message: 'User not found.' } };
  }
  const blocked = await removalBlocked(service, targetUser.role, user_id);
  if (blocked) return blocked;

  // Disable access without deleting the Auth identity or linked records.
  const { error: dbError } = await service
    .from('users')
    .update({ account_status: 'inactive', updated_at: new Date().toISOString() })
    .eq('user_id', user_id);

  if (dbError) {
    return { data: null, error: { code: 'SERVER_FAILURE', message: 'Failed to deactivate the user account.' } };
  }

  // Audit Log Entry
  await recordAuditEvent({
    actor_user_id: adminUser.id,
    action: 'USER_DEACTIVATED',
    entity_type: 'user',
    entity_id: user_id,
    details: {
      user_name: targetUser.full_name,
      user_email: targetUser.email,
      user_role: targetUser.role,
      ...(reason?.trim() && { reason: reason.trim().slice(0, 300) }),
    },
  });

  return { data: null, error: null };
}

export async function updateCoordinatorDepartments(
  user_id: string,
  departmentScopes: Array<'ICS' | 'IBE'>
): Promise<AppResult<null>> {
  const { authorized, user } = await assertSuperAdmin();
  if (!authorized || !user) return { data: null, error: { code: 'FORBIDDEN', message: 'Super Admin access required.' } };

  const next = [...new Set(departmentScopes ?? [])];
  if (next.length === 0 || next.some(department => !['ICS', 'IBE'].includes(department)))
    return { data: null, error: { code: 'VALIDATION_FAILURE', message: 'Select at least one OJT Coordinator department.' } };

  const service = serviceClient();
  const { data: target } = await service.from('users').select('role, account_status').eq('user_id', user_id).maybeSingle();
  if (!target) return { data: null, error: { code: 'NOT_FOUND', message: 'User account no longer exists.' } };
  if (target.role !== 'Coordinator' || target.account_status !== 'active')
    return { data: null, error: { code: 'VALIDATION_FAILURE', message: 'Department access can only be edited on an active OJT Coordinator account.' } };

  const { data: grants, error: grantError } = await service.from('staff_capability_grants').select('capability, department_scope')
    .eq('user_id', user_id).in('capability', COORDINATOR_CAPABILITIES).is('revoked_at', null);
  if (grantError) return { data: null, error: { code: 'SERVER_FAILURE', message: 'Could not load the Coordinator\'s department access.' } };

  const held = new Set((grants ?? []).map(grant => `${grant.capability}:${grant.department_scope}`));
  const removed = [...new Set((grants ?? []).map(grant => grant.department_scope as string))].filter(department => !(next as string[]).includes(department));
  const added = next.filter(department => COORDINATOR_CAPABILITIES.some(capability => !held.has(`${capability}:${department}`)));
  if (removed.length === 0 && added.length === 0) return { data: null, error: null };

  const blocked = await departmentStudentsBlocked(service, removed, 'removing that department');
  if (blocked) return blocked;

  // Revoke before granting: a failure part-way leaves less access, never more.
  if (removed.length) {
    const { error } = await service.from('staff_capability_grants')
      .update({ revoked_at: new Date().toISOString(), revoked_by_user_id: user.id })
      .eq('user_id', user_id).in('capability', COORDINATOR_CAPABILITIES).in('department_scope', removed).is('revoked_at', null);
    if (error) return { data: null, error: { code: 'SERVER_FAILURE', message: 'Failed to update department access.' } };
  }
  const missing = added.flatMap(department => COORDINATOR_CAPABILITIES
    .filter(capability => !held.has(`${capability}:${department}`))
    .map(capability => ({ user_id, capability, department_scope: department, granted_by_user_id: user.id })));
  if (missing.length) {
    const { error } = await service.from('staff_capability_grants').insert(missing);
    if (error) return { data: null, error: { code: 'SERVER_FAILURE', message: 'Failed to update department access.' } };
  }
  const { error: legacyError } = await service.from('coordinators').update({ department: next[0] }).eq('user_id', user_id);
  if (legacyError) console.error('[updateCoordinatorDepartments] coordinators.department not synced:', user_id);

  await recordAuditEvent({
    actor_user_id: user.id,
    action: 'COORDINATOR_DEPARTMENTS_UPDATED',
    entity_type: 'user',
    entity_id: user_id,
    details: { departments: next, added, removed },
  });
  return { data: null, error: null };
}

export async function resendStaffInvite(user_id: string): Promise<AppResult<null>> {
  const { authorized, user } = await assertSuperAdmin();
  if (!authorized || !user) return { data: null, error: { code: 'FORBIDDEN', message: 'Super Admin access required.' } };

  const siteUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!siteUrl) return { data: null, error: { code: 'SERVER_FAILURE', message: 'Account invitation is not configured.' } };
  const service = serviceClient();
  const { data: target } = await service.from('users').select('email, role, account_status').eq('user_id', user_id).maybeSingle();
  if (!target) return { data: null, error: { code: 'NOT_FOUND', message: 'User account no longer exists.' } };
  if (!['Coordinator', 'Supervisor'].includes(target.role) || target.account_status !== 'active')
    return { data: null, error: { code: 'VALIDATION_FAILURE', message: 'A setup link can only be sent to an active Coordinator or Supervisor account.' } };

  // Same one-time password link as the original invitation; it only ever goes to the account's own address.
  const redirectTo = `${siteUrl.replace(/\/$/, '')}/auth/callback?next=${encodeURIComponent('/auth/set-password')}`;
  const { error } = await service.auth.resetPasswordForEmail(target.email, { redirectTo });
  if (error) return { data: null, error: { code: 'SERVER_FAILURE', message: 'Failed to send the setup link.' } };

  await recordAuditEvent({
    actor_user_id: user.id,
    action: 'STAFF_INVITE_RESENT',
    entity_type: 'user',
    entity_id: user_id,
    details: { role: target.role, email: target.email },
  });
  return { data: null, error: null };
}

// ─── Database Archival & Backup (ISO/IEC 25010 / RA 10173) ───────────────────
