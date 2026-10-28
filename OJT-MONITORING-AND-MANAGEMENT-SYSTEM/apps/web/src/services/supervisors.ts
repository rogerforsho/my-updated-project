'use server';

import { createClient } from '@/src/lib/supabase/server';
import { departmentScope } from '@/src/lib/department-scope';
import { provisionSupervisor } from '@/src/lib/provision-supervisor';
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
  pageSize = 20,
  search = ''
): Promise<AppResult<{ supervisors: SupervisorWithCompany[]; total: number }>> {
  const { supabase, authorized } = await assertCoordinator();
  if (!authorized) return { data: null, error: { code: 'FORBIDDEN', message: 'Access denied.' } };

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const q = search.trim().replace(/[%_,()]/g, '');
  let query = supabase
    .from('supervisors')
    .select(`
      supervisor_id,
      company_id,
      position,
      users${q ? '!inner' : ''} ( full_name, email ),
      companies ( company_name )
    `, { count: 'exact' })
    .order('position', { ascending: true })
    .range(from, to);
  if (q) query = query.or(`full_name.ilike.%${q}%,email.ilike.%${q}%`, { referencedTable: 'users' });
  const { data, error, count } = await query;

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

  return provisionSupervisor(input);
}
