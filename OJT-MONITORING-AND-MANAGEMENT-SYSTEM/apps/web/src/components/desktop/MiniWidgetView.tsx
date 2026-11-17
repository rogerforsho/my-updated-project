'use client';

import React, { useState, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import type { AuthUser } from '@ojt/shared';
import { accountRoleLabel } from '@ojt/shared';
import { useDesktop } from '@/src/hooks/useDesktop';
import { ArrowRight } from '@/src/components/ui/Icons';

interface Props {
  user: AuthUser;
}

export default function MiniWidgetView({ user }: Props) {
  const { isMiniWidget, toggleMiniWidget, minimizeToTray } = useDesktop();
  const [seconds, setSeconds] = useState(0);

  // Live shift stopwatch timer
  useEffect(() => {
    const timer = setInterval(() => {
      setSeconds((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  if (!isMiniWidget) return null;

  // Format seconds into HH:MM:SS
  const hrs = String(Math.floor(seconds / 3600)).padStart(2, '0');
  const mins = String(Math.floor((seconds % 3600) / 60)).padStart(2, '0');
  const secs = String(seconds % 60).padStart(2, '0');

  return (
    <div className="fixed inset-0 z-[90] bg-[var(--surface)] text-[var(--foreground)] flex flex-col p-4 page-fade-in select-none">
      {/* Top Header Bar */}
      <div className="flex items-center justify-between pb-3 border-b border-[var(--line)]">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-[var(--surface-muted)] p-0.5 border border-[var(--line)] flex items-center justify-center">
            <Image
              src="/logo.png"
              alt="CdM Logo"
              width={20}
              height={20}
              className="object-contain"
              priority
            />
          </div>
          <span className="text-xs font-bold text-[var(--foreground)] font-serif">CdM Companion</span>
        </div>

        {/* Restore to Full Window Button */}
        <button
          type="button"
          onClick={() => toggleMiniWidget(false)}
          title="Expand Full Dashboard"
          className="text-xs font-semibold text-[var(--foreground)] bg-[var(--surface)] hover:bg-[var(--surface-muted)] px-2.5 py-1 rounded-lg border border-[var(--line)] transition-all flex items-center gap-1 cursor-pointer"
        >
          <span>Expand</span>
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
          </svg>
        </button>
      </div>

      {/* User Info Card */}
      <div className="my-3 p-3 rounded-xl bg-[var(--surface-muted)] border border-[var(--line)] flex items-center gap-3">
        <div className="w-9 h-9 rounded-full bg-[var(--cdm-green)] text-white flex items-center justify-center font-bold text-xs shrink-0">
          {user.full_name ? user.full_name[0].toUpperCase() : 'U'}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold text-[var(--foreground)] truncate">{user.full_name}</p>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 ">
              {accountRoleLabel(user.role)}
            </span>
            <span className="text-xs text-[var(--text-muted)] font-medium">WFH Active</span>
          </div>
        </div>
      </div>

      {/* Live Shift Stopwatch */}
      <div className="flex-1 flex flex-col items-center justify-center p-4 rounded-2xl bg-[var(--surface-muted)] border border-[var(--line)] my-2">
        <div className="flex items-center gap-1.5 text-xs text-[var(--text-muted)] font-semibold mb-2">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          Shift Session Timer
        </div>

        <div className="text-3xl font-mono font-bold text-[var(--foreground)] tracking-widest bg-[var(--surface)] px-4 py-2 rounded-xl border border-[var(--line)]">
          {hrs}:{mins}:{secs}
        </div>

        <p className="text-xs text-[var(--text-muted)] mt-2 font-medium">
          {new Date().toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric' })}
        </p>
      </div>

      {/* Quick Action Buttons */}
      <div className="space-y-2 pt-2">
        {user.role === 'Coordinator' && (
          <Link
            href="/coordinator/approvals"
            className="w-full py-2.5 rounded-xl bg-[var(--cdm-green)] hover:bg-[var(--cdm-green-light)] text-white font-semibold text-xs flex items-center justify-center gap-2 transition-colors"
          >
            <span>Review Pending Approvals</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        )}

        {user.role === 'Admin' && (
          <Link
            href="/admin"
            className="w-full py-2.5 rounded-xl bg-[var(--cdm-green)] hover:bg-[var(--cdm-green-light)] text-white font-semibold text-xs flex items-center justify-center gap-2 transition-colors"
          >
            <span>Admin System Console</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        )}

        <button
          type="button"
          onClick={minimizeToTray}
          className="w-full py-2 rounded-xl bg-[var(--surface)] hover:bg-[var(--surface-muted)] text-[var(--foreground)] font-semibold text-xs border border-[var(--line)] flex items-center justify-center gap-1.5 transition-all cursor-pointer"
        >
          <span>Minimize to Tray</span>
        </button>
      </div>
    </div>
  );
}
