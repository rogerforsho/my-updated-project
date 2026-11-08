'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';

// Fold state per screen, remembered in this browser. A group is open unless the user folded it.
// While `search` is non-empty every group starts open and clicks fold only for that search; the saved state is untouched.
export function useGroupFold(storageKey: string, search = '') {
  const [folded, setFolded] = useState<Record<string, boolean>>({});
  const [searchFolded, setSearchFolded] = useState<Record<string, boolean>>({});

  useEffect(() => { setSearchFolded({}); }, [search]);

  useEffect(() => {
    try {
      setFolded(JSON.parse(localStorage.getItem(storageKey) ?? '{}'));
    } catch { /* storage blocked or corrupt: start with everything open */ }
  }, [storageKey]);

  const save = useCallback((next: Record<string, boolean>) => {
    setFolded(next);
    try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* fold state just won't persist */ }
  }, [storageKey]);

  return {
    // defaultOpen applies until the user folds or unfolds that group once.
    isOpen: (id: string, defaultOpen = true) => (search ? !searchFolded[id] : id in folded ? !folded[id] : defaultOpen),
    toggle: (id: string, defaultOpen = true) => search
      ? setSearchFolded((s) => ({ ...s, [id]: !s[id] }))
      : save({ ...folded, [id]: id in folded ? !folded[id] : defaultOpen }),
    setAll: (ids: string[], open: boolean) => {
      const next = Object.fromEntries(ids.map((id) => [id, !open]));
      if (search) setSearchFolded(next); else save(next);
    },
  };
}

export function CollapsibleGroup({ title, summary, badge, open, onToggle, children }: {
  title: string;
  summary: string;
  badge?: ReactNode;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs overflow-hidden">
      <button
        type="button"
        aria-expanded={open}
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-5 py-3.5 text-left hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors"
      >
        <span aria-hidden className={`text-slate-400 transition-transform ${open ? 'rotate-90' : ''}`}>▸</span>
        <span className="font-bold text-sm text-slate-900 dark:text-white">{title}</span>
        <span className="text-xs text-slate-500 dark:text-slate-400">{summary}</span>
        {badge && <span className="ml-auto">{badge}</span>}
      </button>
      {open && <div className="border-t border-slate-100 dark:border-slate-800">{children}</div>}
    </section>
  );
}
