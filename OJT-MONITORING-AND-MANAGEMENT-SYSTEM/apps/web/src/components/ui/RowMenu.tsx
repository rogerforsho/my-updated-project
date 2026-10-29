'use client';

import { useEffect, useRef, useState } from 'react';
import { MoreHorizontal } from '@/src/components/ui/Icons';

export interface RowMenuItem { label: string; onSelect: () => void; destructive?: boolean }

/** Triple-dot row actions. Enter/Space opens, arrows move, Esc closes. */
export function RowMenu({ items, label = 'Row actions' }: { items: RowMenuItem[]; label?: string }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const buttons = () => Array.from(root.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? []);

  useEffect(() => {
    if (!open) return;
    buttons()[0]?.focus();
    const away = (e: MouseEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [open]);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') { setOpen(false); root.current?.querySelector<HTMLButtonElement>('[aria-haspopup]')?.focus(); return; }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const list = buttons();
    const at = list.indexOf(document.activeElement as HTMLButtonElement);
    list[(at + (e.key === 'ArrowDown' ? 1 : list.length - 1)) % list.length]?.focus();
  }

  return (
    <div ref={root} className="relative inline-block text-left" onKeyDown={onKeyDown}>
      <button
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500"
      >
        <MoreHorizontal />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-20 mt-1 min-w-40 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 py-1 shadow-lg">
          {items.map((it) => (
            <button
              key={it.label}
              type="button"
              role="menuitem"
              onClick={() => { setOpen(false); it.onSelect(); }}
              className={`block w-full px-3 py-2 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-800 focus:bg-slate-100 dark:focus:bg-slate-800 focus:outline-none ${it.destructive ? 'text-rose-600' : 'text-slate-700 dark:text-slate-200'}`}
            >
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
