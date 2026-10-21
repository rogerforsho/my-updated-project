'use client';

import React, { useState } from 'react';
import type { AuthUser } from '@ojt/shared';
import Sidebar from '@/src/components/layout/Sidebar';
import Navbar from '@/src/components/layout/Navbar';
import MiniWidgetView from '@/src/components/desktop/MiniWidgetView';

interface Props {
  user: AuthUser;
  children: React.ReactNode;
}

export default function DashboardShell({ user, children }: Props) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex h-dvh bg-[var(--background)] text-[var(--foreground)] overflow-hidden transition-colors">
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

        <main id="main-content" tabIndex={-1} className="campus-workspace flex-1 overflow-y-auto page-fade-in">
          {children}
        </main>
      </div>

      {/* Floating WFH Mini-Widget Mode (if active) */}
      <MiniWidgetView user={user} />

    </div>
  );
}
