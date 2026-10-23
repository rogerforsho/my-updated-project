'use client';

import React, { useEffect, useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import type { AuthUser } from '@ojt/shared';
import SignOutButton from '@/src/components/layout/SignOutButton';
import { useDesktop } from '@/src/hooks/useDesktop';
import {
  LayoutDashboard,
  Clock,
  BarChart3,
  FileText,
  Award,
  Bell,
  UserCheck,
  Users,
  Building2,
  FileSignature,
  ClipboardCheck,
  Star,
  Settings,
  ShieldCheck,
  MapPin,
  MessagesSquare,
  type IconProps,
} from '@/src/components/ui/Icons';

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<IconProps>;
}

const NAV_ITEMS: Record<string, NavItem[]> = {
  Student: [
    { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
    { label: 'Attendance', href: '/student/attendance', icon: Clock },
    { label: 'Progress', href: '/student/progress', icon: BarChart3 },
    { label: 'Reports', href: '/student/reports', icon: FileText },
    { label: 'Evaluations', href: '/student/evaluation-summary', icon: Star },
    { label: 'Certificate', href: '/student/certificate', icon: Award },
    { label: 'Notifications', href: '/student/notifications', icon: Bell },
  ],
  Coordinator: [
    { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
    { label: 'Approvals', href: '/coordinator/approvals', icon: UserCheck },
    { label: 'Students', href: '/coordinator/students', icon: Users },
    { label: 'Companies', href: '/coordinator/companies', icon: Building2 },
    { label: 'HTE Requests', href: '/coordinator/company-requests', icon: Building2 },
    { label: 'HTE Branches', href: '/coordinator/branches', icon: MapPin },
    { label: 'Deployment Map', href: '/map', icon: MapPin },
    { label: 'Supervisors', href: '/coordinator/supervisors', icon: UserCheck },
    { label: 'Assignments', href: '/coordinator/assignments', icon: FileSignature },
    { label: 'Submissions', href: '/coordinator/submissions', icon: ClipboardCheck },
    { label: 'Attendance exceptions', href: '/coordinator/attendance', icon: Clock },
    { label: 'Progress', href: '/coordinator/progress', icon: BarChart3 },
    { label: 'What-if analysis', href: '/coordinator/what-if', icon: BarChart3 },
    { label: 'Supervisor Evaluations', href: '/coordinator/supervisor-evaluations', icon: Star },
    { label: 'Evaluation Appeals', href: '/coordinator/evaluations', icon: Star },
    { label: 'Department Reports', href: '/coordinator/reports', icon: BarChart3 },
    { label: 'Messages', href: '/coordinator/messages', icon: MessagesSquare },
    { label: 'Notifications', href: '/coordinator/notifications', icon: Bell },
  ],
  Supervisor: [
    { label: 'My Students', href: '/supervisor/students', icon: Users },
    { label: 'Attendance', href: '/supervisor/attendance', icon: Clock },
    { label: 'Daily Reports', href: '/supervisor/reports', icon: FileText },
    { label: 'Evaluations', href: '/supervisor/evaluations', icon: Star },
    { label: 'Messages', href: '/supervisor/messages', icon: MessagesSquare },
    { label: 'Notifications', href: '/supervisor/notifications', icon: Bell },
  ],
  Admin: [
    { label: 'Administration', href: '/admin', icon: ShieldCheck },
  ],
};

interface Props {
  user: AuthUser;
  isOpen?: boolean;
  onClose?: () => void;
}

export default function Sidebar({ user, isOpen = false, onClose }: Props) {
  const pathname = usePathname();
  const { isDesktop, toggleMiniWidget } = useDesktop();
  const items = NAV_ITEMS[user.role] ?? [];
  const sidebarRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const sidebar = sidebarRef.current;
    const previousFocus = document.activeElement as HTMLElement | null;
    const focusable = () => Array.from(sidebar?.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
    ) ?? []).filter(element => element.getClientRects().length > 0);
    (sidebar?.querySelector<HTMLElement>('nav a[href]') ?? focusable()[0])?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose?.();
        return;
      }
      if (event.key !== 'Tab') return;
      const elements = focusable();
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && (document.activeElement === first || !sidebar?.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !sidebar?.contains(document.activeElement))) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [isOpen, onClose]);

  return (
    <>
      {/* Mobile Drawer Backdrop Overlay */}
      {isOpen && (
        <div
          onClick={onClose}
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-xs lg:hidden transition-opacity"
          aria-hidden="true"
        />
      )}

      {/* Main Sidebar Shell */}
      <aside
        ref={sidebarRef}
        id="primary-navigation"
        className={`fixed lg:static inset-y-0 left-0 z-50 w-64 bg-[#092E1D] border-r border-emerald-950/40 flex flex-col h-full shrink-0 select-none transition-transform duration-200 ease-out shadow-2xl lg:shadow-none ${
          isOpen ? 'visible translate-x-0' : 'invisible -translate-x-full lg:visible lg:translate-x-0'
        }`}
      >
        {/* Brand Header */}
        <div className="px-5 py-4.5 border-b border-white/8 flex items-center justify-between bg-black/15">
          <Link href="/dashboard" className="flex items-center gap-3 min-w-0" onClick={onClose}>
            <div className="w-9 h-9 rounded-xl bg-white/10 p-1 flex items-center justify-center border border-amber-400/30 shrink-0">
              <Image
                src="/logo.png"
                alt="Colegio de Montalban Seal"
                width={28}
                height={28}
                className="object-contain"
                priority
              />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-xs font-black text-white leading-tight font-serif tracking-tight truncate">
                Colegio de Montalban
              </h2>
              <p className="text-[9px] font-bold text-[#E4DBC4] tracking-wider uppercase mt-0.5">
                OJT Practicum Portal
              </p>
            </div>
          </Link>

          {/* Close button for mobile */}
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="lg:hidden p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
              aria-label="Close sidebar"
            >
              âœ•
            </button>
          )}
        </div>

        {/* Navigation Items */}
        <nav aria-label="Main navigation" className="flex-1 px-3 py-3 space-y-1 overflow-y-auto">
          {items.map((item) => {
            const IconComponent = item.icon;
            const active = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                aria-current={active ? 'page' : undefined}
                className={`flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-semibold transition-all duration-150 ${
                  active
                    ? 'bg-white/10 text-white shadow-2xs border border-white/15 font-bold'
                    : 'text-slate-400 hover:text-white hover:bg-white/5 active:scale-[0.99]'
                }`}
              >
                <IconComponent className={`w-4 h-4 shrink-0 transition-colors ${active ? 'text-[#E4DBC4]' : 'text-slate-400 group-hover:text-slate-200'}`} />
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Desktop Native Indicator (shown only when running on Desktop) */}
        {isDesktop && (
          <div className="px-3 py-2 mx-3 mb-2 rounded-xl bg-emerald-950/60 border border-emerald-500/30 flex items-center justify-between shadow-2xs">
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-[10px] font-bold text-emerald-300 uppercase tracking-wider">
                Desktop Mode
              </span>
            </div>
            <button
              type="button"
              onClick={() => toggleMiniWidget(true)}
              title="Toggle Floating Mini-Widget Mode"
              className="text-[10px] font-bold text-amber-300 hover:text-white px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 transition-all cursor-pointer active:scale-95"
            >
              Widget
            </button>
          </div>
        )}

        {/* Universal Account Settings Link */}
        <div className="px-3 pb-2">
          <Link
            href="/settings"
            onClick={onClose}
            aria-current={pathname === '/settings' ? 'page' : undefined}
            className={`flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-semibold transition-all duration-150 ${
              pathname === '/settings'
                ? 'bg-white/10 text-white shadow-2xs border border-white/15 font-bold'
                : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <Settings className={`w-4 h-4 shrink-0 transition-colors ${pathname === '/settings' ? 'text-[#E4DBC4]' : 'text-slate-400'}`} />
            <span className="truncate">Account Settings</span>
          </Link>
        </div>

        {/* Sign Out Action & Micro-Status Badge */}
        <div className="p-3 border-t border-white/8 bg-black/25 space-y-2">
          <SignOutButton />

          <div className="pt-1.5 border-t border-white/5 flex items-center justify-between text-[10px] text-slate-400">
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="font-medium text-slate-300">v1.2.0 Online</span>
            </div>
            <span className="text-[9px] text-slate-400 font-medium">RA 10173 • ISO/IEC</span>
          </div>
        </div>
      </aside>
    </>
  );
}
