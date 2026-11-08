// One actor-resolution module: allow/deny cases formerly pinned by six private assert* helpers.
const test = require('node:test');
const assert = require('node:assert/strict');

const db = {};
const trusted = (role, user = true) => (user
  ? { supabase: db, user: { id: 'u1' }, profile: { role } }
  : { supabase: db, user: null, profile: null });
const grants = (error = null, departments = ['ICS']) => async () => ({ department: departments.length === 1 ? departments[0] : null, departments, error });

test('resolveCoordinator', async () => {
  const { resolveCoordinator } = await import('../apps/web/src/lib/actor-access.ts');
  const ok = await resolveCoordinator(trusted('Coordinator'), grants());
  assert.equal(ok.authorized, true);
  assert.deepEqual(ok.scope.departments, ['ICS']);
  assert.equal(ok.role, 'Coordinator');
  assert.equal(ok.user.id, 'u1');
  // deny: no/inactive profile, wrong role, unverifiable department scope
  for (const t of [trusted('', false), trusted('Student'), trusted('Supervisor'), trusted('Admin')]) {
    assert.equal((await resolveCoordinator(t, grants())).authorized, false);
  }
  assert.equal((await resolveCoordinator(trusted('Coordinator'), grants('no grant'))).authorized, false);
  // companies never needed a department grant: scope lookup is skipped when not required
  let called = false;
  const lax = await resolveCoordinator(trusted('Coordinator'), async () => { called = true; return grants('x')(); }, { scoped: false });
  assert.equal(lax.authorized, true);
  assert.equal(called, false);
});

test('resolveSuperAdmin', async () => {
  const { resolveSuperAdmin } = await import('../apps/web/src/lib/actor-access.ts');
  assert.equal(resolveSuperAdmin(trusted('Admin')).authorized, true);
  for (const t of [trusted('', false), trusted('Coordinator'), trusted('Student')]) {
    assert.equal(resolveSuperAdmin(t).authorized, false);
  }
});
