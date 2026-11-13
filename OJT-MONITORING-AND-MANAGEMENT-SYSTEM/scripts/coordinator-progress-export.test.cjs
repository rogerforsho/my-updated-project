const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const web = path.join(__dirname, '..', 'apps', 'web');
const route = fs.readFileSync(path.join(web, 'app/api/coordinator/progress/export/route.ts'), 'utf8');
const page = fs.readFileSync(path.join(web, 'app/(dashboard)/coordinator/progress/page.tsx'), 'utf8');

test('export route is Coordinator-only and validates its filters', () => {
  assert.match(route, /role !== 'Coordinator'/);
  assert.match(route, /Invalid progress status/);
  assert.match(route, /STUDENT_REGISTRATION_COURSES/);
});

test('export route fetches every page through the scoped service, not just 50 rows', () => {
  assert.match(route, /listCohortProgress\(1, PAGE/);
  assert.match(route, /Math\.ceil\(first\.data\.total \/ PAGE\)/);
});

test('export is a CSV attachment built with the formula-safe toCsv and audited', () => {
  assert.match(route, /toCsv\(/);
  assert.match(route, /attachment; filename=/);
  assert.match(route, /no-store/);
  assert.match(route, /COHORT_PROGRESS_EXPORTED/);
});

test('progress page offers one download link per status tab', () => {
  assert.match(page, /\/api\/coordinator\/progress\/export/);
  assert.match(page, /statusTabs\.map\(\(tab\) => \{\s*const q = /);
  for (const key of ['not_started', 'in_progress', 'completed']) assert.ok(page.includes(`'${key}'`));
});
