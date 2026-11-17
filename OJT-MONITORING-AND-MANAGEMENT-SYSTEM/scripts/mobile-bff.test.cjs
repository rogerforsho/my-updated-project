const test = require('node:test');
const assert = require('node:assert/strict');
const { mobileBffFor } = require('./mobile-bff-harness.cjs');

const student = { user: { id: 'user-a' }, studentId: 'student-a' };
const LIMIT = { action: 'report_submit', max: 5, windowSeconds: 3600 };
const OPTS = { limit: LIMIT, body: { maxBytes: 64, label: 'Test request' } };
const post = (body, token = 'Bearer t') => new Request('https://portal.test/api/mobile/x', {
  method: 'POST', headers: token ? { authorization: token } : {}, body,
});
const outcome = async (bff, request, opts = OPTS) => {
  const pre = await bff.mobileBffPreamble(request, opts);
  return pre.response ? { status: pre.response.status, body: await pre.response.json() } : pre;
};

test('preamble rejects a missing or bad bearer with 401', async () => {
  assert.equal((await outcome(mobileBffFor(student), post('{}', null))).status, 401);
  assert.equal((await outcome(mobileBffFor(null), post('{}'))).status, 401);
});

test('preamble rejects non-student or wrong-status accounts with 403', async () => {
  assert.equal((await outcome(mobileBffFor({ ...student, role: 'Coordinator' }), post('{}'))).status, 403);
  assert.equal((await outcome(mobileBffFor({ ...student, status: 'pending' }), post('{}'))).status, 403);
  assert.equal((await outcome(mobileBffFor({ ...student, status: 'rejected' }), post('{}'), { requiredStatus: 'rejected' })).response, null);
});

test('preamble maps oversized bodies to 413 and unreadable or non-object bodies to 400', async () => {
  const bff = mobileBffFor(student);
  assert.equal((await outcome(bff, post(JSON.stringify({ a: 'x'.repeat(100) })))).status, 413);
  assert.equal((await outcome(bff, post('{nope'))).status, 400);
  assert.equal((await outcome(bff, post('[1]'))).status, 400);
});

test('preamble maps the limiter answer to 429 or 503 and passes its parameters through', async () => {
  const seen = [];
  const limited = await outcome(mobileBffFor(student, { limit: { code: 'RATE_LIMITED', message: 'slow' }, onLimit: (...a) => seen.push(a) }), post('{}'));
  assert.equal(limited.status, 429);
  assert.deepEqual(seen[0], ['report_submit', 'user-a', 5, 3600, 'user']);
  assert.equal((await outcome(mobileBffFor(student, { limit: { code: 'SERVER_FAILURE', message: 'down' } }), post('{}'))).status, 503);
});

test('preamble returns the actor and parsed body when everything passes', async () => {
  const pre = await outcome(mobileBffFor(student), post('{"a":1}'));
  assert.equal(pre.response, null);
  assert.equal(pre.actor.studentId, 'student-a');
  assert.deepEqual({ ...pre.body }, { a: 1 });
});

test('isUuid accepts UUIDs only', () => {
  const { isUuid } = mobileBffFor(student);
  assert.equal(isUuid('00000000-0000-4000-8000-000000000001'), true);
  assert.equal(isUuid('nope'), false);
  assert.equal(isUuid(5), false);
});
