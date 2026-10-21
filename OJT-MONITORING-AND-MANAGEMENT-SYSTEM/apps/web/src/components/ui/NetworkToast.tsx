'use client';

import { useEffect, useState } from 'react';

export default function NetworkToast() {
  const [isOffline, setIsOffline] = useState(false);
  const [isSlow, setIsSlow] = useState(false);

  useEffect(() => {
    function handleOnline() {
      setIsOffline(false);
    }
    function handleOffline() {
      setIsOffline(true);
    }

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Custom window event for slow requests
    function handleSlowRequest(e: Event) {
      const custom = e as CustomEvent<{ slow: boolean }>;
      setIsSlow(custom.detail?.slow ?? true);
    }

    window.addEventListener('ojt-slow-connection', handleSlowRequest);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('ojt-slow-connection', handleSlowRequest);
    };
  }, []);

  if (!isOffline && !isSlow) return null;

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[9999] transition-all duration-300 ease-out animate-bounce-subtle pointer-events-none">
      {isOffline ? (
        <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-full bg-red-900/90 text-white border border-red-500/30 shadow-xl backdrop-blur-md text-xs font-semibold">
          <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse" />
          <span>No internet connection. Please reconnect.</span>
        </div>
      ) : (
        <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-full bg-[#092E1D]/95 text-white border border-[var(--cdm-sand)]/40 shadow-2xl backdrop-blur-md text-xs font-medium">
          <span className="w-2 h-2 rounded-full bg-[var(--cdm-sand)] animate-ping" />
          <span>Slow connection detected, processing your request...</span>
        </div>
      )}
    </div>
  );
}
