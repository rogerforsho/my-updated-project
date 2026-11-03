// k6 baseline against the STAGING Vercel preview only. Run via scripts/loadtest/run.ps1 (or see README in that script).
// Scenarios: students clock in (selfie upload -> time-in) in an 8 AM style spike; supervisors read dashboards.
import http from 'k6/http';
import exec from 'k6/execution';
import encoding from 'k6/encoding';
import { check, sleep } from 'k6';
import { SharedArray } from 'k6/data';

const ALLOWED_HOST = 'my-updated-project-git-loop-integration-ojt-project.vercel.app';
const STAGING_REF = 'xlkvjuwzcviicerpzdjz';
const BASE_URL = __ENV.BASE_URL || `https://${ALLOWED_HOST}`;
const SUPABASE_URL = __ENV.SUPABASE_URL || '';
const ANON_KEY = __ENV.SUPABASE_ANON_KEY || '';
const SMOKE = __ENV.SMOKE === '1';
const BYPASS = __ENV.LOADTEST_BYPASS_SECRET || '';

// Sessions come from scripts/loadtest/login.mjs (Supabase Auth limits mass sign-ins per IP).
const sessionsFile = new SharedArray('sessions', () => [JSON.parse(open(__ENV.SESSIONS_FILE))]);
// Smallest bytes that pass the app's JPEG signature check (FF D8 FF ...).
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, 0xff, 0xd9]).buffer;

export const options = SMOKE
  ? { scenarios: { smoke: { executor: 'shared-iterations', vus: 3, iterations: 6, exec: 'clockIn' }, smokeReads: { executor: 'shared-iterations', vus: 2, iterations: 2, exec: 'supervisorReads' } } }
  : {
    scenarios: {
      // Each student clocks in once, arriving faster over time: 0 -> 5 -> 15/s, ~300 students total.
      clockin: {
        executor: 'ramping-arrival-rate', exec: 'clockIn', startRate: 1, timeUnit: '1s',
        preAllocatedVUs: 60, maxVUs: 300,
        stages: [{ duration: '2m', target: 3 }, { duration: '3m', target: 8 }, { duration: '3m', target: 12 }],
      },
      dashboards: {
        executor: 'ramping-vus', exec: 'supervisorReads', startVUs: 0,
        stages: [{ duration: '2m', target: 20 }, { duration: '3m', target: 60 }, { duration: '3m', target: 120 }],
      },
    },
    // Abort early so a broken app is not hammered for the full run.
    thresholds: {
      'http_req_failed{kind:app}': [{ threshold: 'rate<0.01', abortOnFail: true, delayAbortEval: '60s' }],
      'http_req_duration{kind:app}': ['p(95)<800', { threshold: 'p(95)<3000', abortOnFail: true, delayAbortEval: '60s' }],
    },
    setupTimeout: '10m',
    summaryTrendStats: ['avg', 'p(90)', 'p(95)', 'max'],
  };

export function setup() {
  const host = (BASE_URL.match(/^https:\/\/([^/:?#]+)\/?$/) || [])[1];
  if (host !== ALLOWED_HOST) exec.test.abort(`Refusing: ${host} is not the allowed staging preview.`);
  if (!SUPABASE_URL.includes(`${STAGING_REF}.supabase.co`) || !ANON_KEY) exec.test.abort('Refusing: SUPABASE_URL must be the staging project and SUPABASE_ANON_KEY set.');
  const sessions = sessionsFile[0];
  if (Date.now() - sessions.signedInAt > 50 * 60 * 1000) exec.test.abort('Sessions are older than 50 minutes; run login.mjs again.');
  const students = SMOKE ? sessions.students.slice(0, 5) : sessions.students;
  const supervisors = SMOKE ? sessions.supervisors.slice(0, 2) : sessions.supervisors;
  return { students: students.map((x) => x.access_token), supervisors: supervisors.map(sessionCookie) };
}

const appParams = (token, extra = {}) => ({
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(BYPASS ? { 'x-loadtest-bypass': BYPASS } : {}) },
  tags: { kind: 'app', ...extra },
});

export function clockIn(data) {
  // One unique student per iteration; extra iterations (more than accounts) become expected 409s.
  const token = data.students[exec.scenario.iterationInTest % data.students.length];

  const uploadId = `lt${exec.scenario.iterationInTest}x${Date.now()}`;
  const prep = http.post(`${BASE_URL}/api/mobile/attendance/selfie`, JSON.stringify({ type: 'time_in', upload_id: uploadId }), appParams(token, { step: 'selfie_prepare' }));
  if (!check(prep, { 'selfie prepared': (r) => r.status === 200 })) return;
  const { path, token: uploadToken } = prep.json('data');

  const up = http.put(`${SUPABASE_URL}/storage/v1/object/upload/sign/attendance-selfies/${path}?token=${uploadToken}`, JPEG,
    { headers: { 'Content-Type': 'image/jpeg', apikey: ANON_KEY }, tags: { kind: 'storage' } });
  if (!check(up, { 'selfie uploaded': (r) => r.status === 200 })) return;

  const me = http.get(`${SUPABASE_URL}/rest/v1/student_assignments?select=assignment_id&limit=1`,
    { headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}` }, tags: { kind: 'auth' } });
  const assignmentId = me.status === 200 && me.json().length ? me.json()[0].assignment_id : null;
  if (!check(assignmentId, { 'assignment found': (a) => a !== null })) return;

  const now = new Date();
  const manila = new Date(now.getTime() + 8 * 3600 * 1000).toISOString().slice(0, 10);
  const res = http.post(`${BASE_URL}/api/mobile/attendance`, JSON.stringify({
    action: 'time_in', assignment_id: assignmentId, attendance_date: manila, time_in: now.toISOString(),
    time_in_selfie_path: path, latitude: 14.7315, longitude: 121.1394,
  }), appParams(token, { step: 'time_in' }));
  check(res, { 'time-in recorded (200) or already recorded (409)': (r) => r.status === 200 || r.status === 409 });
}

function sessionCookie(session) {
  // @supabase/ssr cookie: "base64-" + base64url(session JSON), split into 3180-char chunks.
  const value = `base64-${encoding.b64encode(JSON.stringify(session), 'rawurl')}`;
  const name = `sb-${STAGING_REF}-auth-token`;
  const jar = {};
  if (value.length <= 3180) jar[name] = value;
  else for (let i = 0; i * 3180 < value.length; i += 1) jar[`${name}.${i}`] = value.slice(i * 3180, (i + 1) * 3180);
  return jar;
}

export function supervisorReads(data) {
  const supervisorJar = data.supervisors[exec.vu.idInTest % data.supervisors.length];
  for (const page of ['/supervisor/students', '/supervisor/attendance', '/supervisor/reports']) {
    const res = http.get(`${BASE_URL}${page}`, { cookies: supervisorJar, redirects: 0,
      headers: BYPASS ? { 'x-loadtest-bypass': BYPASS } : {}, tags: { kind: 'app', step: `page${page}` } });
    check(res, { [`${page} 200`]: (r) => r.status === 200 });
    sleep(2 + Math.random() * 3);
  }
}
