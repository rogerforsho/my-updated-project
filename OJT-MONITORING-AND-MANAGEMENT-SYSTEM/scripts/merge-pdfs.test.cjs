const test = require('node:test');
const assert = require('node:assert/strict');
const { PDFDocument } = require('pdf-lib');

async function pdfWithPages(count) {
  const doc = await PDFDocument.create();
  for (let i = 0; i < count; i++) doc.addPage();
  return doc.save();
}

test('merged PDF is a cover page followed by every journal in the given order', async () => {
  const { mergePdfs } = await import('../apps/web/src/lib/mergePdfs.ts');
  const result = await mergePdfs({ title: 'Compiled Weekly Journals', details: ['Student: Ana Cruz'] }, [
    { name: 'Week 1', bytes: await pdfWithPages(1) },
    { name: 'Week 2', bytes: await pdfWithPages(3) },
  ]);
  assert.equal(result.pageCount, 1 + 1 + 3);
  assert.deepEqual(result.included, ['Week 1', 'Week 2']);
  assert.deepEqual(result.skipped, []);
  assert.equal((await PDFDocument.load(result.bytes)).getPageCount(), 5);
});

test('an unreadable file is skipped and reported, and the rest still merge', async () => {
  const { mergePdfs } = await import('../apps/web/src/lib/mergePdfs.ts');
  const result = await mergePdfs({ title: 'Compiled', details: [] }, [
    { name: 'Good', bytes: await pdfWithPages(2) },
    { name: 'Corrupt', bytes: new TextEncoder().encode('this is not a pdf') },
  ]);
  assert.deepEqual(result.included, ['Good']);
  assert.deepEqual(result.skipped, ['Corrupt']);
  assert.equal(result.pageCount, 3);
});

test('names outside Latin-1 do not crash the cover page', async () => {
  const { mergePdfs } = await import('../apps/web/src/lib/mergePdfs.ts');
  const result = await mergePdfs({ title: 'Compiled', details: ['Student: 王小明'] }, [{ name: 'Linggo 1 — 週', bytes: await pdfWithPages(1) }]);
  assert.equal(result.included.length, 1);
});
