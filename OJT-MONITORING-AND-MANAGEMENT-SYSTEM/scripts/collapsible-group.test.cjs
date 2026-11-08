const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (p) => fs.readFileSync(path.resolve(__dirname, '..', p), 'utf8');
const pages = ['students', 'assignments', 'submissions'].map((n) => [n, read(`apps/web/app/(dashboard)/coordinator/${n}/page.tsx`)]);

test('a search never makes a group header unclickable', () => {
  for (const [n, src] of pages) assert.ok(!/open=\{!!\w+ \|\|/.test(src), `${n} forces groups open`);
  assert.match(read('apps/web/src/components/ui/CollapsibleGroup.tsx'), /search \? !searchFolded\[id\]/);
});

test('each group steps back a page when its last page empties', () => {
  assert.match(read('apps/web/src/components/ui/ListControls.tsx'), /outOfRangePage\(page, pageSize, t\);\s+if \(back\) \{ setPage\(back\)/);
  for (const [n, src] of pages) assert.match(src, /usePagedList</, n);
});

test('header counts and rows share one search filter and one Unspecified label', () => {
  const acc = read('apps/web/src/services/auth/account-review.ts');
  assert.equal((acc.match(/applyStudentSearch\(/g) || []).length, 3); // definition + groups + rows
  assert.ok(acc.includes("|| 'Unspecified'") && acc.includes("course === 'Unspecified'"));
  const asg = read('apps/web/src/services/assignments.ts');
  assert.equal((asg.match(/applyAssignmentSearch\(/g) || []).length, 3);
});
