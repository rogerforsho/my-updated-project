'use client';

import React from 'react';
import Image from 'next/image';
import { Check, MapPin, ArrowRight } from '@/src/components/ui/Icons';

export default function ComplianceFramework() {
  const values = [
    {
      title: 'Point-in-Time GPS Location Verification',
      description: 'Trainee clock-ins capture point-in-time satellite GPS coordinates and selfie evidence for supervisor verification, accommodating on-site and field duties.',
    },
    {
      title: 'Offline Attendance Logging with Auto-Sync',
      description: 'Mobile attendance logging functions reliably without internet access, storing records locally and synchronizing once reconnected.',
    },
    {
      title: 'Automated Rendered-Hour Computation',
      description: 'Tracks progress towards the 486 required hours with automated daily calculation and OJT Coordinator verification.',
    },
    {
      title: 'Standardized 5-Point Evaluation Rubrics',
      description: 'Company supervisors evaluate student technical competencies, punctuality, and work ethics directly through digital rubrics.',
    },
  ];

  return (
    <section id="capabilities" className="py-16 sm:py-20 bg-slate-50 border-b border-slate-200 overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-10 items-center">
          
          {/* LEFT: Authentic Colegio de Montalban Campus Building Image with Floating Badge */}
          <div className="lg:col-span-6 relative">
            <div className="relative mx-auto max-w-lg lg:max-w-none">
              
              <div className="relative rounded-3xl overflow-hidden shadow-xl border-4 border-white bg-slate-200 aspect-[16/10]">
                <Image
                  src="/cdm-building.png"
                  alt="Colegio de Montalban Main Campus Building"
                  width={800}
                  height={500}
                  className="w-full h-full object-cover"
                />
                
                {/* Subtle dark gradient overlay at bottom */}
                <div className="absolute inset-0 bg-gradient-to-t from-[#092E1D]/80 via-transparent to-transparent pointer-events-none" />

                <div className="absolute bottom-4 left-4 right-4 text-white">
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-950/90 text-amber-300 text-[10px] font-bold border border-emerald-700/50 mb-1">
                    <MapPin className="w-3 h-3 text-emerald-400" />
                    <span>Rodriguez, Rizal &bull; Kasiglahan Village</span>
                  </div>
                  <p className="text-sm font-bold text-white font-serif">
                    Colegio de Montalban
                  </p>
                  <p className="text-[11px] text-slate-200">
                    Institute of Computing Studies &bull; Institute of Business &amp; Entrepreneurship
                  </p>
                </div>
              </div>

              {/* FLOATING BADGE */}
              <div className="absolute -bottom-4 -right-2 sm:-bottom-5 sm:-right-4 bg-[var(--cdm-sand)] text-slate-950 rounded-2xl p-4 shadow-xl border-2 border-white flex flex-col items-center justify-center text-center">
                <span className="text-2xl sm:text-3xl font-black font-mono leading-none">
                  ISO
                </span>
                <span className="text-[10px] font-extrabold uppercase tracking-wider mt-1">
                  25010:2023<br />Evaluated
                </span>
              </div>

            </div>
          </div>

          {/* RIGHT: Core Values & Capabilities */}
          <div className="lg:col-span-6 space-y-6">
            
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="w-6 h-1 bg-[#0A3824] rounded-full" />
                <span className="text-xs uppercase font-extrabold tracking-widest text-[#0A3824]">
                  PRACTICUM MONITORING
                </span>
              </div>
              <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-950 font-serif tracking-tight leading-tight">
                Authentic Verification.<br />
                <span className="text-[#0A3824]">Accurate Hour Tracking.</span>
              </h2>
            </div>

            <p className="text-sm sm:text-base text-slate-600 leading-relaxed font-normal">
              Designed specifically for 4th-year students of Colegio de Montalban, this cross-platform system replaces physical paper timesheets with GPS satellite verification, selfie capture, automated hour computation, and digital supervisor evaluations.
            </p>

            {/* Checklist of 4 Core Pillars */}
            <div className="space-y-3.5 pt-1">
              {values.map((v) => (
                <div key={v.title} className="flex items-start gap-3">
                  <div className="w-5 h-5 rounded-full bg-emerald-800 text-white flex items-center justify-center shrink-0 mt-0.5 shadow-2xs">
                    <Check className="w-3.5 h-3.5 stroke-[3]" />
                  </div>
                  <div>
                    <h3 className="text-xs sm:text-sm font-bold text-slate-900 leading-snug">
                      {v.title}
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                      {v.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            <div className="pt-2">
              <a
                href="#resources"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-[#092E1D] hover:bg-[#0A3824] text-white font-bold text-xs sm:text-sm shadow-md transition-colors"
              >
                <span>Downloads &amp; Verification</span>
                <ArrowRight className="w-4 h-4 text-amber-400" />
              </a>
            </div>

          </div>

        </div>

      </div>
    </section>
  );
}
