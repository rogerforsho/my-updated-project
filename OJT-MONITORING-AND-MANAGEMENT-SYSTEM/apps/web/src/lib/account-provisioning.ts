// Shared account-creation sequence (ADR 0006/0007). Pure: talks to Supabase only through AuthAdapter.
// An email collision fails at createIdentity and never reaches any delete: only identities this call created are rolled back.
import type { SupabaseClient } from '@supabase/supabase-js';

type Err = { message: string } | null;

export interface AuthAdapter {
  registerInvite(email: string, kind?: string): Promise<Err>;
  clearInvite(email: string): Promise<void>;
  createIdentity(input: { email: string; password?: string; app_metadata: Record<string, unknown>; user_metadata: Record<string, unknown> }): Promise<{ userId: string | null; error: Err }>;
  sendSetupLink(email: string, redirectTo: string): Promise<Err>;
  deleteIdentity(userId: string): Promise<Err>;
  /** Sets role metadata, removes the trigger's PENDING student placeholder, fills the users row. */
  initStaffProfile(userId: string, p: { role: string; full_name: string; email: string; employee_number: string }): Promise<Err>;
}

export type ProvisionResult =
  | { ok: true; userId: string }
  | { ok: false; kind: 'invite_unavailable' | 'duplicate' | 'create_failed' | 'invite_failed' | 'setup_failed' }
  | { ok: false; kind: 'cleanup_needed'; userId: string };

export async function provisionAccount(adapter: AuthAdapter, input: {
  email: string;
  /** Auth app_metadata role (Supervisor, Coordinator, Student). */
  role: string;
  full_name: string;
  password?: string;
  user_metadata?: Record<string, unknown>;
  inviteKind?: string;
  /** Staff accounts: set up the users row. Omit for students. */
  staff?: { employee_number: string };
  /** When set, emails the one-time password setup link. */
  redirectTo?: string;
  /** Caller-supplied role rows/grants. */
  setup: (userId: string) => Promise<Err>;
}): Promise<ProvisionResult> {
  // GoTrue inserts auth.users before app_metadata applies, so register the email for the student-check trigger.
  if (await adapter.registerInvite(input.email, input.inviteKind)) return { ok: false, kind: 'invite_unavailable' };
  let created;
  try {
    created = await adapter.createIdentity({
      email: input.email,
      ...(input.password === undefined ? {} : { password: input.password }), // invited staff must not get a password
      app_metadata: { role: input.role },
      user_metadata: { full_name: input.full_name, ...input.user_metadata },
    });
  } finally {
    await adapter.clearInvite(input.email);
  }
  if (created.error || !created.userId) {
    return { ok: false, kind: /already|exists|unique/i.test(created.error?.message ?? '') ? 'duplicate' : 'create_failed' };
  }
  const userId = created.userId;

  const rollback = async (kind: 'invite_failed' | 'setup_failed'): Promise<ProvisionResult> => {
    const error = await adapter.deleteIdentity(userId);
    if (error) { console.error('[provisionAccount] Incomplete account requires cleanup:', userId); return { ok: false, kind: 'cleanup_needed', userId }; }
    return { ok: false, kind };
  };

  if (input.redirectTo && (await adapter.sendSetupLink(input.email, input.redirectTo))) return rollback('invite_failed');
  if (input.staff && (await adapter.initStaffProfile(userId, { role: input.role, full_name: input.full_name, email: input.email, employee_number: input.staff.employee_number }))) return rollback('setup_failed');
  if (await input.setup(userId)) return rollback('setup_failed');
  return { ok: true, userId };
}

/** Undo a run by deleting identities it created; returns how many could not be deleted. */
export async function rollbackIdentities(adapter: AuthAdapter, ids: string[]): Promise<number> {
  let leftovers = 0;
  for (const id of ids) if (await adapter.deleteIdentity(id)) leftovers++;
  return leftovers;
}

type Service = SupabaseClient;

/** Production adapter over the Supabase service client. */
export function supabaseAuthAdapter(service: Service): AuthAdapter {
  return {
    async registerInvite(email, kind) {
      const { error } = await service.from('pending_staff_invites').upsert({ email, ...(kind ? { kind } : {}), created_at: new Date().toISOString() });
      return error;
    },
    async clearInvite(email) { await service.from('pending_staff_invites').delete().eq('email', email); },
    async createIdentity(input) {
      const { data, error } = await service.auth.admin.createUser({ ...input, email_confirm: true }); // unconfirmed accounts could be claimed by a public signup with this email
      return { userId: data?.user?.id ?? null, error };
    },
    async sendSetupLink(email, redirectTo) { return (await service.auth.resetPasswordForEmail(email, { redirectTo })).error; },
    async deleteIdentity(id) { return (await service.auth.admin.deleteUser(id)).error; },
    async initStaffProfile(userId, p) {
      const meta = await service.auth.admin.updateUserById(userId, { app_metadata: { role: p.role } });
      if (meta.error) return meta.error;
      // The AFTER INSERT trigger defaults new accounts to Student; remove only this new account's placeholder row.
      const del = await service.from('students').delete().eq('user_id', userId).like('student_number', 'PENDING-%');
      if (del.error) return del.error;
      const { error } = await service.from('users').update({
        full_name: p.full_name, email: p.email, role: p.role, employee_number: p.employee_number,
        account_status: 'active', updated_at: new Date().toISOString(),
      }).eq('user_id', userId);
      return error;
    },
  };
}
