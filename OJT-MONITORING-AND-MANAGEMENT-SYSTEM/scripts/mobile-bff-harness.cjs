// Loads the real mobile-bff module with its adapters (Supabase client, rate limiter) faked,
// so route tests exercise the real preamble instead of mocking it away.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const webSrc = path.resolve(__dirname, '../apps/web/src');

function loadTs(file, mocks) {
  const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  vm.runInNewContext(js, {
    exports, Response, Request, TextDecoder, Uint8Array,
    process: { env: { SUPABASE_URL: 'https://x.test', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon' } },
    require(name) {
      if (Object.hasOwn(mocks, name)) return mocks[name];
      if (name === '@/src/lib/read-limited-json') return loadTs(path.join(webSrc, 'lib/read-limited-json.ts'), mocks);
      throw new Error(`unmocked import ${name}`);
    },
  });
  return exports;
}

/**
 * actor: { user, studentId, supabase, role, status } describes who the bearer token resolves to;
 * null means the token is rejected. limit: what authActionLimit returns ({code,message} or null).
 */
function mobileBffFor(actor, { limit = null, onLimit } = {}) {
  const result = (data, error = null) => Promise.resolve({ data, error });
  const chain = (row) => ({ select: () => ({ eq: () => ({ maybeSingle: () => result(row) }) }) });
  const client = actor && Object.assign(Object.create(actor.supabase ?? {}), {
    auth: { getUser: () => result({ user: actor.user }, null) },
    from(table) {
      if (table === 'users') return chain({ role: actor.role ?? 'Student', account_status: actor.status ?? 'active' });
      if (table === 'students') return chain(actor.studentId ? { student_id: actor.studentId } : null);
      return actor.supabase.from(table);
    },
  });
  return loadTs(path.join(webSrc, 'lib/mobile-bff.ts'), {
    'server-only': {},
    '@supabase/supabase-js': {
      createClient: () => client ?? { auth: { getUser: () => result({ user: null }, new Error('bad token')) } },
    },
    '@/src/services/auth/internal': {
      async authActionLimit(...args) { onLimit?.(...args); return limit; },
    },
  });
}

/** Same as mobileBffFor, but adds a bearer header when a route test's request has none (the actor is fixed anyway). */
function mobileBffMock(actor, options) {
  const bff = mobileBffFor(actor, options);
  const bearer = (request) => {
    if (request.headers.get('authorization')) return request;
    const headers = new Headers(request.headers);
    headers.set('authorization', 'Bearer test');
    return new Request(request, { headers, duplex: 'half' });
  };
  return {
    ...bff,
    authenticateMobileStudent: (request, status) => bff.authenticateMobileStudent(bearer(request), status),
    mobileBffPreamble: (request, opts) => bff.mobileBffPreamble(bearer(request), opts),
  };
}

module.exports = { mobileBffFor, mobileBffMock };
