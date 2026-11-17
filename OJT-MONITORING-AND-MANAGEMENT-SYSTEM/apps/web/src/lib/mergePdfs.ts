import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

export interface MergeSource {
  /** Shown on the cover page and in the "not included" list. */
  name: string;
  bytes: Uint8Array;
}

export interface MergeResult {
  bytes: Uint8Array;
  pageCount: number;
  included: string[];
  /** Files pdf-lib could not read (corrupt, or password protected). */
  skipped: string[];
}

// shortcut: Helvetica is WinAnsi only, so other characters become "?" on the cover; embed a Unicode font if names need it.
const latin1 = (text: string) => text.replace(/[^\x20-\x7E\xA0-\xFF]/g, '?');
const MAX_LISTED = 40;

/** One cover page, then every source's pages in the order given. Pure: no network, no storage. */
export async function mergePdfs(coverLines: { title: string; details: string[] }, sources: MergeSource[]): Promise<MergeResult> {
  const out = await PDFDocument.create();
  const cover = out.addPage();
  const included: string[] = [];
  const skipped: string[] = [];

  for (const source of sources) {
    try {
      // No ignoreEncryption: a protected PDF would copy as blank pages.
      const doc = await PDFDocument.load(source.bytes);
      const pages = await out.copyPages(doc, doc.getPageIndices());
      pages.forEach(page => out.addPage(page));
      included.push(source.name);
    } catch {
      skipped.push(source.name);
    }
  }

  const font = await out.embedFont(StandardFonts.Helvetica);
  const bold = await out.embedFont(StandardFonts.HelveticaBold);
  const { height } = cover.getSize();
  let y = height - 80;
  const line = (text: string, opts: { bold?: boolean; size?: number; gap?: number } = {}) => {
    cover.drawText(latin1(text), { x: 60, y, size: opts.size ?? 11, font: opts.bold ? bold : font, color: rgb(0.04, 0.22, 0.14) });
    y -= opts.gap ?? 18;
  };
  line(coverLines.title, { bold: true, size: 20, gap: 30 });
  coverLines.details.forEach(detail => line(detail));
  y -= 10;
  line(`Journals included: ${included.length}`, { bold: true, gap: 22 });
  included.slice(0, MAX_LISTED).forEach((name, i) => line(`${i + 1}. ${name.slice(0, 90)}`, { size: 9, gap: 13 }));
  if (included.length > MAX_LISTED) line(`... and ${included.length - MAX_LISTED} more`, { size: 9 });

  return { bytes: await out.save(), pageCount: out.getPageCount(), included, skipped };
}
