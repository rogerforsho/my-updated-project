'use client';

import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { AuthUser } from '@ojt/shared';
import { accountRoleLabel } from '@ojt/shared';
import {
  Menu,
  Bell,
  ChevronDown,
  Settings,
  ShieldCheck,
} from '@/src/components/ui/Icons';
import SignOutButton from '@/src/components/layout/SignOutButton';
import ThemeToggle from '@/src/components/theme/ThemeToggle';
import StaffNotificationBell from '@/src/components/notifications/StaffNotificationBell';

interface NavbarProps {
  user: AuthUser;
  isMenuOpen?: boolean;
  onMenuToggle: () => void;
}

const PAGE_TITLES: Record<string, string> = {
  '/dashboard': 'Dashboard Overview',
  '/coordinator/approvals': 'Trainee Approvals',
  '/coordinator/messages': 'Messages',
  '/coordinator/notifications': 'Notifications',
  '/coordinator/reports': 'Department Reports',
  '/coordinator/students': 'Trainee Roster',
  '/coordinator/import': 'Import Students',
  '/coordinator/incident-reports': 'Incident Reports',
  '/coordinator/companies': 'Partner Companies (HTEs)',
  '/coordinator/supervisors': 'Company Supervisors',
  '/coordinator/assignments': 'Student Placement',
  '/coordinator/submissions': 'Report Submissions',
  '/coordinator/progress': 'Cohort Monitoring',
  '/supervisor/students': 'Assigned Interns',
  '/supervisor/messages': 'Messages',
  '/supervisor/notifications': 'Notifications',
  '/supervisor/attendance': 'Attendance Verification',
  '/supervisor/reports': 'Daily Accomplishment Reports',
  '/supervisor/evaluations': 'Performance Evaluations',
  '/admin': 'Administrative Console',
  '/map': 'Regional Deployment & Geofence Map',
  '/settings': 'Account & Security Settings',
};

