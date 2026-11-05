// Supervisor preamble helper: narrowed context or a ready AppResult error, plus the ownership check.
const test = require('node:test');
const assert = require('node:assert/strict');

const fakeDb = ({ supervisorId = null, assignments = [] } = {}) => ({
  rpc: async (name) => (name === 'get_my_supervisor_id' ? { data: supervisorId } : { data: null }),
  from() {
    const filters = {};
    const q = {
      select: () => q,
      limit: () => q,
      eq: (k, v) => { filters[k] = v; return q; },
      maybeSingle: async () => ({
        data: assignments.find((a) => Object.entries(filters).every(([k, v]) => a[k] === v)) ?? null,
      }),
    };
    return q;
  },
});
const actor = (role, db) => ({ supabase: db, user: { id: 'u1' }, profile: { role } });

test('resolveSupervisor', async () => {
  const { resolveSupervisor } = await import('../apps/web/src/lib/supervisor-actor.ts');
  const ok = await resolveSupervisor(actor('Supervisor', fakeDb({ supervisorId: 's1' })));
  assert.equal(ok.supervisorId, 's1');
  for (const a of [{ supabase: fakeDb(), user: null, profile: null }, actor('Student', fakeDb({ supervisorId: 's1' }))]) {
    const r = await resolveSupervisor(a);
    assert.deepEqual(r.error, { code: 'FORBIDDEN', message: 'Access denied.' });
  }
  const none = await resolveSupervisor(actor('Supervisor', fakeDb()));
  assert.deepEqual(none.error, { code: 'NOT_FOUND', message: 'Supervisor profile not found.' });
});

test('supervisorOwnsStudent honours activeOnly', async () => {
  const { supervisorOwnsStudent } = await import('../apps/web/src/lib/supervisor-actor.ts');
  const db = fakeDb({ assignments: [{ supervisor_id: 's1', student_id: 'a', assignment_status: 'ended' }, { supervisor_id: 's1', student_id: 'b', assignment_status: 'active' }] });
  assert.equal(await supervisorOwnsStudent(db, 's1', 'a'), true);
  assert.equal(await supervisorOwnsStudent(db, 's1', 'a', { activeOnly: true }), false);
  assert.equal(await supervisorOwnsStudent(db, 's1', 'b', { activeOnly: true }), true);
  assert.equal(await supervisorOwnsStudent(db, 's2', 'b'), false);
});
