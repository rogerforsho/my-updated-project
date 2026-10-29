'use client';
// PROTOTYPE (throwaway): floating bottom bar to flip ?variant= on the reports page.
import { useEffect } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';

export const VARIANTS = [
  { key: 'current', name: 'Current design' },
  { key: 'A', name: 'Ledger: dark sidebar + review queue' },
  { key: 'B', name: 'Split view: icon rail + master/detail' },
  { key: 'C', name: 'Board: light sidebar + kanban lanes' },
];

export default function PrototypeSwitcher() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const current = params.get('variant') ?? 'current';
  const idx = Math.max(0, VARIANTS.findIndex((v) => v.key === current));

  function go(delta: number) {
    const next = VARIANTS[(idx + delta + VARIANTS.length) % VARIANTS.length];
    router.replace(`${pathname}?variant=${next.key}`);
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement;
      if (t.closest('input, textarea, [contenteditable]')) return;
      if (e.key === 'ArrowLeft') go(-1);
      if (e.key === 'ArrowRight') go(1);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (process.env.NODE_ENV === 'production') return null;
  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[9000] flex items-center gap-3 rounded-full bg-black text-white px-4 py-2 text-sm shadow-2xl">
      <button aria-label="Previous variant" onClick={() => go(-1)} className="px-2 cursor-pointer">←</button>
      <span className="font-mono">{VARIANTS[idx].key} ({VARIANTS[idx].name})</span>
      <button aria-label="Next variant" onClick={() => go(1)} className="px-2 cursor-pointer">→</button>
    </div>
  );
}
