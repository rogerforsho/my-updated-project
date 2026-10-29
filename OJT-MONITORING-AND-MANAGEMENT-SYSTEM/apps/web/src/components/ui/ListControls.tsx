'use client';

import { useEffect, useMemo, useState } from 'react';
import { DEFAULT_PAGE_SIZE, PAGE_SIZES, pageItems, rangeText } from '@/src/lib/paging';

const SIZE_KEY = 'ojt-rows-per-page';

/** Rows-per-page choice, remembered across pages and sessions. */
export function usePageSize(): [number, (n: number) => void] {
  const [size, setSize] = useState<number>(DEFAULT_PAGE_SIZE);
  useEffect(() => {
    try {
      const saved = Number(localStorage.getItem(SIZE_KEY));
      if ((PAGE_SIZES as readonly number[]).includes(saved)) setSize(saved);
    } catch { /* storage blocked: keep default */ }
  }, []);
  return [size, (n) => {
    setSize(n);
    try { localStorage.setItem(SIZE_KEY, String(n)); } catch { /* ignore */ }
  }];
}

/**
 * Search + paging over a list the page has already loaded in full.
 * shortcut: client-side, only complete while the service returns every row; use server paging past ~1000 rows.
 */
export function useSearchPaging<T>(items: T[], textOf: (item: T) => string) {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, changeSize] = usePageSize();
  function setPageSize(n: number) { changeSize(n); setPage(1); }
  useEffect(() => { setPage(1); }, [search]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? items.filter((i) => textOf(i).toLowerCase().includes(q)) : items;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const current = Math.min(page, totalPages);
  const visible = filtered.slice((current - 1) * pageSize, current * pageSize);
  return {
    search, setSearch, page: current, setPage, totalPages, visible, matched: filtered.length,
    pager: { page: current, totalPages, total: filtered.length, setPage, pageSize, setPageSize },
  };
}

export function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <input
      type="search"
      aria-label={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full sm:w-80 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-teal-500"
    />
  );
}

export function PagerBar({ page, totalPages, total, setPage, pageSize, setPageSize }: {
  page: number; totalPages: number; total: number; setPage: (p: number) => void; pageSize: number; setPageSize: (n: number) => void;
}) {
  if (total === 0) return null;
  const btn = 'rounded-lg border border-slate-200 dark:border-slate-700 px-2.5 py-1.5 disabled:opacity-40';
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
      <span>{rangeText(page, pageSize, total)}</span>
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-1.5">
          Rows per page
          <select
            value={pageSize}
            onChange={(e) => setPageSize(Number(e.target.value))}
            className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5"
          >
            {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <nav aria-label="Pagination" className="flex items-center gap-1">
          <button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)} className={btn}>Previous</button>
          {pageItems(page, totalPages).map((p, i) => p === '…'
            ? <span key={`e${i}`} className="px-1">…</span>
            : <button key={p} type="button" aria-current={p === page ? 'page' : undefined} onClick={() => setPage(p)}
                className={`${btn} tabular-nums ${p === page ? 'bg-teal-600 border-teal-600 text-white' : ''}`}>{p}</button>)}
          <button type="button" disabled={page >= totalPages} onClick={() => setPage(page + 1)} className={btn}>Next</button>
        </nav>
      </div>
    </div>
  );
}
