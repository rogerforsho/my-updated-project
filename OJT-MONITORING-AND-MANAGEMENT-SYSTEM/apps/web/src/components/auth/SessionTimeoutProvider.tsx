'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { createClient } from '@/src/lib/supabase/client';

const INACTIVITY_LIMIT_MS = 30 * 60 * 1000; // 30 minutes
const WARNING_THRESHOLD_MS = 28 * 60 * 1000; // 28 minutes (2-minute warning)
const CHECK_INTERVAL_MS = 5 * 1000; // Check every 5 seconds

const PUBLIC_PATH_PREFIXES = [
  '/auth/',
  '/verify-certificate',
  '/downloads',
];

export default function SessionTimeoutProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [showWarning, setShowWarning] = useState(false);
  const [secondsRemaining, setSecondsRemaining] = useState(120);

  const lastActivityRef = useRef<number>(Date.now());
  const isPublicPage = pathname === '/' || PUBLIC_PATH_PREFIXES.some(p => pathname.startsWith(p));

  const resetTimer = useCallback(() => {
    lastActivityRef.current = Date.now();
    if (showWarning) {
      setShowWarning(false);
    }
  }, [showWarning]);

  const handleLogout = useCallback(async () => {
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
    } catch {}
    window.location.href = '/auth/sign-in?reason=inactivity';
  }, []);

  useEffect(() => {
    // Disable timer on public / unauthenticated pages
    if (isPublicPage) return;

    // Throttle user activity event listener (at most once every 3 seconds)
    let lastHandled = 0;
    const onUserActivity = () => {
      const now = Date.now();
      if (now - lastHandled > 3000) {
        lastHandled = now;
        lastActivityRef.current = now;
        if (showWarning) {
          setShowWarning(false);
        }
      }
    };

    const events = ['mousedown', 'keydown', 'scroll', 'touchstart', 'click'];
    events.forEach(evt => window.addEventListener(evt, onUserActivity, { passive: true }));

    const interval = setInterval(() => {
      const idleTime = Date.now() - lastActivityRef.current;

      if (idleTime >= INACTIVITY_LIMIT_MS) {
        clearInterval(interval);
        handleLogout();
      } else if (idleTime >= WARNING_THRESHOLD_MS) {
        const remaining = Math.max(0, Math.ceil((INACTIVITY_LIMIT_MS - idleTime) / 1000));
        setSecondsRemaining(remaining);
        setShowWarning(true);
      } else {
        if (showWarning) {
          setShowWarning(false);
        }
      }
    }, CHECK_INTERVAL_MS);

    return () => {
      clearInterval(interval);
      events.forEach(evt => window.removeEventListener(evt, onUserActivity));
    };
  }, [isPublicPage, showWarning, handleLogout]);

  return (
    <>
      {children}

      {/* 2-Minute Inactivity Warning Modal */}
      {showWarning && !isPublicPage && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs transition-opacity animate-in fade-in duration-200"
        >
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center mx-auto text-2xl">
              ⏱️
            </div>

            <div className="space-y-1">
              <h3 className="text-lg font-bold text-slate-900">
                Session Inactivity Warning
              </h3>
              <p className="text-sm text-slate-600">
                To protect institutional records and privacy on shared Colegio de Montalban terminals, your session will automatically end in:
              </p>
            </div>

            <div className="py-2">
              <span className="font-mono text-3xl font-extrabold text-[#0A3824] px-4 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200">
                {Math.floor(secondsRemaining / 60)}:
                {String(secondsRemaining % 60).padStart(2, '0')}
              </span>
            </div>

            <div className="flex gap-2 justify-center pt-2">
              <button
                type="button"
                onClick={handleLogout}
                className="px-4 py-2 text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
              >
                Sign Out Now
              </button>
              <button
                type="button"
                onClick={resetTimer}
                className="px-5 py-2 text-xs font-semibold text-white bg-[#0A3824] hover:bg-[#082e1b] rounded-lg shadow-xs transition-colors"
              >
                Keep Me Signed In
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
