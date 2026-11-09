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
  MessagesSquare,
  type IconProps,
  User,
  TrendingUp,
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
    { label: 'Companies', href: '/coordinator/companies', icon: Building2, section: 'Partners' },
    { label: 'Supervisors', href: '/coordinator/supervisors', icon: User, section: 'Partners' },
    { label: 'Assignments', href: '/coordinator/assignments', icon: FileSignature, section: 'Monitoring' },
    { label: 'Submissions', href: '/coordinator/submissions', icon: ClipboardCheck, section: 'Monitoring' },
    { label: 'Attendance', href: '/coordinator/attendance', icon: Clock, section: 'Monitoring' },
    { label: 'Progress & Reports', href: '/coordinator/progress', icon: TrendingUp, section: 'Monitoring' },
    { label: 'Holidays & Days Off', href: '/coordinator/non-working-days', icon: Clock, section: 'Monitoring' },
    { label: 'Incident Reports', href: '/coordinator/incident-reports', icon: ShieldAlert, section: 'Monitoring' },
    { label: 'Evaluations', href: '/coordinator/supervisor-evaluations', icon: Star, section: 'Evaluation' },
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

// Active item: a soft tint of the brand colour (follows the coordinator's department theme).
const NAV_ACTIVE = 'bg-[color-mix(in_srgb,var(--cdm-green)_10%,transparent)] text-[var(--cdm-green)] dark:text-white font-semibold';
const NAV_IDLE = 'text-[var(--text-muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--foreground)]';

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

      {/* Main Sidebar Shell: light surface, same language as the public landing page */}
      <aside
        ref={sidebarRef}
        id="primary-navigation"
        className={`fixed lg:static inset-y-0 left-0 z-50 w-64 bg-[var(--surface)] border-r border-[var(--line)] flex flex-col h-full shrink-0 select-none transition-transform duration-200 ease-out shadow-2xl lg:shadow-none ${
          isOpen ? 'visible translate-x-0' : 'invisible -translate-x-full lg:visible lg:translate-x-0'
        }`}
      >
        {/* Brand Header: small label over the institution name, as on the landing page */}
        <div className="h-[68px] px-5 border-b border-[var(--line)] flex items-center justify-between">
          <Link href="/dashboard" className="flex items-center gap-3 min-w-0" onClick={onClose}>
            <div className="w-10 h-10 rounded-xl bg-[var(--surface-muted)] border border-[var(--line)] p-1 flex items-center justify-center shrink-0">
              <Image
                src="/logo.png"
                alt="Colegio de Montalban Seal"
                width={32}
                height={32}
                className="object-contain"
                priority
              />
            </div>
            <div className="min-w-0 flex-1 leading-tight">
              <p className="text-xs font-medium text-[var(--text-muted)] truncate">OJT Practicum Portal</p>
              <h2 className="text-sm font-bold text-[var(--foreground)] font-serif tracking-tight truncate">
                Colegio de Montalban
              </h2>
            </div>
          </Link>

          {/* Close button for mobile */}
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="lg:hidden p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--foreground)] hover:bg-[var(--surface-muted)] transition-colors"
              aria-label="Close sidebar"
            >
              ✕
            </button>
          )}
        </div>

        {/* Navigation Items */}
        <nav aria-label="Main navigation" className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {user.role === 'Admin' ? (
            <div>
              <button
                type="button"
                onClick={() => setAdminOpen((open) => !open)}
                aria-expanded={adminOpen}
                aria-controls="admin-sections"
                className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] hover:text-[var(--foreground)] transition-colors cursor-pointer"
              >
                <ShieldCheck className="w-4 h-4 shrink-0" />
                <span className="flex-1 text-left">Administration</span>
                <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-150 ${adminOpen ? '' : '-rotate-90'}`} />
              </button>
              {adminOpen && (
                <ul id="admin-sections" className="mt-1 space-y-0.5">
                  {ADMIN_SECTIONS.map(({ tab, label, icon: SectionIcon }) => {
                    const active = pathname === '/admin' && currentTab === tab;
                    return (
                      <li key={tab}>
                        <Link
                          href={`/admin?tab=${tab}`}
                          onClick={onClose}
                          aria-current={active ? 'page' : undefined}
                          className={`flex items-center gap-3 px-3 py-2 rounded-xl text-sm transition-colors duration-150 ${
                            active ? NAV_ACTIVE : NAV_IDLE
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
                  className="w-full flex items-center justify-between px-3 pt-4 pb-1.5 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] hover:text-[var(--foreground)] cursor-pointer"
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
                className={`flex items-center gap-3 px-3 py-2 rounded-xl text-sm transition-colors duration-150 ${
                  active ? NAV_ACTIVE : NAV_IDLE
                }`}
              >
                <IconComponent className="w-4 h-4 shrink-0" />
                <span className="truncate">{item.label}</span>
              </Link>
              )}
              </React.Fragment>
            );
          })}
        </nav>

        {/* Desktop Native Indicator (shown only when running on Desktop) */}
        {isDesktop && (
          <div className="px-3 py-2 mx-3 mb-2 rounded-xl bg-[var(--surface-muted)] border border-[var(--line)] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              <span className="text-xs font-semibold text-[var(--text-muted)]">
                Desktop mode
              </span>
            </div>
            <button
              type="button"
              onClick={() => toggleMiniWidget(true)}
              title="Toggle Floating Mini-Widget Mode"
              className="text-xs font-semibold text-[var(--foreground)] px-2 py-0.5 rounded-md bg-[var(--surface)] border border-[var(--line)] hover:bg-[var(--background)] transition-colors cursor-pointer active:scale-95"
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
            className={`flex items-center gap-3 px-3 py-2 rounded-xl text-sm transition-colors duration-150 ${
              pathname === '/settings' ? NAV_ACTIVE : NAV_IDLE
            }`}
          >
            <Settings className="w-4 h-4 shrink-0" />
            <span className="truncate">Account Settings</span>
          </Link>
        </div>

        {/* Sign Out Action */}
        <div className="p-3 border-t border-[var(--line)] space-y-1">
          <SignOutButton />
          <p className="px-3 text-xs text-[var(--text-muted)]">v1.2.0</p>
        </div>
      </aside>
    </>
  );
}
