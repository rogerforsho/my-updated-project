const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');

// Runs the real route TypeScript; only the backend, fetch and the clock-free helpers are replaced.
function loader(mocks, globals) {
  const modules = new Map();
  function load(relative) {
    let filename = path.resolve(root, relative);
    if (!path.extname(filename)) filename += '.ts';
    if (modules.has(filename)) return modules.get(filename);
    const exports = {};
    modules.set(filename, exports);
    const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
      fileName: filename,
    }).outputText;
    vm.runInNewContext(output, {
      exports, console, setTimeout, clearTimeout, Date, Buffer, URL, Headers,
      require(name) {
        if (mocks[name]) return mocks[name];
        if (name.startsWith('.')) return load(path.resolve(path.dirname(filename), name));
        return require(name);
      },
      ...globals,
    }, { filename });
    return exports;
  }
  return load;
}

const nowYear = Number(new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' }).slice(0, 4));
const thisYear = nowYear;
const nextYear = nowYear + 1;

function setup({ existing = [], payloads = {}, insertError = null } = {}) {
  const rows = [...existing];
  const inserts = [];
  const fetched = [];
  const service = { from(table) {
    assert.equal(table, 'non_working_days');
    const f = {};
    const query = {
      select() { return this; },
      eq(c, v) { f[c] = v; return this; },
      gte(c, v) { f.gte = v; return this; },
      lte(c, v) { f.lte = v; return this; },
      insert(values) { f.insert = values; return this; },
      then(resolve) {
        if (f.insert) {
          if (insertError) return resolve({ error: insertError });
          inserts.push(...f.insert); rows.push(...f.insert);
          return resolve({ error: null });
        }
        return resolve({ data: rows.filter(r => r.scope === f.scope && r.day_date >= f.gte && r.day_date <= f.lte), error: null });
      },
    };
    return query;
  } };
  const fakeFetch = async (url, init) => {
    fetched.push({ url: String(url), init });
    const year = String(url).match(/PublicHolidays\/(\d{4})\/PH$/)?.[1];
    const payload = payloads[year];
    if (payload instanceof Error) throw payload;
    if (payload === undefined) return { ok: false, status: 500, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => payload };
  };
  const load = loader({
    '@/src/lib/supabase/service': { getServiceClient: () => service },
    '@/src/lib/manila-date': load0('apps/web/src/lib/manila-date.ts'),
  }, { Response, fetch: fakeFetch, AbortSignal, process: { env: { CRON_SECRET: 'test-secret' } } });
  function load0(p) { return loader({}, {})(p); }
  const { POST } = load('apps/web/app/api/internal/import-holidays/route.ts');
  const call = (auth = 'Bearer test-secret') => POST(new Request('http://localhost/api/internal/import-holidays', { method: 'POST', headers: { authorization: auth } }));
  return { call, rows, inserts, fetched };
}

test('holiday import rejects a wrong secret and a missing one', async () => {
  const s = setup();
  assert.equal((await s.call('Bearer wrong')).status, 401);
  assert.equal(s.fetched.length, 0);

  const load = loader({ '@/src/lib/supabase/service': { getServiceClient: () => ({}) }, '@/src/lib/manila-date': { isoDate: () => '2026-01-01' } },
    { Response, fetch: async () => { throw new Error('no fetch'); }, AbortSignal, process: { env: {} } });
  const { POST } = load('apps/web/app/api/internal/import-holidays/route.ts');
  assert.equal((await POST(new Request('http://localhost/x', { method: 'POST' }))).status, 503);
});

test('holiday import adds valid Nager days as global rows and drops malformed ones', async () => {
  const s = setup({ payloads: {
    [thisYear]: [
      { date: `${thisYear}-06-12`, name: ' Independence Day ' },
      { date: `${thisYear}-06-12`, name: 'Duplicate date' },
      { date: 'not-a-date', name: 'Bad date' },
      { date: `${thisYear}-12-25`, name: '   ' },
    ],
    [nextYear]: [{ date: `${nextYear}-01-01`, name: "New Year's Day" }],
  } });
  const res = await s.call();
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { imported: { [thisYear]: 1, [nextYear]: 1 }, skipped: [], failed: [] });
  assert.deepEqual(s.inserts.map(r => [r.day_date, r.label]), [[`${thisYear}-06-12`, 'Independence Day'], [`${nextYear}-01-01`, "New Year's Day"]]);
  for (const r of s.inserts) {
    assert.equal(r.scope, 'global');
    assert.equal(r.source, 'nager');
    assert.equal(r.created_by ?? null, null);
    assert.equal(r.department ?? null, null);
    assert.equal(r.company_id ?? null, null);
  }
  assert.ok(s.fetched.every(f => f.init && f.init.signal), 'every outbound call has a timeout signal');
});

test('holiday import skips a year that was already imported, so deleted days stay deleted', async () => {
  const s = setup({
    existing: [{ day_date: `${thisYear}-06-12`, scope: 'global', source: 'nager', label: 'x' }],
    payloads: { [thisYear]: [{ date: `${thisYear}-12-24`, name: 'Christmas Eve' }], [nextYear]: [] },
  });
  const body = await (await s.call()).json();
  assert.deepEqual(body.skipped, [thisYear]);
  assert.equal(s.inserts.length, 0);
  assert.equal(s.fetched.some(f => f.url.includes(`/${thisYear}/PH`)), false);
});

test('holiday import does not duplicate a date the Super Admin already added by hand', async () => {
  const s = setup({
    existing: [{ day_date: `${thisYear}-06-12`, scope: 'global', source: 'manual', label: 'Mine' }],
    payloads: { [thisYear]: [{ date: `${thisYear}-06-12`, name: 'Independence Day' }, { date: `${thisYear}-08-21`, name: 'Ninoy Aquino Day' }], [nextYear]: [] },
  });
  await s.call();
  assert.deepEqual(s.inserts.map(r => r.day_date), [`${thisYear}-08-21`]);
});

test('holiday import reports a failed year and still processes the other', async () => {
  const s = setup({ payloads: { [thisYear]: new Error('timeout'), [nextYear]: [{ date: `${nextYear}-01-01`, name: "New Year's Day" }] } });
  const res = await s.call();
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { imported: { [nextYear]: 1 }, skipped: [], failed: [thisYear] });

  const s2 = setup({ payloads: { [thisYear]: [{ date: `${thisYear}-06-12`, name: 'Independence Day' }], [nextYear]: [] }, insertError: { message: 'db down' } });
  assert.deepEqual((await (await s2.call()).json()).failed, [thisYear]);
});

test('holiday import is wired into middleware and the scheduler', () => {
  const mw = fs.readFileSync(path.join(root, 'apps/web/middleware.ts'), 'utf8');
  assert.equal((mw.match(/\/api\/internal\/import-holidays/g) || []).length >= 2, true, 'in KNOWN_PATHS and the auth bypass');
  const cron = fs.readFileSync(path.resolve(root, '..', '.github/workflows/cron.yml'), 'utf8');
  assert.match(cron, /import-holidays/);
});
