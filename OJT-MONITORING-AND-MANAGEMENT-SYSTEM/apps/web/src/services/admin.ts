'use server';

import { createClient } from '@/src/lib/supabase/server';
import { getServiceClient } from '@/src/lib/supabase/service';
import { recordAuditEvent } from '@/src/lib/audit';
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

export interface UserManagementItem {
  user_id: string;
  full_name: string;
  email: string;
  role: UserRole;
  account_status: AccountStatus;
  employee_number?: string | null;
  account_category: string;
  created_at: string;
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
  search?: string
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
  if (search?.trim()) {
    query = query.or(`full_name.ilike.%${search.trim()}%,email.ilike.%${search.trim()}%`);
  }

  const { data, error, count } = await query;
  if (error)
    return { data: null, error: { code: 'SERVER_FAILURE', message: 'Failed to load user records.' } };

  return {
    data: {
      users: (data ?? []) as UserManagementItem[],
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
  const { data: authData, error: authError } = await service.auth.admin.inviteUserByEmail(email, {
    redirectTo,
    data: { full_name: fullName, role: 'Coordinator' },
  });

  if (authError || !authData.user) {
    const duplicate = /already|exists|unique/i.test(authError?.message ?? '');
    return { data: null, error: { code: duplicate ? 'DUPLICATE_REQUEST' : 'SERVER_FAILURE', message: duplicate ? 'Email address is already registered. No existing account was changed.' : 'Failed to send the setup invitation.' } };
  }

  const newUserId = authData.user.id;
  const { error: metadataError } = await service.auth.admin.updateUserById(newUserId, {
    app_metadata: { role: 'Coordinator' },
  });
  // The auth trigger defaults invitees to Student; remove only this new invite's placeholder profile.
  let setupError: { message: string } | null = metadataError;
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
  const { data: target } = await service.from('users').select('role').eq('user_id', user_id).maybeSingle();
  if (!target) return { data: null, error: { code: 'NOT_FOUND', message: 'User account no longer exists.' } };
  if (target.role === 'Student' && ['active', 'rejected'].includes(status)) {
    return { data: null, error: { code: 'FORBIDDEN', message: 'Student account approval and rejection belong to the OJT Coordinator.' } };
  }
  if (user_id === user.id && status !== 'active') {
    return { data: null, error: { code: 'VALIDATION_FAILURE', message: 'You cannot deactivate your own administrator account.' } };
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
  user_id: string
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
    },
  });

  return { data: null, error: null };
}

// ─── Database Archival & Backup (ISO/IEC 25010 / RA 10173) ───────────────────
