const test = require('node:test');
const assert = require('node:assert/strict');

async function build(rows, extra = {}) {
  const { buildTablePdf } = await import('../apps/web/src/lib/simple-pdf.ts');
  return Buffer.from(buildTablePdf({ title: 'Attendance', subtitle: 'All dates', head: ['Student', 'Date', 'Hours'], rows, ...extra })).toString('latin1');
}

test('a small table is one valid page with a correct xref offset', async () => {
  const pdf = await build([['Ana Cruz', '2026-11-02', '8']]);
  assert.ok(pdf.startsWith('%PDF-1.4'));
  assert.ok(pdf.endsWith('%%EOF'));
  assert.match(pdf, /\/Count 1 /);
  const startxref = Number(pdf.match(/startxref\n(\d+)\n/)[1]);
  assert.equal(pdf.slice(startxref, startxref + 4), 'xref');
});

test('a thousand rows paginate and every object offset points at its object', async () => {
  const rows = Array.from({ length: 1000 }, (_, i) => [`Trainee ${i}`, '2026-11-02', '8']);
  const pdf = await build(rows);
  const pages = Number(pdf.match(/\/Count (\d+) /)[1]);
  assert.ok(pages > 20, `expected many pages, got ${pages}`);
  assert.ok(pdf.includes(`Page ${pages} of ${pages}`));
  const table = pdf.slice(pdf.indexOf('xref\n'));
  const offsets = [...table.matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]));
  offsets.forEach((offset, i) => assert.ok(pdf.slice(offset).startsWith(`${i + 1} 0 obj`), `object ${i + 1} offset is wrong`));
});

test('parentheses, backslashes and non-Latin-1 text cannot break the content stream', async () => {
  const pdf = await build([['Ana (Jr.) \\ Reyes 中', '=1+1', '8']]);
  assert.ok(pdf.includes('Ana \\(Jr.\\) \\\\ Reyes ?'));
});

test('no rows still produces a valid one-page document with the header', async () => {
  const pdf = await build([]);
  assert.match(pdf, /\/Count 1 /);
  assert.ok(pdf.includes('(Student)'));
});
