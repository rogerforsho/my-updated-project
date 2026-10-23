'use server';

import crypto from 'crypto';
import { createClient } from '@/src/lib/supabase/server';
import { getServiceClient } from '@/src/lib/supabase/service';
import { departmentScope } from '@/src/lib/department-scope';
import type { AppResult } from '@ojt/shared';

export interface SupervisorInput {
  full_name: string;
  email: string;
  company_id: string;
  position: string;
}

export interface SupervisorWithCompany {
  supervisor_id: string;
  company_id: string;
  position: string;
  users: { full_name: string; email: string };
  companies: { company_name: string };
}

async function assertCoordinator() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { supabase, authorized: false };
  const { data } = await supabase
    .from('users')
    .select('role, account_status')
    .eq('user_id', user.id)
    .single();
  if (data?.role !== 'Coordinator' || data.account_status !== 'active') return { supabase, authorized: false };
  const scope = await departmentScope(supabase, user.id, data.role);
  return { supabase, authorized: !scope.error };
}

function validateSupervisorInput(input: SupervisorInput): string | null {
  if (!input.full_name?.trim()) return 'Full name is required.';
  if (!input.email?.trim()) return 'Email is required.';
  if (!input.company_id) return 'Company is required.';
  if (!input.position?.trim()) return 'Position is required.';
  return null;
}

export async function listSupervisors(
  page = 1,
  pageSize = 20
): Promise<AppResult<{ supervisors: SupervisorWithCompany[]; total: number }>> {
  const { supabase, authorized } = await assertCoordinator();
  if (!authorized) return { data: null, error: { code: 'FORBIDDEN', message: 'Access denied.' } };

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const { data, error, count } = await supabase
    .from('supervisors')
    .select(`
      supervisor_id,
      company_id,
      position,
      users ( full_name, email ),
      companies ( company_name )
    `, { count: 'exact' })
    .order('position', { ascending: true })
    .range(from, to);

  if (error) return { data: null, error: { code: 'SERVER_FAILURE', message: 'Failed to load supervisors.' } };

  interface RawSupervisorRow {
    supervisor_id: string;
    company_id: string;
    position: string;
    users: { full_name?: string | null; email?: string | null } | Array<{ full_name?: string | null; email?: string | null }>;
    companies: { company_name?: string | null } | Array<{ company_name?: string | null }>;
  }

  const supervisors = (data ?? []).map((row: RawSupervisorRow) => {
    const user = Array.isArray(row.users) ? row.users[0] : row.users;
    const company = Array.isArray(row.companies) ? row.companies[0] : row.companies;
    return {
      supervisor_id: row.supervisor_id,
      company_id: row.company_id,
      position: row.position,
      users: {
        full_name: user?.full_name ?? '',
        email: user?.email ?? '',
      },
      companies: {
        company_name: company?.company_name ?? '',
      },
    } satisfies SupervisorWithCompany;
  });

  return {
    data: { supervisors, total: count ?? 0 },
    error: null,
  };
}

export async function createSupervisor(input: SupervisorInput): Promise<AppResult<null>> {
  const validationError = validateSupervisorInput(input);
  if (validationError) return { data: null, error: { code: 'VALIDATION_FAILURE', message: validationError } };

  const { authorized } = await assertCoordinator();
  if (!authorized) return { data: null, error: { code: 'FORBIDDEN', message: 'Access denied.' } };

  const siteUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!siteUrl) return { data: null, error: { code: 'SERVER_FAILURE', message: 'Account invitation is not configured.' } };
  const service = getServiceClient();
  const fullName = input.full_name.trim();
  const email = input.email.trim().toLowerCase();
  const employeeNumber = `SUP-${crypto.randomBytes(8).toString('hex').toUpperCase()}`;
  const redirectTo = `${siteUrl.replace(/\/$/, '')}/auth/callback?next=${encodeURIComponent('/auth/set-password')}`;
  // GoTrue inserts auth.users before app_metadata applies, so register the email for the student-check trigger (service_role only table).
  const { error: pendingError } = await service.from('pending_staff_invites').upsert({ email, created_at: new Date().toISOString() });
  if (pendingError) return { data: null, error: { code: 'SERVER_FAILURE', message: 'Account invitation is not available right now.' } };
  let created;
  try {
    created = await service.auth.admin.createUser({
      email,
      email_confirm: true, // unconfirmed accounts could be claimed by a public signup with this email
      app_metadata: { role: 'Supervisor' },
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
    if (/already|exists|unique/i.test(authError?.message ?? ''))
      return { data: null, error: { code: 'DUPLICATE_REQUEST', message: 'Email already registered. No existing account was changed.' } };
    return { data: null, error: { code: 'SERVER_FAILURE', message: 'Failed to send the supervisor setup invitation.' } };
  }

  const userId = authData.user.id;
  const { error: metadataError } = await service.auth.admin.updateUserById(userId, { app_metadata: { role: 'Supervisor' } });
  let setupError: { message: string } | null = metadataError;
  // The AFTER INSERT trigger defaults new accounts to Student; remove only this new account's placeholder row.
  if (!setupError) {
    const { error } = await service.from('students').delete().eq('user_id', userId).like('student_number', 'PENDING-%');
    setupError = error;
  }
  if (!setupError) {
    const { error } = await service.from('users').update({
      full_name: fullName,
      email,
      role: 'Supervisor',
      employee_number: employeeNumber,
      account_status: 'active',
      updated_at: new Date().toISOString(),
    }).eq('user_id', userId);
    setupError = error;
  }
  if (!setupError) {
    const { error } = await service.from('supervisors').insert({
      user_id: userId,
      company_id: input.company_id,
      position: input.position.trim(),
    });
    setupError = error;
  }

  if (setupError) {
    const { error: rollbackError } = await service.auth.admin.deleteUser(userId);
    if (rollbackError) console.error('[createSupervisor] Incomplete invited account requires cleanup:', userId);
    return { data: null, error: { code: 'SERVER_FAILURE', message: rollbackError
      ? 'Supervisor setup did not finish; the new account needs administrator cleanup before retrying.'
      : 'Supervisor setup did not finish. The newly invited account was removed; please check the details and retry.' } };
  }
  return { data: null, error: null };
}
