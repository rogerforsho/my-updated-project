const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const file = path.resolve(__dirname, '../apps/web/src/lib/paging.ts');
const mod = {};
vm.runInNewContext(
  ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText,
  { exports: mod },
);
const { rangeText, pageItems, PAGE_SIZES, outOfRangePage } = mod;

test('range text shows the visible slice of the total', () => {
  assert.equal(rangeText(1, 10, 432), 'Showing 1–10 of 432 results');
  assert.equal(rangeText(44, 10, 432), 'Showing 431–432 of 432 results');
  assert.equal(rangeText(1, 25, 0), 'No results');
});

test('page buttons collapse long ranges with ellipsis', () => {
  assert.equal(JSON.stringify(pageItems(1, 3)), JSON.stringify([1, 2, 3]));
  assert.equal(JSON.stringify(pageItems(5, 22)), JSON.stringify([1, '…', 4, 5, 6, '…', 22]));
  assert.equal(JSON.stringify(pageItems(1, 22)), JSON.stringify([1, 2, '…', 22]));
});

test('rows-per-page options are the agreed set', () => {
  assert.deepEqual([...PAGE_SIZES], [10, 25, 50, 100]);
});

test('row menu is keyboard and screen-reader reachable', () => {
  const src = fs.readFileSync(path.resolve(__dirname, '../apps/web/src/components/ui/RowMenu.tsx'), 'utf8');
  for (const needle of ['aria-label={label}', 'aria-haspopup="menu"', "'Escape'", "'ArrowDown'", 'role="menuitem"']) {
    assert.ok(src.includes(needle), needle);
  }
});

test('a page past the end steps back to the last page; in-range and empty lists stay put', () => {
  assert.equal(outOfRangePage(3, 10, 21), null);
  assert.equal(outOfRangePage(3, 10, 20), 2);
  assert.equal(outOfRangePage(5, 25, 26), 2);
  assert.equal(outOfRangePage(1, 10, 0), null);
  assert.equal(outOfRangePage(2, 10, 0), null);
});

test('paged-list hook ignores stale responses and is used by the coordinator pages', () => {
  const read = (f) => fs.readFileSync(path.resolve(__dirname, '../apps/web', f), 'utf8');
  const hook = read('src/components/ui/ListControls.tsx');
  assert.ok(/usePagedList/.test(hook) && /active = false/.test(hook) && /outOfRangePage/.test(hook));
  for (const p of ['students', 'submissions', 'assignments']) {
    const src = read(`app/(dashboard)/coordinator/${p}/page.tsx`);
    assert.ok(src.includes('usePagedList<'), p);
    assert.ok(!src.includes('Math.ceil(t / pageSize)'), p + ' still has its own clamp');
  }
});
