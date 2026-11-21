// Creates three OJT student test accounts (ICS, IBE, ICS) in the LOCAL Supabase only, left pending like a real registration.
// Run: node --env-file=apps/web/.env.local scripts/seed-local-students.mjs
import { randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.'); process.exit(2); }
if (!['127.0.0.1', 'localhost'].includes(new URL(url).hostname)) { console.error(`Refusing to run: ${url} is not a local Supabase.`); process.exit(2); }

const password = 'LocalTest#2026';
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const students = [
  { slug: 'student-ics', name: 'Local Student ICS', course: 'BSIT', number: '2026-90001' },
  { slug: 'student-ibe', name: 'Local Student IBE', course: 'BSBA-HRM', number: '2026-90002' },
  { slug: 'student-ics2', name: 'Local Student ICS Two', course: 'BS-CPE', number: '2026-90003' },
];

const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
const ok = (label, { data, error }) => { if (error) throw new Error(`${label}: ${error.message}`); return data; };

const { users } = ok('List users', await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 }));
const taken = students.filter((s) => users.some((u) => u.email === `${s.slug}@local.test`));
if (taken.length) { console.error(`Already exist, nothing changed: ${taken.map((s) => s.slug + '@local.test').join(', ')}`); process.exit(1); }

for (const s of students) {
  // Same path shape the Auth guard accepts (see seed-local-accounts.mjs).
  const id = `${String(randomBytes(6).readUIntBE(0, 6) % 1_000_000_000_000).padStart(12, '0')}_${randomBytes(12).toString('hex')}`;
  const front = `id-cards/${id}_front.png`;
  const back = `id-cards/${id}_back.png`;
  for (const path of [front, back]) ok(`Upload ${path}`, await supabase.storage.from('private-documents').upload(path, png, { contentType: 'image/png', upsert: true }));
  ok(`Create ${s.slug}`, await supabase.auth.admin.createUser({
    email: `${s.slug}@local.test`, password, email_confirm: true,
    user_metadata: { full_name: s.name, role: 'Student', student_number: s.number, course: s.course, year_level: 4, id_card_path: front, id_card_front_path: front, id_card_back_path: back },
  }));
}
console.log(`Created (password ${password}): ${students.map((s) => s.slug + '@local.test').join(', ')}`);
