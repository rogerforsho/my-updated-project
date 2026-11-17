// Pure core of actor.ts (no server-only/alias imports so node --test can load it).
// Turns a trusted actor (active profile, Admin MFA already enforced) into an authorized actor.
// Role policy beyond "which role" stays in each workflow (ADR 0001 #3).
import type { SupabaseClient } from '@supabase/supabase-js';
import type { DepartmentScope } from './department-access';

export type TrustedActor = { supabase: SupabaseClient; user: { id: string } | null; profile: { role?: string } | null };
type ScopeOf = (client: SupabaseClient, userId: string, role: string) => Promise<DepartmentScope>;

const noScope: DepartmentScope = { department: null, departments: [], error: null };

/** `scoped: false` skips the department grant lookup for workflows that never needed one. */
export async function resolveCoordinator<A extends TrustedActor>(actor: A, scopeOf: ScopeOf, opts: { scoped?: boolean } = {}) {
  const { supabase, user } = actor;
  const role = actor.profile?.role ?? '';
  const isCoordinator = !!user && role === 'Coordinator';
  const scope = isCoordinator && opts.scoped !== false ? await scopeOf(supabase, user.id, role) : noScope;
  return { supabase, user: user as A['user'], role, scope, authorized: isCoordinator && !scope.error };
}

export function resolveSuperAdmin<A extends TrustedActor>(actor: A) {
  const authorized = !!actor.user && actor.profile?.role === 'Admin';
  return { supabase: actor.supabase, user: actor.user as A['user'], authorized };
}
