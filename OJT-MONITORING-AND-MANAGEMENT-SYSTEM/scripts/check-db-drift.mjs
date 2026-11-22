// Fails if a Supabase project is missing a migration from supabase/migrations, or has one the repo lacks.
// Read-only: one SELECT per project through the CLI login, and it never changes `supabase link`.
// Run: node scripts/check-db-drift.mjs   (needs `supabase login` or SUPABASE_ACCESS_TOKEN)
// Does not compare Auth/Storage settings or data; use `supabase config diff --project-ref <ref>` for settings.
import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const PROJECTS = [
  ['CDM-OJT-Staging', 'xlkvjuwzcviicerpzdjz'],
  ['CDM-OJT (production)', 'jhslfwczxkdhexjgssjr'],
];
const dir = fileURLToPath(new URL('../supabase/migrations/', import.meta.url));
const local = new Set(readdirSync(dir).filter((f) => f.endsWith('.sql')).map((f) => f.split('_')[0]));

let failed = false;
for (const [name, ref] of PROJECTS) {
  const r = spawnSync(
    'npx',
    ['supabase', 'db', 'query', '--linked', '--project-ref', ref, '-o', 'json',
      '"select version from supabase_migrations.schema_migrations"'],
    { encoding: 'utf8', shell: true },
  );
  const out = r.stdout ?? '';
  let rows;
  try {
    rows = JSON.parse(out.slice(out.indexOf('{'))).rows;
  } catch {
    console.error(`FAIL ${name}: could not read migrations.\n${out}${r.stderr ?? ''}`);
    failed = true;
    continue;
  }
  const remote = new Set(rows.map((x) => x.version));
  const pending = [...local].filter((v) => !remote.has(v)).sort();
  const unknown = [...remote].filter((v) => !local.has(v)).sort();
  if (pending.length || unknown.length) {
    failed = true;
    console.error(`FAIL ${name}: ${pending.length} pending, ${unknown.length} not in repo`);
    if (pending.length) console.error(`  pending (apply with db push): ${pending.join(', ')}`);
    if (unknown.length) console.error(`  applied but missing from repo: ${unknown.join(', ')}`);
  } else {
    console.log(`OK   ${name}: ${remote.size} migrations, matches the repo`);
  }
}
process.exit(failed ? 1 : 0);
