// Signs the load-test accounts in slowly (Supabase Auth limits sign-ins per IP) and saves their sessions for k6.
// Usage: node --env-file=apps/web/.env.staging.local scripts/loadtest/login.mjs <accounts.json> [students=300] [supervisors=50]
// Sessions last about an hour: run the k6 test right after this finishes. Delete the output file afterwards.
import { readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const STAGING_REF = 'xlkvjuwzcviicerpzdjz';
const url = process.env.SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url?.includes(`${STAGING_REF}.supabase.co`) || !anon) { console.error('Refusing: staging env missing.'); process.exit(2); }

const [accountsFile, s = '300', v = '50'] = process.argv.slice(2);
const { password, emails } = JSON.parse(await readFile(accountsFile, 'utf8'));
const students = emails.slice(0, Number(s));
const supervisors = Array.from({ length: Number(v) }, (_, i) => `sup${String(i + 1).padStart(4, '0')}@loadtest.local`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function signIn(email) {
  for (;;) {
    let res;
    try {
      res = await fetch(`${url}/auth/v1/token?grant_type=password`, {
        method: 'POST', headers: { apikey: anon, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }),
      });
    } catch (e) {
      console.log(`  network error (${e.cause?.code || e.message}), retrying in 30 s`);
      await sleep(30_000);
      continue;
    }
    if (res.status === 200) return res.json();
    if (res.status !== 429) throw new Error(`Sign-in ${email} failed: HTTP ${res.status}`);
    console.log('  rate limited, waiting 60 s');
    await sleep(60_000);
  }
}

const out = { students: [], supervisors: [], signedInAt: Date.now() };
let n = 0;
for (const [list, key] of [[students, 'students'], [supervisors, 'supervisors']]) {
  for (const email of list) {
    out[key].push(await signIn(email));
    n += 1;
    if (n % 25 === 0) console.log(`  ${n}/${students.length + supervisors.length}`);
    await sleep(6_000); // about 50 per 5 minutes
  }
}
const file = join(tmpdir(), `loadtest-sessions-${Date.now()}.json`);
await writeFile(file, JSON.stringify(out), { flag: 'wx' });
console.log(`Done. Sessions file (valid about 1 hour; delete after testing): ${file}`);
