// Live smoke test for the demo. Usage: node scripts/demo-smoke.cjs [baseUrl]  (default http://localhost:3000)
// Needs a running web app (npm run dev:web or the deployed URL). Read-only: GETs and one unauthenticated POST.
const base = (process.argv[2] || process.env.DEMO_URL || 'http://localhost:3000').replace(/\/$/, '');

const checks = [
  ['liveness /health', '/health', { status: 200 }],
  ['readiness /ready (DB + storage)', '/ready', { status: 200 }],
  ['landing page', '/', { status: 200, text: 'OJT' }],
  ['sign-in page', '/auth/sign-in', { status: 200 }],
  ['register page', '/auth/register', { status: 200 }],
  ['dashboard redirects anonymous to sign-in', '/dashboard', { status: 307, location: '/auth/sign-in' }],
  ['unknown URL is a real 404', '/no-such-page-demo', { status: 404 }],
  ['mobile API rejects anonymous (not 500)', '/api/mobile/attendance', { method: 'POST', status: [401, 403] }],
];

(async () => {
  let failed = 0;
  for (const [name, path, want] of checks) {
    try {
      const res = await fetch(base + path, { method: want.method || 'GET', redirect: 'manual', signal: AbortSignal.timeout(15000) });
      const body = want.text ? await res.text() : '';
      const okStatus = [].concat(want.status).includes(res.status);
      const okLoc = !want.location || (res.headers.get('location') || '').includes(want.location);
      const okText = !want.text || body.includes(want.text);
      if (okStatus && okLoc && okText) console.log('PASS', name);
      else { failed++; console.log('FAIL', name, '-> got', res.status, res.headers.get('location') || ''); }
    } catch (e) { failed++; console.log('FAIL', name, '->', e.message); }
  }
  console.log(failed ? `\n${failed} demo check(s) FAILED against ${base}` : `\nAll demo checks passed against ${base}`);
  process.exit(failed ? 1 : 0);
})();
