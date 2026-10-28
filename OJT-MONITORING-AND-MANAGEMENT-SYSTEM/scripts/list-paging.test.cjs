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
const { rangeText, pageItems, PAGE_SIZES } = mod;

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
