export const PAGE_SIZES = [10, 25, 50, 100] as const;
export const DEFAULT_PAGE_SIZE = 25;

/** "Showing 1–10 of 432 results" */
export function rangeText(page: number, size: number, total: number): string {
  if (total === 0) return 'No results';
  return `Showing ${(page - 1) * size + 1}–${Math.min(page * size, total)} of ${total} results`;
}

/** Page buttons with ellipsis, e.g. 1 … 4 5 6 … 22 */
export function pageItems(page: number, totalPages: number): (number | '…')[] {
  const keep = new Set([1, totalPages, page - 1, page, page + 1]);
  const out: (number | '…')[] = [];
  let last = 0;
  for (let p = 1; p <= totalPages; p++) {
    if (!keep.has(p)) continue;
    if (p - last > 1) out.push('…');
    out.push(p);
    last = p;
  }
  return out;
}
