// Pure seam behind department-scope.ts (which is server-only): typed record lookup + scope reuse.
const test = require('node:test');
const assert = require('node:assert/strict');

const fakeDb = (tables) => {
  const calls = [];
  return {
    calls,
    from(table) {
      calls.push(table);
      const f = {};
      const q = {
        select: () => q,
        eq: (k, v) => { f[k] = v; return q; },
        maybeSingle: async () => ({ data: (tables[table] ?? []).find((r) => Object.entries(f).every(([k, v]) => r[k] === v)) ?? null, error: null }),
      };
      return q;
    },
  };
};
const passthrough = (q) => q;

test('recordStudentId looks up student_id on the named table', async () => {
  const { recordStudentId } = await import('../apps/web/src/lib/department-access.ts');
  const db = fakeDb({ reports: [{ report_id: 'r1', student_id: 's1' }] });
  assert.equal(await recordStudentId(db, 'reports', 'report_id', 'r1'), 's1');
  assert.equal(await recordStudentId(db, 'reports', 'report_id', 'nope'), null);
});

test('studentInScope uses the given scope and runs a single students query', async () => {
  const { studentInScope } = await import('../apps/web/src/lib/department-access.ts');
  const db = fakeDb({ students: [{ student_id: 's1', user_id: 'u1' }] });
  const ok = { department: 'ICS', departments: ['ICS'], error: null };
  assert.equal(await studentInScope(db, ok, 's1', 'student_id', passthrough), true);
  assert.equal(await studentInScope(db, ok, 'u1', 'user_id', passthrough), true);
  assert.equal(await studentInScope(db, ok, 'zz', 'student_id', passthrough), false);
  assert.deepEqual(db.calls, ['students', 'students', 'students']);
  const bad = { department: null, departments: [], error: 'nope' };
  assert.equal(await studentInScope(db, bad, 's1', 'student_id', passthrough), false);
  assert.equal(db.calls.length, 3); // error scope short-circuits, no query
});
