'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useDesktop } from '@/src/hooks/useDesktop';
import SoftForestLanding from '@/src/components/landing/SoftForestLanding';
import AccessPortalModal from '@/src/components/landing/AccessPortalModal';

export default function LandingPageClient() {
  const [accessModalOpen, setAccessModalOpen] = useState(false);
  const { isDesktop } = useDesktop();
  const router = useRouter();

  useEffect(() => {
    if (isDesktop) {
      router.replace('/auth/sign-in');
    }
  }, [isDesktop, router]);

  if (isDesktop) {
    return (
      <div className="min-h-screen bg-[var(--cdm-dark)] flex items-center justify-center text-white font-sans">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-4 border-[var(--cdm-sand)] border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-xs text-white/75 font-medium">Opening CdM OJT Portal...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)] font-sans selection:bg-[#E4DBC4] selection:text-[#092E1D]">
      <SoftForestLanding onOpenAccessPortal={() => setAccessModalOpen(true)} />
      <AccessPortalModal
        isOpen={accessModalOpen}
        onClose={() => setAccessModalOpen(false)}
      />
    </div>
  );
}
