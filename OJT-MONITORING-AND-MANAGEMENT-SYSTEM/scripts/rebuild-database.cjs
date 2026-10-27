#!/usr/bin/env node
// Rebuilds the app schema from supabase/migrations and reloads app data from a backup,
// all in ONE transaction: any failed step or failed check rolls everything back.
//
//   rehearsal: node scripts/rebuild-database.cjs --mode rehearsal --backup D:\CDM-OJT-backup-2026-10-24
//     restores the backup into a throwaway Docker Postgres (port 57402), then rebuilds it.
//   production: REBUILD_DB_URL=<direct/pooler url> node scripts/rebuild-database.cjs \
//     --mode production --backup <dir> --project-ref <ref>
//     asks you to type the confirmation phrase; refuses if live data drifted from the backup.
//
// shortcut: the legacy tables (locations*, enable_rls_policies_version) are dropped, not
// migrated; auth.* and storage.* data are never touched in production mode.
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { spawnSync } = require('child_process');

const IMAGE = 'public.ecr.aws/supabase/postgres:17.6.1.147';
const CONTAINER = 'cdm-e2e';
const BASELINE_LAST = '20261019073834'; // newest migration production already recorded
const LEGACY = new Set(['enable_rls_policies_version', 'locations', 'location_types', 'location_location_types']);
const root = path.join(__dirname, '..');

const arg = (n) => { const i = process.argv.indexOf(`--${n}`); return i > -1 ? process.argv[i + 1] : undefined; };
const mode = arg('mode');
const backup = arg('backup');
if (!['rehearsal', 'production'].includes(mode) || !backup) {
  console.error('usage: --mode rehearsal|production --backup <dir> [--project-ref <ref>]');
  process.exit(2);
}
const read = (f) => fs.readFileSync(path.join(backup, f), 'utf8');

function runner() {
  if (mode === 'rehearsal') {
    return (sql, extra = []) => spawnSync('docker', ['exec', '-i', CONTAINER, 'psql', '-U', 'supabase_admin', '-d', 'postgres', '-X', '-q', '-v', 'ON_ERROR_STOP=1', ...extra], { input: sql, encoding: 'utf8', maxBuffer: 1 << 28 });
  }
  const url = process.env.REBUILD_DB_URL;
  if (!url) { console.error('REBUILD_DB_URL is required'); process.exit(2); }
  return (sql, extra = []) => spawnSync('docker', ['run', '--rm', '-i', IMAGE, 'psql', url, '-X', '-q', '-v', 'ON_ERROR_STOP=1', ...extra], { input: sql, encoding: 'utf8', maxBuffer: 1 << 28 });
}
const psql = runner();
const must = (r, what) => {
  if (r.status !== 0) { console.error(`FAILED: ${what}\n${(r.stderr || '').split('\n').filter(Boolean).slice(0, 12).join('\n')}`); process.exit(1); }
  return r.stdout;
};

// COPY blocks and sequence resets from a pg_dump data file, filtered by schema.
function dataBlocks(sql, schema) {
  const out = [];
  const lines = sql.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^COPY "(\w+)"\."(\w+)" /);
    if (m) {
      let j = i; while (lines[j] !== '\\.') j++;
      if (m[1] === schema && !(schema === 'public' && LEGACY.has(m[2]))) out.push(lines.slice(i, j + 1).join('\n'));
      i = j;
    } else if (lines[i].startsWith('SELECT pg_catalog.setval(\'"' + schema + '"."')) {
      if (![...LEGACY].some((t) => lines[i].includes(`"${t}`))) out.push(lines[i]);
    }
  }
  return out.join('\n');
}
function expectedCounts(sql, schema) {
  const c = {};
  const re = new RegExp(`^COPY "${schema}"\\."(\\w+)" [^\\n]*\\n([\\s\\S]*?)\\\\\\.$`, 'gm');
  for (const m of sql.matchAll(re)) c[m[1]] = m[2] ? m[2].split('\n').filter(Boolean).length : 0;
  return c;
}

const migrations = fs.readdirSync(path.join(root, 'supabase', 'migrations')).filter((f) => f.endsWith('.sql')).sort();
const version = (f) => f.split('_')[0];
const isBaseline = (f) => /^\d{3}$/.test(version(f)) || BigInt(version(f)) <= BigInt(BASELINE_LAST);
const mig = (f) => fs.readFileSync(path.join(root, 'supabase', 'migrations', f), 'utf8').replace(/^﻿/, '');

