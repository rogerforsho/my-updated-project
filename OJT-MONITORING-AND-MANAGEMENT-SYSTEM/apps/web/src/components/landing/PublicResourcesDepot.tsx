'use client';

import React from 'react';
import Link from 'next/link';
import { Download, Shield, ExternalLink, Monitor, Smartphone, CheckCircle2 } from '@/src/components/ui/Icons';

export default function PublicResourcesDepot() {
  return (
    <section id="resources" className="py-20 bg-white border-b border-slate-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Section Heading */}
        <div className="text-center max-w-3xl mx-auto space-y-3 mb-14">
          <div className="flex items-center justify-center gap-2">
            <span className="w-6 h-1 bg-[#0A3824] rounded-full" />
            <span className="text-xs uppercase font-extrabold tracking-widest text-[#0A3824]">
              OFFICIAL TOOLS &amp; VERIFICATION
            </span>
            <span className="w-6 h-1 bg-[#0A3824] rounded-full" />
          </div>
          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-slate-900 tracking-tight font-serif">
            System Applications &amp; Credential Verification
          </h2>
          <p className="text-sm sm:text-base text-slate-600 leading-relaxed">
            Access official client applications for the Colegio de Montalban OJT system and verify student completion certificates.
          </p>
        </div>

        {/* 3 Real Utility Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          
          {/* 1. Desktop Client */}
          <div className="p-6 rounded-2xl bg-slate-50 border border-slate-200/90 hover:border-emerald-400 hover:shadow-md transition-all flex flex-col justify-between">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-900">
                  v1.0.0 Production
                </span>
                <span className="text-[11px] font-mono text-slate-400">
                  EXE (Windows)
                </span>
              </div>

              <div className="w-10 h-10 rounded-xl bg-[#0A3824] text-[var(--cdm-sand)] flex items-center justify-center">
                <Monitor className="w-5 h-5" />
              </div>

              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                  Desktop Software
                </span>
                <h3 className="text-base font-bold text-slate-900 leading-snug">
                  Windows Desktop Application
                </h3>
              </div>

              <p className="text-xs text-slate-600 leading-relaxed">
                Standalone Windows desktop wrapper for OJT Coordinator, admins, and supervisors with background system tray integration.
              </p>
            </div>

            <div className="pt-5 mt-4 border-t border-slate-200/60">
              <a
                href="/downloads/CdM-OJT-Portal-Setup-1.0.0.exe"
                download
                className="w-full py-2.5 px-3.5 rounded-xl bg-[#092E1D] hover:bg-[#0A3824] text-white font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-xs"
              >
                <Download className="w-3.5 h-3.5 text-amber-400" />
                <span>Download Desktop Client (.exe)</span>
              </a>
            </div>
          </div>

          {/* 2. Mobile App */}
          <div className="p-6 rounded-2xl bg-slate-50 border border-slate-200/90 hover:border-emerald-400 hover:shadow-md transition-all flex flex-col justify-between">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-900">
                  React Native / Expo Go
                </span>
                <span className="text-[11px] font-mono text-slate-400">
                  Mobile App
                </span>
              </div>

              <div className="w-10 h-10 rounded-xl bg-blue-900 text-white flex items-center justify-center">
                <Smartphone className="w-5 h-5" />
              </div>

              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                  Student Trainee Client
                </span>
                <h3 className="text-base font-bold text-slate-900 leading-snug">
                  Mobile Attendance Companion
                </h3>
              </div>

              <p className="text-xs text-slate-600 leading-relaxed">
                Student mobile application with satellite GPS radius verification, selfie check-in, and offline attendance synchronization.
              </p>
            </div>

            <div className="pt-5 mt-4 border-t border-slate-200/60">
              <div className="w-full py-2.5 px-3.5 rounded-xl bg-blue-50 border border-blue-200 text-blue-900 font-semibold text-xs flex items-center justify-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-blue-700" />
                <span>Runs via Expo / Android APK</span>
              </div>
            </div>
          </div>

          {/* 3. Certificate Verification Search */}
          <div className="p-6 rounded-2xl bg-slate-50 border border-slate-200/90 hover:border-emerald-400 hover:shadow-md transition-all flex flex-col justify-between">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-900">
                  Public Search
                </span>
                <span className="text-[11px] font-mono text-slate-400">
                  Live Verification
                </span>
              </div>

              <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-900 flex items-center justify-center">
                <Shield className="w-5 h-5" />
              </div>

              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                  Academic Credentials
                </span>
                <h3 className="text-base font-bold text-slate-900 leading-snug">
                  Verify Practicum Certificate
                </h3>
              </div>

              <p className="text-xs text-slate-600 leading-relaxed">
                Employers and third parties can verify the authenticity of a student&apos;s Certificate of Completion using the unique verification code.
              </p>
            </div>

            <div className="pt-5 mt-4 border-t border-slate-200/60">
              <Link
                href="/verify-certificate/search"
                className="w-full py-2.5 px-3.5 rounded-xl bg-[#0A3824] hover:bg-[#092E1D] text-[var(--cdm-sand)] font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-xs"
              >
                <span>Open Verification Search</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>

        </div>

      </div>
    </section>
  );
}
