'use client';

import React, { useEffect, useState } from 'react';
import type { AuthUser } from '@ojt/shared';
import Sidebar from '@/src/components/layout/Sidebar';
import Navbar from '@/src/components/layout/Navbar';
import MiniWidgetView from '@/src/components/desktop/MiniWidgetView';

interface Props {
  user: AuthUser;
  children: React.ReactNode;
  /** Coordinator's granted departments; empty for other roles. */
  departments?: ('ICS' | 'IBE')[];
}

export default function DashboardShell({ user, children, departments = [] }: Props) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [dept, setDept] = useState<'ICS' | 'IBE' | undefined>(departments[0]);

  // Remember a coordinator's last chosen department on this device.
  useEffect(() => {
    try {
      const saved = localStorage.getItem('ojt_department_theme');
      if (saved === 'ICS' || saved === 'IBE') { if (departments.includes(saved)) setDept(saved); }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  function chooseDept(next: 'ICS' | 'IBE') {
    setDept(next);
    try { localStorage.setItem('ojt_department_theme', next); } catch {}
  }

  return (
    <div data-dept={departments.length ? dept : undefined} className="flex h-dvh bg-[var(--background)] text-[var(--foreground)] overflow-hidden transition-colors">
      <a href="#main-content" className="skip-link">Skip to main content</a>
      <Sidebar
        user={user}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        <Navbar
          user={user}
          isMenuOpen={sidebarOpen}
          onMenuToggle={() => setSidebarOpen((prev) => !prev)}
        />

        {departments.length > 1 && (
          <div className="flex items-center gap-2 border-b border-[var(--line)] bg-[var(--surface-muted)] px-4 py-1.5 text-xs">
            <label htmlFor="dept-switch" className="font-semibold text-[var(--text-muted)]">Department</label>
            <select id="dept-switch" value={dept} onChange={(e) => chooseDept(e.target.value as 'ICS' | 'IBE')}
              className="rounded-md border border-[var(--line)] bg-[var(--surface)] px-2 py-1 font-semibold">
              {departments.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
            <span className="text-[var(--text-muted)]">Theme only. Your lists still cover every department you are granted.</span>
          </div>
        )}

        <main id="main-content" tabIndex={-1} className="campus-workspace flex-1 overflow-y-auto page-fade-in">
          {children}
        </main>
      </div>

      {/* Floating WFH Mini-Widget Mode (if active) */}
      <MiniWidgetView user={user} />

    </div>
  );
}
