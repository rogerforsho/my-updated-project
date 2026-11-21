const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const { mobileBffMock } = require('./mobile-bff-harness.cjs');

function loadRoute(mocks) {
  const filename = path.join(root, 'apps/web/app/api/mobile/notifications/route.ts');
  const js = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  vm.runInNewContext(js, { exports, Response, Date, require: name => mocks[name] }, { filename });
  return exports;
}

// Records every update chain so tests can assert exactly which rows a request may touch.
function fixture({ updateError = null, found = true } = {}) {
  const calls = [];
  const supabase = {
    from(table) {
      const call = { table, changes: null, filters: [] };
      calls.push(call);
      const chain = {
        update(changes) { call.changes = changes; return chain; },
        eq(column, value) { call.filters.push(['eq', column, value]); return chain; },
        is(column, value) { call.filters.push(['is', column, value]); return chain; },
        select() { return chain; },
        maybeSingle: async () => ({ data: found ? { notification_id: 'x' } : null, error: updateError }),
        then(resolve) { resolve({ error: updateError }); },
      };
      return chain;
    },
  };
  const route = loadRoute({
    '@/src/lib/mobile-bff': mobileBffMock({ user: { id: 'user-a' }, studentId: 'student-a', supabase }),
  });
  const post = body => route.POST(new Request('https://portal.test/api/mobile/notifications', { method: 'POST', body: JSON.stringify(body) }));
  return { calls, post };
}

const plain = value => JSON.parse(JSON.stringify(value));
const ID = '00000000-0000-4000-8000-000000000001';

test('mark all as read is one update limited to the caller\'s unread, non-archived rows', async () => {
  const f = fixture();
  const res = await f.post({ all: true });
  assert.equal(res.status, 200);
  assert.equal(f.calls.length, 1);
  assert.deepEqual(plain(f.calls[0].changes), { status: 'read' });
  assert.deepEqual(plain(f.calls[0].filters), [['eq', 'receiver_user_id', 'user-a'], ['eq', 'status', 'unread'], ['is', 'archived_at', null]]);
});

test('archive marks the single notice read and archived for its owner only', async () => {
  const f = fixture();
  const res = await f.post({ notification_id: ID, archive: true });
  assert.equal(res.status, 200);
  assert.equal(f.calls[0].changes.status, 'read');
  assert.match(f.calls[0].changes.archived_at, /^\d{4}-\d{2}-\d{2}T/);
  assert.deepEqual(plain(f.calls[0].filters), [['eq', 'notification_id', ID], ['eq', 'receiver_user_id', 'user-a']]);
});

test('a plain single request still only marks read and does not archive', async () => {
  const f = fixture();
  await f.post({ notification_id: ID });
  assert.deepEqual(plain(f.calls[0].changes), { status: 'read' });
});

test('rejects bad ids, a truthy-but-not-true all flag, and unknown notices', async () => {
  for (const body of [{ notification_id: 'nope' }, { all: 'true' }, {}]) {
    const f = fixture();
    assert.equal((await f.post(body)).status, 400);
    assert.equal(f.calls.length, 0);
  }
  assert.equal((await fixture({ found: false }).post({ notification_id: ID })).status, 404);
  assert.equal((await fixture({ updateError: { message: 'db' } }).post({ all: true })).status, 503);
});
