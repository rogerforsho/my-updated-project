'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

export default function TopProgressBar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);

  const trickleInterval = useRef<NodeJS.Timeout | null>(null);
  const completeTimer = useRef<NodeJS.Timeout | null>(null);

  const startProgress = useCallback(() => {
    if (completeTimer.current) clearTimeout(completeTimer.current);
    if (trickleInterval.current) clearInterval(trickleInterval.current);

    setLoading(true);
    setProgress(20);

    // Trickle progress slowly up to 88% while waiting for page
    trickleInterval.current = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 88) {
          if (trickleInterval.current) clearInterval(trickleInterval.current);
          return 88;
        }
        const increment = Math.max(1, (88 - prev) * 0.15);
        return Math.min(88, prev + increment);
      });
    }, 150);
  }, []);

  const finishProgress = useCallback(() => {
    if (trickleInterval.current) clearInterval(trickleInterval.current);

    setProgress(100);
    completeTimer.current = setTimeout(() => {
      setLoading(false);
      setTimeout(() => setProgress(0), 200);
    }, 250);
  }, []);

  // Finish progress whenever pathname or searchParams change (Route complete)
  useEffect(() => {
    finishProgress();
  }, [pathname, searchParams, finishProgress]);

  // Global click interception for instant progress start on internal links
  useEffect(() => {
    const handleDocumentClick = (e: MouseEvent) => {
      const target = (e.target as HTMLElement)?.closest('a');
      if (!target) return;

      const href = target.getAttribute('href');
      const targetAttr = target.getAttribute('target');

      // Ignore external, download, hash-only, or new tab links
      if (
        !href ||
        href.startsWith('http') ||
        href.startsWith('mailto:') ||
        href.startsWith('tel:') ||
        href.startsWith('#') ||
        targetAttr === '_blank' ||
        e.ctrlKey ||
        e.metaKey ||
        e.shiftKey ||
        e.altKey
      ) {
        return;
      }

      // If navigating to a different path, start loading immediately on click!
      const currentUrl = window.location.pathname + window.location.search;
      if (href !== currentUrl && !href.startsWith(currentUrl + '#')) {
        startProgress();
      }
    };

    const handleCustomRouteStart = () => {
      startProgress();
    };

    document.addEventListener('click', handleDocumentClick, true);
    window.addEventListener('ojt-route-start', handleCustomRouteStart);

    return () => {
      document.removeEventListener('click', handleDocumentClick, true);
      window.removeEventListener('ojt-route-start', handleCustomRouteStart);
      if (trickleInterval.current) clearInterval(trickleInterval.current);
      if (completeTimer.current) clearTimeout(completeTimer.current);
    };
  }, [startProgress]);

  if (!loading && progress === 0) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[9999] h-[3px] bg-transparent pointer-events-none">
      <div
        className="h-full bg-gradient-to-r from-[#0A3824] via-[var(--cdm-sand)] to-[#0A3824] shadow-[0_0_10px_rgba(255,204,0,0.9)] transition-all ease-out"
        style={{
          width: `${progress}%`,
          transitionDuration: progress === 100 ? '150ms' : '200ms',
          opacity: loading ? 1 : 0,
        }}
      />
    </div>
  );
}
