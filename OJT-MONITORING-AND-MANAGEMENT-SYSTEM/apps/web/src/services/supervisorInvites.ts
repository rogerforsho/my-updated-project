'use server';

import crypto from 'crypto';
import { getTrustedActor } from '@/src/lib/trusted-actor';
import { getServiceClient } from '@/src/lib/supabase/service';
import { recordAuditEvent } from '@/src/lib/audit';
import { provisionSupervisor } from '@/src/lib/provision-supervisor';
import { authActionLimit } from '@/src/services/auth/internal';
import type { AppResult } from '@ojt/shared';

const INVITE_DAYS = 7;
const MAX_USES = 2;
const hashToken = (token: string) => crypto.createHash('sha256').update(token).digest('hex');
const TOKEN = /^[A-Za-z0-9_-]{43}$/;

export interface SupervisorInviteRow {
  invite_id: string;
  department: 'ICS' | 'IBE';
  company_name: string;
  use_count: number;
  max_uses: number;
  expires_at: string;
  revoked_at: string | null;
  status: 'active' | 'used_up' | 'expired' | 'revoked';
}

/** A Coordinator and the departments they hold an academic grant for. */
async function grantedCoordinator() {
  const { supabase, user, profile } = await getTrustedActor();
  if (!user || profile?.role !== 'Coordinator') return null;
  const { data } = await supabase.from('staff_capability_grants').select('department_scope')
    .eq('user_id', user.id).eq('capability', 'academic_workflows').is('revoked_at', null);
  const departments = [...new Set((data ?? []).map((g) => g.department_scope as string))].filter((d): d is 'ICS' | 'IBE' => d === 'ICS' || d === 'IBE');
  return departments.length ? { userId: user.id, departments } : null;
}

/** The link is returned once; only its hash is stored. */
export async function createSupervisorInvite(input: { company_id: string; department: 'ICS' | 'IBE' }): Promise<AppResult<{ url: string; expires_at: string }>> {
  const actor = await grantedCoordinator();
  if (!actor) return { data: null, error: { code: 'FORBIDDEN', message: 'Access denied.' } };
  if (!actor.departments.includes(input.department))
    return { data: null, error: { code: 'FORBIDDEN', message: 'You are not granted that department.' } };
  const siteUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!siteUrl) return { data: null, error: { code: 'SERVER_FAILURE', message: 'Invitation links are not configured.' } };

  const db = getServiceClient();
  const { data: company } = await db.from('companies').select('company_id, status').eq('company_id', input.company_id).maybeSingle();
  if (!company || company.status !== 'active')
    return { data: null, error: { code: 'VALIDATION_FAILURE', message: 'Choose an active company.' } };

  const token = crypto.randomBytes(32).toString('base64url');
  const expires_at = new Date(Date.now() + INVITE_DAYS * 86_400_000).toISOString();
  const { data: row, error } = await db.from('supervisor_invites').insert({
    token_hash: hashToken(token), department: input.department, company_id: company.company_id,
    created_by: actor.userId, max_uses: MAX_USES, expires_at,
  }).select('invite_id').single();
  if (error || !row) return { data: null, error: { code: 'SERVER_FAILURE', message: 'Could not create the invitation link.' } };

  await recordAuditEvent({ actor_user_id: actor.userId, action: 'SUPERVISOR_INVITE_CREATED', entity_type: 'supervisor_invite', entity_id: row.invite_id, details: { department: input.department, company_id: company.company_id } });
  return { data: { url: `${siteUrl.replace(/\/$/, '')}/auth/supervisor-invite/${token}`, expires_at }, error: null };
}

export async function listSupervisorInvites(): Promise<AppResult<{ departments: ('ICS' | 'IBE')[]; invites: SupervisorInviteRow[] }>> {
  const actor = await grantedCoordinator();
  if (!actor) return { data: null, error: { code: 'FORBIDDEN', message: 'Access denied.' } };
  const { data, error } = await getServiceClient().from('supervisor_invites')
    .select('invite_id, department, use_count, max_uses, expires_at, revoked_at, companies(company_name)')
    .in('department', actor.departments).order('created_at', { ascending: false }).limit(100);
  if (error) return { data: null, error: { code: 'SERVER_FAILURE', message: 'Could not load invitation links.' } };
  const now = Date.now();
  const rows = (data ?? []).map((r) => {
    const company = Array.isArray(r.companies) ? r.companies[0] : r.companies;
    const status: SupervisorInviteRow['status'] = r.revoked_at ? 'revoked' : new Date(r.expires_at).getTime() <= now ? 'expired' : r.use_count >= r.max_uses ? 'used_up' : 'active';
    return { invite_id: r.invite_id, department: r.department, company_name: company?.company_name ?? '', use_count: r.use_count, max_uses: r.max_uses, expires_at: r.expires_at, revoked_at: r.revoked_at, status } as SupervisorInviteRow;
  });
  return { data: { departments: actor.departments, invites: rows }, error: null };
}

