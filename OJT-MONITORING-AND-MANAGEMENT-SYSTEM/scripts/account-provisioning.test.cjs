// One account-creation module (ADR 0006/0007): invite, create identity, set up, roll back, map duplicates.
const test = require('node:test');
const assert = require('node:assert/strict');

function fakeAdapter(opts = {}) {
  const identities = new Map(Object.entries(opts.existing ?? {})); // email -> id
  const log = [];
  return {
    identities, log,
    async registerInvite(email, kind) { log.push(['invite', email, kind]); return opts.inviteError ? { message: 'x' } : null; },
    async clearInvite(email) { log.push(['clearInvite', email]); },
    async createIdentity(input) {
      log.push(['create', input.email]);
      if (identities.has(input.email)) return { userId: null, error: { message: 'A user with this email address has already been registered' } };
      if (opts.createError) return { userId: null, error: { message: 'boom' } };
      identities.set(input.email, 'new-1');
      return { userId: 'new-1', error: null };
    },
    async sendSetupLink(email, redirectTo) { log.push(['link', email, redirectTo]); return opts.linkError ? { message: 'smtp' } : null; },
    async deleteIdentity(id) {
      log.push(['delete', id]);
      if (opts.deleteError) return { message: 'cannot delete' };
      for (const [e, v] of identities) if (v === id) identities.delete(e);
      return null;
    },
    async initStaffProfile(id, p) { log.push(['profile', id, p.role]); return opts.profileError ? { message: 'p' } : null; },
  };
}
const base = { email: 'a@b.co', role: 'Supervisor', full_name: 'A', staff: { employee_number: 'SUP-1' }, redirectTo: 'http://x/cb', setup: async () => null };
const load = () => import('../apps/web/src/lib/account-provisioning.ts');

test('creates identity, profile, runs caller setup, clears invite', async () => {
  const { provisionAccount } = await load();
  const a = fakeAdapter();
  let setupFor;
  const r = await provisionAccount(a, { ...base, setup: async id => { setupFor = id; return null; } });
  assert.deepEqual(r, { ok: true, userId: 'new-1' });
  assert.equal(setupFor, 'new-1');
  assert.ok(a.log.some(l => l[0] === 'link' && l[2] === 'http://x/cb'));
  assert.ok(a.log.some(l => l[0] === 'clearInvite'));
});

test('duplicate email never touches the existing identity', async () => {
  const { provisionAccount } = await load();
  const a = fakeAdapter({ existing: { 'a@b.co': 'old-9' } });
  const r = await provisionAccount(a, base);
  assert.deepEqual(r, { ok: false, kind: 'duplicate' });
  assert.equal(a.identities.get('a@b.co'), 'old-9');
  assert.equal(a.log.some(l => l[0] === 'delete' || l[0] === 'profile' || l[0] === 'link'), false);
  assert.ok(a.log.some(l => l[0] === 'clearInvite'), 'invite cleared even on failure');
});

test('invite registration failure creates nothing', async () => {
  const { provisionAccount } = await load();
  const a = fakeAdapter({ inviteError: true });
  assert.deepEqual(await provisionAccount(a, base), { ok: false, kind: 'invite_unavailable' });
  assert.equal(a.log.some(l => l[0] === 'create'), false);
});

test('setup link failure removes only the new identity', async () => {
  const { provisionAccount } = await load();
  const a = fakeAdapter({ linkError: true });
  assert.deepEqual(await provisionAccount(a, base), { ok: false, kind: 'invite_failed' });
  assert.deepEqual(a.log.filter(l => l[0] === 'delete'), [['delete', 'new-1']]);
});

test('setup failure (profile or caller rows) rolls the new identity back', async () => {
  const { provisionAccount } = await load();
  for (const [opts, over] of [[{ profileError: true }, {}], [{}, { setup: async () => ({ message: 'rows' }) }]]) {
    const a = fakeAdapter(opts);
    assert.deepEqual(await provisionAccount(a, { ...base, ...over }), { ok: false, kind: 'setup_failed' });
    assert.equal(a.identities.size, 0);
  }
});

test('rollback itself failing is reported as cleanup_needed with the id', async () => {
  const { provisionAccount } = await load();
  const a = fakeAdapter({ deleteError: true });
  const r = await provisionAccount(a, { ...base, setup: async () => ({ message: 'rows' }) });
  assert.deepEqual(r, { ok: false, kind: 'cleanup_needed', userId: 'new-1' });
});

test('no staff option and no redirectTo (student import): skips profile and link', async () => {
  const { provisionAccount } = await load();
  const a = fakeAdapter();
  const r = await provisionAccount(a, { email: 'a@b.co', role: 'Student', full_name: 'S', inviteKind: 'student_import', password: 'pw', setup: async () => null });
  assert.equal(r.ok, true);
  assert.equal(a.log.some(l => l[0] === 'profile' || l[0] === 'link'), false);
  assert.deepEqual(a.log[0], ['invite', 'a@b.co', 'student_import']);
});

test('rollbackIdentities counts leftovers when deletes fail', async () => {
  const { rollbackIdentities } = await load();
  assert.equal(await rollbackIdentities(fakeAdapter(), ['x', 'y']), 0);
  assert.equal(await rollbackIdentities(fakeAdapter({ deleteError: true }), ['x', 'y']), 2);
});