export default function Navbar({ user, isMenuOpen = false, onMenuToggle }: NavbarProps) {
  const pathname = usePathname();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on click outside or escape key
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setDropdownOpen(false);
      }
    }
    if (dropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [dropdownOpen]);

  // Determine current page title
  const currentTitle = PAGE_TITLES[pathname] || 
    pathname.split('/').filter(Boolean).pop()?.replace(/-/g, ' ') || 'Dashboard';

  const roleColor: Record<string, string> = {
    Student: 'text-emerald-800 bg-emerald-50 dark:text-emerald-200 dark:bg-emerald-950/40 border-emerald-200/80 dark:border-emerald-700/50',
    Coordinator: 'text-emerald-800 bg-emerald-50 dark:text-emerald-200 dark:bg-emerald-950/40 border-emerald-200/80 dark:border-emerald-700/50',
    Supervisor: 'text-emerald-800 bg-emerald-50 dark:text-emerald-200 dark:bg-emerald-950/40 border-emerald-200/80 dark:border-emerald-700/50',
    Admin: 'text-emerald-800 bg-emerald-50 dark:text-emerald-200 dark:bg-emerald-950/40 border-emerald-200/80 dark:border-emerald-700/50',
  };
  const roleBadgeStyle = roleColor[user.role] || 'text-slate-700 bg-slate-100 dark:text-slate-300 dark:bg-slate-800 border-slate-200 dark:border-slate-700';

  return (
    <header className="sticky top-0 z-30 w-full bg-[var(--surface)]/95 backdrop-blur-md border-b border-[var(--line)] h-[68px] px-4 sm:px-6 lg:px-8 flex items-center justify-between transition-colors select-none">
      {/* Left: Mobile Menu Toggle & Simplified Page Title (No breadcrumbs) */}
      <div className="flex items-center gap-3.5 min-w-0">
        <button
          type="button"
          onClick={onMenuToggle}
          aria-expanded={isMenuOpen}
          aria-controls="primary-navigation"
          className="lg:hidden p-2 rounded-xl text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          aria-label={isMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
        >
          <Menu className="w-5 h-5" />
        </button>

        <p className="text-sm sm:text-base font-bold font-serif text-slate-900 dark:text-white truncate tracking-tight">
          {currentTitle}
        </p>
      </div>

      {/* Right: Security Pill, Notifications, Light/Dark Switcher, and Profile Dropdown */}
      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
        {/* ISO / Active Security Pill (Minimalist) */}
        <div className="hidden md:flex items-center gap-2 px-2.5 py-1 rounded-full bg-slate-50 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/80 text-[11px] text-slate-600 dark:text-slate-300">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="font-semibold text-slate-700 dark:text-slate-200">CdM Cloud</span>
          <span className="text-slate-300 dark:text-slate-600">•</span>
          <span className="text-slate-400 dark:text-slate-500 font-mono text-[10px]">ISO/IEC 25010</span>
        </div>

        {/* Notifications Shortcut */}
        {user.role === 'Coordinator' || user.role === 'Supervisor' ? (
          <StaffNotificationBell userId={user.user_id} role={user.role} />
        ) : (
          <div
            className="p-2 rounded-xl text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            title="System Alerts"
          >
            <Bell className="w-4 h-4" />
          </div>
        )}

        <div className="h-5 w-px bg-slate-200 dark:bg-slate-700 hidden sm:block" />

        {/* Standard Light/Dark UI Mode Switcher (Positioned right next to user profile badge) */}
        <ThemeToggle />

        {/* Top-Right Profile Dropdown */}
        <div className="relative" ref={dropdownRef}>
          <button
            type="button"
            onClick={() => setDropdownOpen((prev) => !prev)}
            aria-expanded={dropdownOpen}
            aria-haspopup="true"
            className="flex items-center gap-2.5 p-1 sm:pr-2.5 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800/80 transition-all cursor-pointer group focus:outline-none focus:ring-2 focus:ring-[#0A3824]/20 dark:focus:ring-emerald-500/20"
          >
            <div className="w-8 h-8 rounded-full bg-[#0A3824] text-[#E4DBC4] font-bold text-xs flex items-center justify-center border border-emerald-900/30">
              {user.full_name ? user.full_name[0].toUpperCase() : 'U'}
            </div>
            <div className="hidden sm:flex flex-col text-left">
              <span className="text-xs font-bold text-slate-900 dark:text-slate-100 group-hover:text-[#0A3824] dark:group-hover:text-emerald-400 transition-colors truncate max-w-[130px] leading-tight">
                {user.full_name}
              </span>
              <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded-md border inline-block mt-0.5 w-fit ${roleBadgeStyle}`}>
                {accountRoleLabel(user.role)}
              </span>
            </div>
            <ChevronDown className={`w-3.5 h-3.5 text-slate-400 dark:text-slate-500 transition-transform duration-150 hidden sm:block ${dropdownOpen ? 'rotate-180 text-slate-700 dark:text-slate-300' : ''}`} />
          </button>

          {/* Floating Dropdown Menu */}
          {dropdownOpen && (
            <div className="absolute right-0 mt-2 w-64 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 shadow-xl dark:shadow-slate-950/60 py-2 z-50 animate-in fade-in slide-in-from-top-2 duration-150 select-none">
              {/* Profile Card Summary Header */}
              <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-[#0A3824] text-[#E4DBC4] font-bold text-sm flex items-center justify-center shrink-0 border border-emerald-900/30">
                    {user.full_name ? user.full_name[0].toUpperCase() : 'U'}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-slate-900 dark:text-white truncate leading-tight">
                      {user.full_name}
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                      {user.email}
                    </p>
                    <span className={`inline-block text-[9px] font-bold px-2 py-0.5 rounded-full border mt-1.5 uppercase tracking-wider ${roleBadgeStyle}`}>
                      {accountRoleLabel(user.role)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Menu Links */}
              <div className="py-1">
                <Link
                  href="/settings"
                  onClick={() => setDropdownOpen(false)}
                  className="flex items-center gap-2.5 px-4 py-2.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800/70 transition-colors"
                >
                  <Settings className="w-4 h-4 text-slate-400 dark:text-slate-500" />
                  <span>Account & Security Settings</span>
                </Link>

                {user.role === 'Admin' && (
                  <Link
                    href="/admin"
                    onClick={() => setDropdownOpen(false)}
                    className="flex items-center gap-2.5 px-4 py-2.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800/70 transition-colors"
                  >
                    <ShieldCheck className="w-4 h-4 text-slate-400 dark:text-slate-500" />
                    <span>Administrative Console</span>
                  </Link>
                )}
              </div>

              {/* Sign Out Action */}
              <div className="border-t border-slate-100 dark:border-slate-800 pt-1 px-2">
                <SignOutButton />
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
