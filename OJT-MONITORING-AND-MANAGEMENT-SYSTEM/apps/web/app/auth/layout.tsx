import type { Metadata } from 'next';
import Image from 'next/image';
import PublicFooter from '@/src/components/layout/PublicFooter';

export const metadata: Metadata = {
  title: 'Portal Authentication',
  description: 'Secure authentication gateway for Colegio de Montalban OJT Practicum System.',
  robots: {
    index: false,
    follow: false,
    nocache: true,
  },
};

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col justify-between bg-[var(--background)]">
      <div className="flex-1 flex flex-col lg:flex-row w-full">
        {/* LEFT SIDE: Institutional Identity & Atmosphere */}
        <div className="lg:w-[54%] xl:w-[58%] relative flex flex-col justify-between p-8 sm:p-12 lg:p-16 bg-[#092E1D] text-white min-h-[340px] lg:min-h-screen overflow-hidden select-none border-r border-emerald-950/40">
          {/* Subtle radial ambient glow */}
          <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-emerald-700/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-amber-500/5 rounded-full blur-3xl pointer-events-none" />

          {/* Top: Institutional Brand */}
          <div className="relative z-10 flex items-center gap-4">
            <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-white/10 p-2 border border-amber-400/30 shadow-xs flex items-center justify-center shrink-0">
              <Image
                src="/logo.png"
                alt="Colegio de Montalban Seal"
                width={56}
                height={56}
                className="w-full h-full object-contain"
                priority
              />
            </div>
            <div>
              <span className="text-[10px] uppercase tracking-widest font-bold text-amber-400 block mb-0.5">
                Official Practicum Portal
              </span>
              <span className="text-xl sm:text-2xl font-black text-white font-serif tracking-tight block">
                Colegio de Montalban
              </span>
              <p className="text-xs text-slate-300 font-medium tracking-wide mt-0.5">
                Institute of Computing Studies &bull; Institute of Business and Entrepreneurship
              </p>
            </div>
          </div>

          {/* Center: Inspiring Academic Statement */}
          <div className="relative z-10 my-10 lg:my-auto max-w-lg space-y-3">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-950/80 border border-emerald-500/30 text-[11px] font-semibold text-emerald-300">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>Academic Year Practicum Management</span>
            </div>
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-white leading-tight font-serif tracking-tight">
              Empowering the Next Generation of Industry Leaders
            </h2>
            <p className="text-xs sm:text-sm text-slate-300 font-normal leading-relaxed">
              A unified, cross-platform OJT monitoring system ensuring authentic milestone verification, punctuality tracking, and academic compliance for graduating students.
            </p>
          </div>

          {/* Bottom Left: Legal & Campus Compliance Footnote */}
          <div className="relative z-10 pt-4 border-t border-white/10 text-[11px] text-slate-400 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <span>Rodriguez, Rizal</span>
              <span className="mx-2 text-slate-600">&bull;</span>
              <span>Kasiglahan Village</span>
            </div>
            <div className="text-slate-300 font-medium">
              RA 10173 (Data Privacy) &bull; ISO/IEC 25010:2023
            </div>
          </div>
        </div>

        {/* RIGHT SIDE: Focused Action Zone */}
        <div className="lg:w-[46%] xl:w-[42%] bg-white flex flex-col justify-between p-6 sm:p-10 lg:p-12 min-h-[520px] lg:min-h-screen relative z-10">
          {/* Top Right Status Bar */}
          <div className="flex items-center justify-between text-xs text-slate-400 pb-4">
            <span className="font-semibold text-slate-500 text-[11px]">CdM Portal v1.2.0</span>
            <span className="inline-flex items-center gap-1.5 text-[10px] font-bold text-emerald-800 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200/80">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              Institutional Access
            </span>
          </div>

          {/* Form Container */}
          <div className="w-full max-w-sm mx-auto my-auto py-4">
            {children}
          </div>

          {/* Minimalist Footnote */}
          <div className="pt-4 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-2 text-[11px] text-slate-400">
            <span>Colegio de Montalban MIS</span>
            <div className="flex items-center gap-3">
              <a href="/downloads/CdM-OJT-Portal-Setup-1.0.0.exe" download className="hover:text-slate-700 transition-colors">
                Desktop App (.exe)
              </a>
              <span>&bull;</span>
              <a href="mailto:mis@cdm.edu.ph" className="hover:text-slate-700 transition-colors">
                Support
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* Interactive Multi-Column Directory Footer with Modals (Guides, Privacy, Terms, ISO Evaluator Docs) */}
      <PublicFooter />
    </div>
  );
}
