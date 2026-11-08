import 'server-only';
import { getTrustedActor } from '@/src/lib/trusted-actor';
import { departmentScope } from '@/src/lib/department-scope';
import { resolveCoordinator, resolveSuperAdmin } from '@/src/lib/actor-access';

/** Active OJT Coordinator with department scope attached. */
export async function getCoordinator(opts: { scoped?: boolean } = {}) {
  return resolveCoordinator(await getTrustedActor(), departmentScope, opts);
}

/** Active Super Admin; getTrustedActor already requires aal2 for Admins. */
export async function getSuperAdmin() {
  return resolveSuperAdmin(await getTrustedActor());
}
