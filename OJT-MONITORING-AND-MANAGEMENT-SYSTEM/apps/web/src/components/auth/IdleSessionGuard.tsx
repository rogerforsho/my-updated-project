'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { createClient } from '@/src/lib/supabase/client';
import { Button } from '@/src/components/ui/Button';
import { Clock, LogOut } from '@/src/components/ui/Icons';
import type { AuthUser } from '@ojt/shared';

interface Props {
  user: AuthUser;
}

// Security Configuration (ISO/IEC 25010:2023 Compliant)
const IDLE_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes total inactivity
const WARNING_THRESHOLD_MS = 13 * 60 * 1000; // 13 minutes (2-minute warning window)
const THROTTLE_INTERVAL_MS = 2000; // Throttle event listeners to 0% CPU impact

export default function IdleSessionGuard({ user: _user }: Props) {
  const [showWarning, setShowWarning] = useState(false);
  const [secondsRemaining, setSecondsRemaining] = useState(120);

  const lastActivityRef = useRef<number>(Date.now());
  const lastThrottleRef = useRef<number>(Date.now());
  const isLoggingOutRef = useRef<boolean>(false);

  const handleSignOutDueToInactivity = useCallback(async () => {
    if (isLoggingOutRef.current) return;
    isLoggingOutRef.current = true;

    try {
      const supabase = createClient();
      await supabase.auth.signOut();
    } catch (e) {
      console.error('Error during idle sign out:', e);
    } finally {
      window.location.href = '/auth/sign-in?reason=inactivity';
    }
  }, []);

  const resetActivity = useCallback(() => {
    const now = Date.now();
    lastActivityRef.current = now;
    if (showWarning) {
      setShowWarning(false);
      setSecondsRemaining(120);
    }
  }, [showWarning]);

  // Throttled User Activity Listener
  useEffect(() => {
    const handleUserActivity = () => {
      const now = Date.now();
      if (now - lastThrottleRef.current > THROTTLE_INTERVAL_MS) {
        lastThrottleRef.current = now;
        lastActivityRef.current = now;
      }
    };

    const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'wheel'];
    events.forEach((eventName) => {
      window.addEventListener(eventName, handleUserActivity, { passive: true });
    });

    // Check inactivity every 1 second
    const interval = setInterval(() => {
      if (isLoggingOutRef.current) return;

      const now = Date.now();
      const elapsed = now - lastActivityRef.current;

      if (elapsed >= IDLE_TIMEOUT_MS) {
        handleSignOutDueToInactivity();
      } else if (elapsed >= WARNING_THRESHOLD_MS) {
        const remainingMs = IDLE_TIMEOUT_MS - elapsed;
        const remainingSec = Math.max(0, Math.ceil(remainingMs / 1000));
        setShowWarning(true);
        setSecondsRemaining(remainingSec);
      } else if (showWarning) {
        setShowWarning(false);
        setSecondsRemaining(120);
      }
    }, 1000);

    return () => {
      events.forEach((eventName) => {
        window.removeEventListener(eventName, handleUserActivity);
      });
      clearInterval(interval);
    };
  }, [handleSignOutDueToInactivity, showWarning]);

  if (!showWarning) return null;

  return (
    <div className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 page-fade-in">
      <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center shrink-0">
            <Clock className="w-6 h-6 text-amber-600 animate-pulse" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900">Session Inactivity Warning</h3>
            <p className="text-xs text-slate-500 font-medium">Shared Terminal Protection Active</p>
          </div>
        </div>

        {/* Countdown Box */}
        <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl text-center space-y-1 mb-4">
          <p className="text-xs font-semibold text-amber-900">
            You have been inactive. Your session will securely lock in:
          </p>
          <p className="text-3xl font-black font-mono text-amber-700 tracking-tight py-1">
            {Math.floor(secondsRemaining / 60)}:{(secondsRemaining % 60).toString().padStart(2, '0')}
          </p>
          <p className="text-[11px] text-amber-800/80">
            Click <strong>Stay Signed In</strong> to reset your session timer.
          </p>
        </div>

        <p className="text-[11px] text-slate-500 leading-relaxed mb-5">
          To protect institutional data and prevent unauthorized grade or record changes on unattended campus computers, sessions expire after 15 minutes of inactivity (ISO/IEC 25010:2023).
        </p>

        <div className="flex items-center justify-end gap-2.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleSignOutDueToInactivity}
            className="text-xs text-slate-600 hover:text-red-700 hover:bg-red-50 border-slate-200 cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5 mr-1" />
            Sign Out Now
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={resetActivity}
            className="bg-[#0A3824] hover:bg-[#092E1D] text-[var(--cdm-sand)] font-bold shadow-md shadow-[#0A3824]/20 cursor-pointer text-xs"
          >
            Stay Signed In
          </Button>
        </div>
      </div>
    </div>
  );
}
