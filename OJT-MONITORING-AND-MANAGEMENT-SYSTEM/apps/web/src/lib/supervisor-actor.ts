// Narrowed Supervisor context only; role/department policy stays in each workflow (ADR 0001 #3).
// No server-only/alias imports so node --test can load it.
type Db = { rpc: (fn: string) => PromiseLike<{ data: unknown }>; from: (t: string) => any };
type Actor = { supabase: Db; user: { id: string } | null; profile: { role?: string } | null };
export type SupervisorError = { code: 'FORBIDDEN' | 'NOT_FOUND'; message: string };

export async function resolveSupervisor(actor: Actor): Promise<{ supervisorId: string; error?: undefined } | { supervisorId?: undefined; error: SupervisorError }> {
  if (!actor.user || actor.profile?.role !== 'Supervisor') return { error: { code: 'FORBIDDEN', message: 'Access denied.' } };
  const { data } = await actor.supabase.rpc('get_my_supervisor_id');
  return data ? { supervisorId: data as string } : { error: { code: 'NOT_FOUND', message: 'Supervisor profile not found.' } };
}

/** activeOnly is explicit because callers differ on whether ended assignments count. */
export async function supervisorOwnsStudent(db: Pick<Db, 'from'>, supervisorId: string, studentId: string, opts: { activeOnly?: boolean } = {}) {
  let q = db.from('student_assignments').select('assignment_id').eq('student_id', studentId).eq('supervisor_id', supervisorId);
  if (opts.activeOnly) q = q.eq('assignment_status', 'active');
  const { data } = await q.limit(1).maybeSingle(); // limit(1): several assignment rows per pair must not read as "not owned"
  return !!data;
}
