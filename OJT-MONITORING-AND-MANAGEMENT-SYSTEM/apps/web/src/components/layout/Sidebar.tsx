'use client';

import React, { useEffect, useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useSearchParams } from 'next/navigation';
import type { AuthUser } from '@ojt/shared';
import SignOutButton from '@/src/components/layout/SignOutButton';
import { useDesktop } from '@/src/hooks/useDesktop';
import {
  LayoutDashboard,
  Clock,
  BarChart3,
  FileText,
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
  FileSpreadsheet,
  Briefcase,
  Building,
  User,
  TrendingUp,
  Compass,
  RotateCcw,
  ShieldAlert,
  ChevronDown,
  Megaphone,
  Shield,
} from '@/src/components/ui/Icons';

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<IconProps>;
  section?: string;
}

const NAV_ITEMS: Record<string, NavItem[]> = {
  Coordinator: [
    { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
    { label: 'Approvals', href: '/coordinator/approvals', icon: UserCheck, section: 'Students' },
    { label: 'Students', href: '/coordinator/students', icon: Users, section: 'Students' },
    { label: 'Import Students', href: '/coordinator/import', icon: FileSpreadsheet, section: 'Students' },
    { label: 'Companies', href: '/coordinator/companies', icon: Building2, section: 'Partners' },
    { label: 'HTE Requests', href: '/coordinator/company-requests', icon: Briefcase, section: 'Partners' },
    { label: 'HTE Branches', href: '/coordinator/branches', icon: Building, section: 'Partners' },
    { label: 'Deployment Map', href: '/map', icon: MapPin, section: 'Partners' },
    { label: 'Supervisors', href: '/coordinator/supervisors', icon: User, section: 'Partners' },
    { label: 'Assignments', href: '/coordinator/assignments', icon: FileSignature, section: 'Monitoring' },
    { label: 'Submissions', href: '/coordinator/submissions', icon: ClipboardCheck, section: 'Monitoring' },
    { label: 'Attendance', href: '/coordinator/attendance', icon: Clock, section: 'Monitoring' },
    { label: 'Progress', href: '/coordinator/progress', icon: TrendingUp, section: 'Monitoring' },
    { label: 'Holidays & Days Off', href: '/coordinator/non-working-days', icon: Clock, section: 'Monitoring' },
    { label: 'What-if Analysis', href: '/coordinator/what-if', icon: Compass, section: 'Monitoring' },
    { label: 'Incident Reports', href: '/coordinator/incident-reports', icon: ShieldAlert, section: 'Monitoring' },
    { label: 'Supervisor Evaluations', href: '/coordinator/supervisor-evaluations', icon: Star, section: 'Evaluation' },
    { label: 'Evaluation Appeals', href: '/coordinator/evaluations', icon: RotateCcw, section: 'Evaluation' },
    { label: 'Department Reports', href: '/coordinator/reports', icon: BarChart3, section: 'Evaluation' },
    { label: 'Messages', href: '/coordinator/messages', icon: MessagesSquare, section: 'Inbox' },
    { label: 'Notifications', href: '/coordinator/notifications', icon: Bell, section: 'Inbox' },
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

// Super Admin sections live on /admin and switch with ?tab=.
const ADMIN_SECTIONS = [
  { tab: 'users', label: 'User Management', icon: Users },
  { tab: 'announcements', label: 'Announcements', icon: Megaphone },
  { tab: 'holidays', label: 'Academic Calendar', icon: Clock },
  { tab: 'audit', label: 'Audit Log', icon: Shield },
] as const;

interface Props {
  user: AuthUser;
  isOpen?: boolean;
  onClose?: () => void;
}

export default function Sidebar({ user, isOpen = false, onClose }: Props) {
  const pathname = usePathname();
  const currentTab = useSearchParams().get('tab') ?? 'users';
  const [adminOpen, setAdminOpen] = React.useState(true);
  const [collapsed, setCollapsed] = React.useState<string[]>([]);
  const toggleSection = (section: string) =>
    setCollapsed((prev) => (prev.includes(section) ? prev.filter((name) => name !== section) : [...prev, section]));
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
        className={`fixed lg:static inset-y-0 left-0 z-50 w-64 bg-[var(--cdm-dark)] border-r border-emerald-950/40 flex flex-col h-full shrink-0 select-none transition-transform duration-200 ease-out shadow-2xl lg:shadow-none ${
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
              ✕
            </button>
          )}
        </div>

        {/* Navigation Items */}
        <nav aria-label="Main navigation" className="flex-1 px-3 py-3 space-y-1 overflow-y-auto">
          {user.role === 'Admin' ? (
            <div>
              <button
                type="button"
                onClick={() => setAdminOpen((open) => !open)}
                aria-expanded={adminOpen}
                aria-controls="admin-sections"
                className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-bold text-white hover:bg-white/5 transition-colors cursor-pointer"
              >
                <ShieldCheck className="w-4 h-4 shrink-0 text-[#E4DBC4]" />
                <span className="flex-1 text-left">Administration</span>
                <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-150 ${adminOpen ? '' : '-rotate-90'}`} />
              </button>
              {adminOpen && (
                <ul id="admin-sections" className="mt-1 ml-3 pl-3 border-l border-white/10 space-y-1">
                  {ADMIN_SECTIONS.map(({ tab, label, icon: SectionIcon }) => {
                    const active = pathname === '/admin' && currentTab === tab;
                    return (
                      <li key={tab}>
                        <Link
                          href={`/admin?tab=${tab}`}
                          onClick={onClose}
                          aria-current={active ? 'page' : undefined}
                          className={`flex items-center gap-3 px-4 py-2 rounded-xl text-xs font-semibold transition-all duration-150 ${
                            active ? 'bg-white/15 text-white font-bold' : 'text-slate-400 hover:text-white hover:bg-white/5'
                          }`}
                        >
                          <SectionIcon className="w-4 h-4 shrink-0" />
                          <span className="truncate">{label}</span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          ) : items.map((item, index) => {
            const IconComponent = item.icon;
            const active = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href));
            const startsSection = item.section && item.section !== items[index - 1]?.section;
            return (
              <React.Fragment key={item.href}>
              {startsSection && (
                <button
                  type="button"
                  onClick={() => toggleSection(item.section!)}
                  aria-expanded={!collapsed.includes(item.section!)}
                  className="w-full flex items-center justify-between px-3 pt-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-[#E4DBC4]/70 hover:text-[#E4DBC4] cursor-pointer"
                >
                  {item.section}
                  <ChevronDown className={`w-3 h-3 transition-transform duration-150 ${collapsed.includes(item.section!) ? '-rotate-90' : ''}`} />
                </button>
              )}
              {(!item.section || !collapsed.includes(item.section) || active) && (
              <Link
                href={item.href}
                onClick={onClose}
                aria-current={active ? 'page' : undefined}
                className={`flex items-center gap-3 px-4 py-2 rounded-xl text-xs font-semibold transition-all duration-150 ${
                  active
                    ? 'bg-white/10 text-white shadow-2xs border border-white/15 font-bold'
                    : 'text-slate-400 hover:text-white hover:bg-white/5 active:scale-[0.99]'
                }`}
              >
                <IconComponent className={`w-4 h-4 shrink-0 transition-colors ${active ? 'text-[#E4DBC4]' : 'text-slate-400 group-hover:text-slate-200'}`} />
                <span className="truncate">{item.label}</span>
              </Link>
              )}
              </React.Fragment>
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
            className={`flex items-center gap-3 px-4 py-2 rounded-xl text-xs font-semibold transition-all duration-150 ${
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
