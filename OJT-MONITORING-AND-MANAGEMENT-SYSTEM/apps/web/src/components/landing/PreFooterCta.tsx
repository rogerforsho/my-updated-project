'use client';

import React from 'react';
import { ArrowRight, Shield } from '@/src/components/ui/Icons';

interface PreFooterCtaProps {
  onOpenAccessPortal: () => void;
}

export default function PreFooterCta({ onOpenAccessPortal }: PreFooterCtaProps) {
  return (
    <section className="py-14 sm:py-16 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Banner matching reference layout */}
        <div className="rounded-3xl bg-[#092E1D] text-white p-8 sm:p-12 shadow-2xl border border-emerald-950 flex flex-col lg:flex-row items-center justify-between gap-8 relative overflow-hidden">
          {/* Subtle glow */}
          <div className="absolute top-0 right-0 w-80 h-80 bg-emerald-600/10 rounded-full blur-3xl pointer-events-none" />

          <div className="space-y-2 text-center lg:text-left max-w-2xl relative z-10">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-950/90 text-amber-400 text-xs font-bold border border-emerald-800/60">
              <Shield className="w-3.5 h-3.5" />
              <span>Colegio de Montalban Institutional Portal</span>
            </div>
            <h3 className="text-2xl sm:text-3xl font-black font-serif tracking-tight text-white">
              Ready to Access Your Practicum Portal?
            </h3>
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed font-normal">
              Experience authentic GPS satellite attendance verification, digital weekly journal submissions, and real-time supervisor evaluations.
            </p>
          </div>

          <div className="relative z-10 shrink-0">
            <button
              onClick={onOpenAccessPortal}
              className="px-8 py-4 rounded-xl bg-[var(--cdm-sand)] hover:bg-amber-400 active:scale-98 text-slate-950 font-black text-sm shadow-xl transition-all flex items-center gap-2.5 cursor-pointer"
            >
              <span>Access Portal Now</span>
              <ArrowRight className="w-4 h-4 text-slate-950" />
            </button>
          </div>

        </div>

      </div>
    </section>
  );
}
