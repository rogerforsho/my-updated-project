// Runs the test suite in two phases. Unlike an && chain, a failure in one phase
// never stops the other from running, so a red unit test cannot hide the database checks.
// Usage: run-tests.mjs [unit|db]   (no argument runs both)
import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const scripts = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(scripts, '..');
const only = process.argv[2];

const run = (args) => spawnSync(process.execPath, args, { cwd: root, stdio: 'inherit' }).status === 0;

const failed = [];

if (only !== 'db') {
  // Listed from disk, so a new scripts/*.test.{cjs,mjs} file needs no edit here.
  const tests = readdirSync(scripts).filter((f) => /\.test\.[cm]js$/.test(f)).sort();
  if (!run(['--test', ...tests.map((f) => path.join('scripts', f))])) failed.push('unit tests');
}

if (only !== 'unit') {
  const checks = readdirSync(scripts).filter((f) => f.startsWith('check-') && f.endsWith('.cjs')).sort();
  for (const file of checks) {
    if (!run([path.join('scripts', file)])) failed.push(file);
  }
}

if (failed.length) {
  console.error(`\n${failed.length} failed:\n${failed.map((f) => `  ${f}`).join('\n')}`);
  process.exit(1);
}
console.log('\nall checks passed');