async function confirm() {
  const ref = arg('project-ref');
  const url = process.env.REBUILD_DB_URL;
  if (!ref || !url.includes(ref)) { console.error('--project-ref must be given and appear in REBUILD_DB_URL'); process.exit(2); }
  if (!process.stdin.isTTY) { console.error('production mode needs an interactive terminal'); process.exit(2); }
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const phrase = `REBUILD ${ref}`;
  const a = await new Promise((r) => rl.question(`This DROPS and recreates public/private on ${ref}. Type "${phrase}" to continue: `, r));
  rl.close();
  if (a.trim() !== phrase) { console.log('Aborted.'); process.exit(1); }
}

function rehearsalRestore() {
  spawnSync('docker', ['rm', '-f', CONTAINER], { encoding: 'utf8' });
  must(spawnSync('docker', ['run', '-d', '--name', CONTAINER, '-e', 'POSTGRES_PASSWORD=rehearsal', '-p', '127.0.0.1:57402:5432', IMAGE], { encoding: 'utf8' }), 'start container');
  for (let i = 0; i < 40; i++) {
    if (spawnSync('docker', ['exec', CONTAINER, 'pg_isready', '-U', 'postgres', '-h', 'localhost']).status === 0) break;
    spawnSync(process.execPath, ['-e', 'setTimeout(()=>{},3000)']);
  }
  const loose = (sql, what) => { const r = psql(sql, ['-v', 'ON_ERROR_STOP=0']); if (r.status !== 0) console.warn(`warn: ${what}: ${r.stderr.split('\n')[0]}`); };
  loose('drop schema auth cascade; drop schema storage cascade; drop schema if exists realtime cascade;', 'reset auth/storage');
  for (const f of ['roles', 'auth_schema', 'schema', 'storage_schema', 'history_schema', 'history_data']) loose(read(`${f}.sql`), f);
  // the dump orders auth triggers before the public functions they call; recreate them now
  const trg = read('auth_schema.sql').split('\n').filter((l) => l.startsWith('CREATE OR REPLACE TRIGGER') && l.includes('"auth"."users"'));
  loose(trg.join('\n'), 'auth triggers');
  loose('SET session_replication_role = replica;\n' + read('data.sql'), 'data');
}

function counts() {
  // prod state as the live database reports it, for the drift check and the final audit
  return must(psql(`select 'auth.users',count(*) from auth.users union all select 'public.users',count(*) from public.users union all select 'storage.objects',count(*) from storage.objects;`, ['-At']), 'read live counts')
    .trim().split('\n').map((l) => l.split('|'));
}

