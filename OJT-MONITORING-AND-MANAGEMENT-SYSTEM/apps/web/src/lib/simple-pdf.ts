// A small table-to-PDF writer: landscape A4, Helvetica, a header row repeated on every page, "Page n of N" footer.
// shortcut: Latin-1 text only (other characters print as "?") and cells are cut to fit their column;
// upgrade to a real PDF library if exports ever need other scripts, images or wrapping.

const PAGE_W = 842;
const PAGE_H = 595;
const MARGIN = 36;
const FONT = 8;
const ROW_H = 15;
const HEAD_BLOCK = 46; // title + subtitle above the table

/** Latin-1 only, with the characters PDF strings treat specially escaped. */
function pdfText(value: unknown): string {
  return String(value ?? '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, '?')
    .replace(/[\\()]/g, (c) => `\\${c}`);
}

/** Average Helvetica glyph is about half the font size wide; cut text so it stays inside its column. */
function fit(value: unknown, width: number): string {
  const text = String(value ?? '').replace(/[\r\n\t]+/g, ' ');
  const max = Math.max(1, Math.floor((width - 6) / (FONT * 0.52)));
  return text.length > max ? text.slice(0, max) : text;
}

export interface PdfTable {
  title: string;
  subtitle?: string;
  head: string[];
  rows: unknown[][];
  /** Relative column widths, same length as head. Defaults to equal columns. */
  weights?: number[];
}

export function buildTablePdf({ title, subtitle = '', head, rows, weights }: PdfTable): Uint8Array {
  const usable = PAGE_W - MARGIN * 2;
  const w = weights && weights.length === head.length ? weights : head.map(() => 1);
  const sum = w.reduce((a, b) => a + b, 0);
  const cols = w.map((x) => (x / sum) * usable);
  const x0 = cols.reduce<number[]>((acc, c, i) => { acc.push(i === 0 ? MARGIN : acc[i - 1] + cols[i - 1]); return acc; }, []);

  const perFirst = Math.max(1, Math.floor((PAGE_H - MARGIN * 2 - HEAD_BLOCK - ROW_H) / ROW_H));
  const perRest = Math.max(1, Math.floor((PAGE_H - MARGIN * 2 - ROW_H - 12) / ROW_H));
  const chunks: unknown[][][] = [];
  let i = 0;
  do {
    const size = chunks.length === 0 ? perFirst : perRest;
    chunks.push(rows.slice(i, i + size));
    i += size;
  } while (i < rows.length);

  const streams = chunks.map((chunk, pageIndex) => {
    const out: string[] = [];
    let y = PAGE_H - MARGIN;
    if (pageIndex === 0) {
      out.push(`BT /F2 14 Tf ${MARGIN} ${y - 12} Td (${pdfText(title)}) Tj ET`);
      if (subtitle) out.push(`BT /F1 9 Tf ${MARGIN} ${y - 28} Td (${pdfText(subtitle)}) Tj ET`);
      y -= HEAD_BLOCK;
    }
    // header band
    out.push(`0.93 0.95 0.92 rg ${MARGIN} ${y - ROW_H + 3} ${usable} ${ROW_H} re f 0 g`);
    head.forEach((h, c) => out.push(`BT /F2 ${FONT} Tf ${x0[c] + 3} ${y - ROW_H + 7} Td (${pdfText(fit(h, cols[c]))}) Tj ET`));
    y -= ROW_H;
    chunk.forEach((row, r) => {
      if (r % 2 === 1) out.push(`0.98 0.98 0.97 rg ${MARGIN} ${y - ROW_H + 3} ${usable} ${ROW_H} re f 0 g`);
      row.forEach((cell, c) => out.push(`BT /F1 ${FONT} Tf ${x0[c] + 3} ${y - ROW_H + 7} Td (${pdfText(fit(cell, cols[c]))}) Tj ET`));
      y -= ROW_H;
    });
    out.push(`BT /F1 7 Tf ${PAGE_W - MARGIN - 60} ${MARGIN - 18} Td (Page ${pageIndex + 1} of ${chunks.length}) Tj ET`);
    return out.join('\n');
  });

  // Objects: 1 catalog, 2 pages, 3 regular font, 4 bold font, then (page, content) pairs.
  const objects: string[] = [];
  const pageIds = chunks.map((_, n) => 5 + n * 2);
  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[2] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${chunks.length} >>`;
  objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
  objects[4] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>';
  streams.forEach((s, n) => {
    objects[5 + n * 2] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${6 + n * 2} 0 R >>`;
    objects[6 + n * 2] = `<< /Length ${s.length} >>\nstream\n${s}\nendstream`;
  });

  let body = '%PDF-1.4\n';
  const offsets: number[] = [];
  for (let id = 1; id < objects.length; id++) {
    offsets[id] = body.length;
    body += `${id} 0 obj\n${objects[id]}\nendobj\n`;
  }
  const xref = body.length;
  body += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let id = 1; id < objects.length; id++) body += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`;
  body += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;

  // Every character is Latin-1 by construction, so one byte per character keeps the offsets right.
  const bytes = new Uint8Array(body.length);
  for (let k = 0; k < body.length; k++) bytes[k] = body.charCodeAt(k) & 0xff;
  return bytes;
}
