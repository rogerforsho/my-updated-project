'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

type Section = 'partners' | 'evaluations' | 'progress';

const sections: Record<Section, { href: string; label: string }[]> = {
  partners: [
    { href: '/coordinator/companies', label: 'Companies' },
    { href: '/coordinator/branches', label: 'Branches' },
    { href: '/coordinator/company-requests', label: 'Requests' },
  ],
  evaluations: [
    { href: '/coordinator/supervisor-evaluations', label: 'Evaluations' },
    { href: '/coordinator/evaluations', label: 'Appeals' },
  ],
  progress: [
    { href: '/coordinator/progress', label: 'Progress' },
    { href: '/coordinator/reports', label: 'Reports' },
  ],
};

export default function CoordinatorSectionNav({ section }: { section: Section }) {
  const pathname = usePathname();
  return (
    <nav aria-label={`${section} navigation`} className="mb-5 flex flex-wrap gap-2">
      {sections[section].map((item) => {
        const current = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={current ? 'page' : undefined}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${current ? 'bg-[var(--cdm-green)] text-white' : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
