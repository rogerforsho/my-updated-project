'use server';

import { getTrustedActor } from '@/src/lib/trusted-actor';
import type { AppResult } from '@ojt/shared';

export interface NonWorkingDay {
  day_id: string;
  day_date: string;
  scope: 'global' | 'department' | 'company';
  department: 'ICS' | 'IBE' | null;
  company_id: string | null;
  label: string;
  companies?: { company_name: string } | null;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Row Level Security decides who may write; these checks only give a readable error. */
export async function listNonWorkingDays(from?: string): Promise<AppResult<NonWorkingDay[]>> {
  const { supabase, user } = await getTrustedActor();
  if (!user) return { data: null, error: { code: 'UNAUTHORIZED', message: 'Not authenticated.' } };
  let query = supabase.from('non_working_days')
    .select('day_id, day_date, scope, department, company_id, label, companies(company_name)')
    .order('day_date', { ascending: true }).limit(500);
  if (from && DATE.test(from)) query = query.gte('day_date', from);
  const { data, error } = await query;
  if (error) return { data: null, error: { code: 'SERVER_FAILURE', message: 'Could not load non-working days.' } };
  return { data: (data ?? []) as unknown as NonWorkingDay[], error: null };
}

export async function addNonWorkingDay(input: {
  day_date: string; scope: 'global' | 'department' | 'company'; department?: 'ICS' | 'IBE'; company_id?: string; label: string;
}): Promise<AppResult<null>> {
  const { supabase, user, profile } = await getTrustedActor();
  if (!user || !profile) return { data: null, error: { code: 'UNAUTHORIZED', message: 'Not authenticated.' } };
  if (!DATE.test(input.day_date)) return { data: null, error: { code: 'VALIDATION_FAILURE', message: 'Choose a valid date.' } };
  const label = input.label?.trim();
  if (!label || label.length > 150) return { data: null, error: { code: 'VALIDATION_FAILURE', message: 'Enter a name of 1 to 150 characters.' } };
  if (input.scope === 'global' && profile.role !== 'Admin')
    return { data: null, error: { code: 'FORBIDDEN', message: 'Only the Super Admin sets national holidays.' } };
  if (input.scope !== 'global' && profile.role !== 'Coordinator')
    return { data: null, error: { code: 'FORBIDDEN', message: 'Only a Coordinator sets department or company suspensions.' } };
  if (input.scope !== 'global' && !input.department)
    return { data: null, error: { code: 'VALIDATION_FAILURE', message: 'Choose a department.' } };
  if (input.scope === 'company' && !input.company_id)
    return { data: null, error: { code: 'VALIDATION_FAILURE', message: 'Choose a company.' } };

  const { error } = await supabase.from('non_working_days').insert({
    day_date: input.day_date,
    scope: input.scope,
    department: input.scope === 'global' ? null : input.department,
    company_id: input.scope === 'company' ? input.company_id : null,
    label,
    created_by: user.id,
  });
  if (error) {
    if (error.code === '23505') return { data: null, error: { code: 'DUPLICATE_REQUEST', message: 'That date is already listed.' } };
    if (error.code === '42501') return { data: null, error: { code: 'FORBIDDEN', message: 'You are not granted that department.' } };
    return { data: null, error: { code: 'SERVER_FAILURE', message: 'Could not save the date.' } };
  }
  return { data: null, error: null };
}

export async function deleteNonWorkingDay(day_id: string): Promise<AppResult<null>> {
  const { supabase, user } = await getTrustedActor();
  if (!user) return { data: null, error: { code: 'UNAUTHORIZED', message: 'Not authenticated.' } };
  const { data, error } = await supabase.from('non_working_days').delete().eq('day_id', day_id).select('day_id');
  if (error) return { data: null, error: { code: 'SERVER_FAILURE', message: 'Could not remove the date.' } };
  if (!data?.length) return { data: null, error: { code: 'FORBIDDEN', message: 'You cannot remove that date.' } };
  return { data: null, error: null };
}