(async () => {
  const dataSql = read('data.sql');
  const want = { 'auth.users': expectedCounts(dataSql, 'auth').users, 'public.users': expectedCounts(dataSql, 'public').users, 'storage.objects': expectedCounts(dataSql, 'storage').objects };
  if (mode === 'production') await confirm(); else rehearsalRestore();

  const live = counts();
  const drift = live.filter(([k, v]) => String(want[k]) !== v);
  if (drift.length) { console.error('Live data differs from the backup (' + drift.map(([k, v]) => `${k}: live ${v}, backup ${want[k]}`).join('; ') + '). Take a new backup first.'); process.exit(1); }
  console.log('pre-check ok: live counts match the backup', Object.entries(want).map(([k, v]) => `${k}=${v}`).join(' '));

  const pub = expectedCounts(dataSql, 'public');
  const asserts = Object.entries(pub).filter(([t]) => !LEGACY.has(t)).map(([t, n]) => `  IF (SELECT count(*) FROM public."${t}") <> ${n} THEN RAISE EXCEPTION 'row count mismatch: public.${t} expected ${n}'; END IF;`).join('\n');
  const history = migrations.map((f) => {
    const tag = `m${version(f)}`;
    return `INSERT INTO supabase_migrations.schema_migrations(version, name, statements) VALUES ('${version(f)}', '${f.replace(/^[^_]+_/, '').replace(/\.sql$/, '')}', ARRAY[$${tag}$${mig(f)}$${tag}$]);`;
  }).join('\n');

  const script = [
    'BEGIN;',
    'SET LOCAL client_min_messages = warning;',
    // --- tear down the app schema; auth/storage rows are not touched
    `DO $$ BEGIN IF to_regclass('pgmq.q_transactional_emails') IS NOT NULL THEN PERFORM pgmq.drop_queue('transactional_emails'); END IF; END $$;`,
    'DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;',
    'DROP TRIGGER IF EXISTS on_auth_user_deleted ON auth.users;',
    'DROP TRIGGER IF EXISTS validate_new_student_registration ON auth.users;',
    `DO $$ DECLARE r record; BEGIN
       FOR r IN SELECT policyname FROM pg_policies WHERE schemaname='storage' AND tablename='objects' LOOP EXECUTE format('DROP POLICY %I ON storage.objects', r.policyname); END LOOP;
       FOR r IN SELECT c.relname, c.relkind FROM pg_class c WHERE c.relnamespace='public'::regnamespace AND c.relkind IN ('r','p','v','m','f')
                AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid=c.oid AND d.deptype='e') LOOP
         EXECUTE format('DROP %s IF EXISTS public.%I CASCADE', CASE r.relkind WHEN 'v' THEN 'VIEW' WHEN 'm' THEN 'MATERIALIZED VIEW' WHEN 'f' THEN 'FOREIGN TABLE' ELSE 'TABLE' END, r.relname);
       END LOOP;
       FOR r IN SELECT p.oid::regprocedure AS sig, p.prokind FROM pg_proc p WHERE p.pronamespace='public'::regnamespace
                AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid=p.oid AND d.deptype='e') LOOP
         EXECUTE format('DROP %s IF EXISTS %s CASCADE', CASE r.prokind WHEN 'a' THEN 'AGGREGATE' WHEN 'p' THEN 'PROCEDURE' ELSE 'FUNCTION' END, r.sig);
       END LOOP;
       FOR r IN SELECT t.typname FROM pg_type t WHERE t.typnamespace='public'::regnamespace AND t.typtype IN ('e','d')
                AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid=t.oid AND d.deptype='e') LOOP
         EXECUTE format('DROP TYPE IF EXISTS public.%I CASCADE', r.typname);
       END LOOP;
     END $$;`,
    'DROP SCHEMA IF EXISTS private CASCADE;',
    'DROP SCHEMA IF EXISTS supabase_migrations CASCADE;',
    // --- baseline migrations, app data, then the newer migrations (their backfills need the data)
    ...migrations.filter(isBaseline).map(mig),
    'SET LOCAL session_replication_role = replica;',
    dataBlocks(dataSql, 'public'),
    'SET LOCAL session_replication_role = origin;',
    ...migrations.filter((f) => !isBaseline(f)).map(mig),
    'SET LOCAL session_replication_role = replica;',
    dataBlocks(dataSql, 'pgmq'),
    'SET LOCAL session_replication_role = origin;',
    // --- migration history (CLI format) so `supabase db push` sees everything as applied
    'CREATE SCHEMA supabase_migrations;',
    read('history_schema.sql').replace(/CREATE SCHEMA IF NOT EXISTS "supabase_migrations";/, ''),
    history,
    // --- audit; any failure aborts and rolls back the whole rebuild
    `DO $$ BEGIN
  IF (SELECT count(*) FROM auth.users) <> ${want['auth.users']} THEN RAISE EXCEPTION 'auth.users changed'; END IF;
  IF (SELECT count(*) FROM storage.objects) <> ${want['storage.objects']} THEN RAISE EXCEPTION 'storage.objects changed'; END IF;
${asserts}
  IF EXISTS (SELECT 1 FROM public.student_assignments WHERE branch_id IS NULL) THEN RAISE EXCEPTION 'assignment without branch'; END IF;
  IF (SELECT count(*) FROM supabase_migrations.schema_migrations) <> ${migrations.length} THEN RAISE EXCEPTION 'migration history incomplete'; END IF;
END $$;`,
    'COMMIT;',
  ].join('\n');

  const out = psql(script);
  if (out.status !== 0) { console.error('REBUILD FAILED and was rolled back (database unchanged by this run).\n' + out.stderr.split('\n').filter(Boolean).slice(0, 15).join('\n')); process.exit(1); }
  console.log(`rebuild committed: ${migrations.length} migrations, ${Object.keys(pub).length - LEGACY.size} app tables verified against the backup`);
  console.log('live counts now:', counts().map(([k, v]) => `${k}=${v}`).join(' '));
})();