export async function revokeSupervisorInvite(invite_id: string): Promise<AppResult<null>> {
  const actor = await grantedCoordinator();
  if (!actor) return { data: null, error: { code: 'FORBIDDEN', message: 'Access denied.' } };
  const { data, error } = await getServiceClient().from('supervisor_invites')
    .update({ revoked_at: new Date().toISOString() })
    .eq('invite_id', invite_id).in('department', actor.departments).is('revoked_at', null).select('invite_id');
  if (error) return { data: null, error: { code: 'SERVER_FAILURE', message: 'Could not revoke the link.' } };
  if (!data?.length) return { data: null, error: { code: 'NOT_FOUND', message: 'Link not found or already revoked.' } };
  await recordAuditEvent({ actor_user_id: actor.userId, action: 'SUPERVISOR_INVITE_REVOKED', entity_type: 'supervisor_invite', entity_id: invite_id });
  return { data: null, error: null };
}

/** Public: what the sign-up page shows before anyone claims a use. Says nothing about why a link is unusable. */
export async function getSupervisorInvitePreview(token: string): Promise<{ company_name: string; department: 'ICS' | 'IBE' } | null> {
  if (!TOKEN.test(token)) return null;
  const { data } = await getServiceClient().from('supervisor_invites')
    .select('department, max_uses, use_count, expires_at, revoked_at, companies(company_name)')
    .eq('token_hash', hashToken(token)).maybeSingle();
  if (!data || data.revoked_at || new Date(data.expires_at).getTime() <= Date.now() || data.use_count >= data.max_uses) return null;
  const company = Array.isArray(data.companies) ? data.companies[0] : data.companies;
  return { company_name: company?.company_name ?? '', department: data.department };
}

/**
 * Public: takes one use of the link, then creates the Supervisor and emails the password setup link.
 * The reply is the same whether or not the email already had an account, so it cannot be used to probe emails.
 */
export async function acceptSupervisorInvite(token: string, input: { full_name: string; email: string; position: string }): Promise<AppResult<null>> {
  const full_name = input.full_name?.trim(); const email = input.email?.trim().toLowerCase(); const position = input.position?.trim();
  if (!TOKEN.test(token) || !full_name || full_name.length > 150 || !position || position.length > 150 || !email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return { data: null, error: { code: 'VALIDATION_FAILURE', message: 'Check your name, position and email.' } };

  const limited = await authActionLimit('register', email, 5, 3600);
  if (limited) return { data: null, error: limited };

  const db = getServiceClient();
  const { data: claimed, error: claimError } = await db.rpc('claim_supervisor_invite', { p_token_hash: hashToken(token) });
  if (claimError) return { data: null, error: { code: 'SERVER_FAILURE', message: 'This link could not be used right now.' } };
  const invite = (claimed as { invite_id: string; company_id: string; department: string }[] | null)?.[0];
  if (!invite) return { data: null, error: { code: 'FORBIDDEN', message: 'This invitation link is no longer valid. Ask your OJT Coordinator for a new one.' } };

  const result = await provisionSupervisor({ full_name, email, position, company_id: invite.company_id });
  if (result.error) {
    await db.rpc('release_supervisor_invite', { p_invite_id: invite.invite_id }); // the sign-up did not happen, so the use is returned
    if (result.error.code === 'DUPLICATE_REQUEST') return { data: null, error: null };
    return { data: null, error: { code: 'SERVER_FAILURE', message: 'Your account could not be set up. Please try again or ask your OJT Coordinator.' } };
  }
  await recordAuditEvent({ action: 'SUPERVISOR_INVITE_USED', entity_type: 'supervisor_invite', entity_id: invite.invite_id, details: { department: invite.department, company_id: invite.company_id } });
  return { data: null, error: null };
}
