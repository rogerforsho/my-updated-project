// Creates one Super Admin, one Coordinator and one Supervisor in the LOCAL Supabase only.
// Run: node --env-file=apps/web/.env.local scripts/seed-local-accounts.mjs
import { randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in apps/web/.env.local.');
  process.exit(2);
}
if (!['127.0.0.1', 'localhost'].includes(new URL(url).hostname)) {
  console.error(`Refusing to run: ${url} is not a local Supabase.`);
  process.exit(2);
}

const password = 'LocalTest#2026';
// 1x1 PNG; the Auth guard wants ID-card paths even for staff, and the objects are removed afterwards.
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const accounts = [
  { slug: 'admin', role: 'Admin', name: 'Local Super Admin' },
  { slug: 'coordinator', role: 'Coordinator', name: 'Local Coordinator' },
  { slug: 'supervisor', role: 'Supervisor', name: 'Local Supervisor' },
].map((a) => {
  // The guard only accepts id-cards/<10-16 digits>_<24 hex>_front|back.png.
  const id = `${String(randomBytes(6).readUIntBE(0, 6) % 1_000_000_000_000).padStart(12, '0')}_${randomBytes(12).toString('hex')}`;
  return { ...a, email: `${a.slug}@local.test`, front: `id-cards/${id}_front.png`, back: `id-cards/${id}_back.png` };
});

const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
const ok = (label, { data, error }) => {
  if (error) throw new Error(`${label}: ${error.message}`);
  return data;
};

const { users: existing } = ok('List users', await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 }));
const taken = accounts.filter((a) => existing.some((u) => u.email?.toLowerCase() === a.email));
if (taken.length) {
  console.error(`Already exist, nothing changed: ${taken.map((a) => a.email).join(', ')}`);
  process.exit(1);
}

const made = {};
for (const a of accounts) {
  for (const path of [a.front, a.back]) {
    ok(`Upload ${path}`, await supabase.storage.from('private-documents').upload(path, png, { contentType: 'image/png', upsert: true }));
  }
  const { user } = ok(`Create ${a.email}`, await supabase.auth.admin.createUser({
    email: a.email,
    password,
    email_confirm: true,
    user_metadata: { full_name: a.name, course: 'BSIT', year_level: 4, id_card_path: a.front, id_card_front_path: a.front, id_card_back_path: a.back },
  }));
  made[a.slug] = user.id;
  ok(`Set role ${a.role}`, await supabase.auth.admin.updateUserById(user.id, { app_metadata: { ...user.app_metadata, role: a.role } }));
  ok(`Activate ${a.email}`, await supabase.from('users').update({ role: a.role, account_status: 'active' }).eq('user_id', user.id));
  // The signup trigger makes a temporary Student row; staff must not keep it.
  ok(`Drop student row ${a.email}`, await supabase.from('students').delete().eq('user_id', user.id));
}
await supabase.storage.from('private-documents').remove(accounts.flatMap((a) => [a.front, a.back]));

ok('Admin profile', await supabase.from('admins').insert({ user_id: made.admin }));
ok('Coordinator profile', await supabase.from('coordinators').insert({ user_id: made.coordinator, department: 'ICS & IBE' }));
ok('Coordinator grants', await supabase.from('staff_capability_grants').insert(
  ['ICS', 'IBE'].flatMap((department_scope) =>
    ['academic_workflows', 'department_reports', 'department_announcements'].map((capability) => ({ user_id: made.coordinator, capability, department_scope }))),
));
const company = ok('Company', await supabase.from('companies').insert({
  company_name: 'Local Test Company',
  address: 'Local test address, Rodriguez, Rizal',
  contact_person: 'Local Supervisor',
  contact_email: 'supervisor@local.test',
  contact_number: '0000000000',
  status: 'active',
  latitude: 14.7315,
  longitude: 121.1394,
  geofence_radius_meters: 50,
  geofence_enabled: false,
}).select('company_id').single());
ok('Supervisor profile', await supabase.from('supervisors').insert({ user_id: made.supervisor, company_id: company.company_id, position: 'Local Test Supervisor' }));

console.log('Created local accounts (password for all: ' + password + '):');
for (const a of accounts) console.log(`  ${a.role.padEnd(11)} ${a.email}`);
