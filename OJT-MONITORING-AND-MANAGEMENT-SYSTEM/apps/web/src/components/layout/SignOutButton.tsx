'use client';

import React, { useState, useTransition } from 'react';
import { LogOut } from '@/src/components/ui/Icons';
import { signOut } from '@/src/services/auth';

export default function SignOutButton() {
  const [isPending, startTransition] = useTransition();
  const [clicked, setClicked] = useState(false);

  const handleSignOut = async (e: React.FormEvent) => {
    e.preventDefault();
    setClicked(true);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('ojt-route-start'));
    }
    startTransition(async () => {
      await signOut();
    });
  };

  const isLoading = isPending || clicked;

  return (
    <form onSubmit={handleSignOut} className="w-full">
      <button
        type="submit"
        disabled={isLoading}
        className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-semibold text-rose-700 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/40 border border-transparent transition-all duration-150 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {isLoading ? (
          <svg className="w-4 h-4 text-rose-600 animate-spin shrink-0" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
          </svg>
        ) : (
          <LogOut className="w-4 h-4 shrink-0" />
        )}
        <span>{isLoading ? 'Signing Out...' : 'Sign Out'}</span>
      </button>
    </form>
  );
}
