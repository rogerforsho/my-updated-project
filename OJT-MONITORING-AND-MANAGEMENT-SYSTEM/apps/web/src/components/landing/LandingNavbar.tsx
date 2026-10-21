'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Menu, Shield, ChevronDown, Lock, Download } from '@/src/components/ui/Icons';

interface LandingNavbarProps {
  onOpenAccessPortal: () => void;
}

export default function LandingNavbar({ onOpenAccessPortal }: LandingNavbarProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [verificationOpen, setVerificationOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 w-full bg-[#092E1D]/95 backdrop-blur-md border-b border-emerald-950/60 transition-all">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-20">
          
          {/* LEFT: Logo + Brand + Left-Aligned Navigation Links */}
          <div className="flex items-center gap-8 xl:gap-10 min-w-0">
            {/* Brand Logo & Title */}
            <Link href="#hero" className="flex items-center gap-3 group shrink-0">
              <div className="w-11 h-11 rounded-xl bg-white/10 p-1.5 border border-amber-400/30 flex items-center justify-center shrink-0 group-hover:border-amber-400 transition-colors shadow-xs">
                <Image
                  src="/logo.png"
                  alt="Colegio de Montalban Seal"
                  width={38}
                  height={38}
                  className="object-contain"
                  priority
                />
              </div>
              <div className="flex flex-col justify-center">
                <span className="text-[10px] uppercase font-bold tracking-widest text-amber-400 leading-tight">
                  Practicum Management Portal
                </span>
                <span className="text-lg font-black text-white font-serif tracking-tight leading-tight group-hover:text-amber-300 transition-colors">
                  Colegio de Montalban
                </span>
              </div>
            </Link>

            {/* Main Navigation Links (Left-aligned next to logo) */}
            <nav className="hidden lg:flex items-center gap-1 xl:gap-2">
              <a
                href="#hero"
                className="px-3.5 py-2 text-sm font-bold text-slate-100 hover:text-[var(--cdm-sand)] hover:bg-white/5 rounded-lg transition-colors"
              >
                Home
              </a>
              <a
                href="#programs"
                className="px-3.5 py-2 text-sm font-bold text-slate-100 hover:text-[var(--cdm-sand)] hover:bg-white/5 rounded-lg transition-colors"
              >
                Academic Programs
              </a>
              <a
                href="#capabilities"
                className="px-3.5 py-2 text-sm font-bold text-slate-100 hover:text-[var(--cdm-sand)] hover:bg-white/5 rounded-lg transition-colors"
              >
                Capabilities
              </a>

              {/* Combined Verification Dropdown */}
              <div
                className="relative"
                onMouseEnter={() => setVerificationOpen(true)}
                onMouseLeave={() => setVerificationOpen(false)}
              >
                <button
                  type="button"
                  onClick={() => setVerificationOpen((prev) => !prev)}
                  className="px-3.5 py-2 text-sm font-bold text-slate-100 hover:text-[var(--cdm-sand)] hover:bg-white/5 rounded-lg transition-colors inline-flex items-center gap-1.5 cursor-pointer"
                  aria-expanded={verificationOpen}
                >
                  <Shield className="w-4 h-4 text-emerald-400" />
                  <span>Verification</span>
                  <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${verificationOpen ? 'rotate-180 text-[var(--cdm-sand)]' : 'text-slate-400'}`} />
                </button>

                {verificationOpen && (
                  <div className="absolute top-full left-0 mt-1 w-64 rounded-xl bg-[#092E1D] border border-emerald-800/80 shadow-2xl p-1.5 space-y-1 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
                    <Link
                      href="/verify-certificate/search"
                      onClick={() => setVerificationOpen(false)}
                      className="flex items-start gap-2.5 p-2.5 rounded-lg hover:bg-white/10 transition-colors group"
                    >
                      <div className="w-7 h-7 rounded-lg bg-emerald-900/60 text-[var(--cdm-sand)] flex items-center justify-center shrink-0 border border-emerald-700/50 mt-0.5">
                        <Shield className="w-3.5 h-3.5" />
                      </div>
                      <div>
                        <span className="text-xs font-bold text-white group-hover:text-[var(--cdm-sand)] block">
                          Verify Certificate
                        </span>
                        <span className="text-[10px] text-slate-300 block">
                          Authenticate student certificate by code
                        </span>
                      </div>
                    </Link>

                    <a
                      href="#resources"
                      onClick={() => setVerificationOpen(false)}
                      className="flex items-start gap-2.5 p-2.5 rounded-lg hover:bg-white/10 transition-colors group"
                    >
                      <div className="w-7 h-7 rounded-lg bg-white/10 text-emerald-300 flex items-center justify-center shrink-0 border border-white/10 mt-0.5">
                        <Download className="w-3.5 h-3.5" />
                      </div>
                      <div>
                        <span className="text-xs font-bold text-white group-hover:text-[var(--cdm-sand)] block">
                          Downloads &amp; Tools
                        </span>
                        <span className="text-[10px] text-slate-300 block">
                          Windows desktop client &amp; mobile guide
                        </span>
                      </div>
                    </a>
                  </div>
                )}
              </div>
            </nav>
          </div>

          {/* RIGHT: Refined Yellow Button & Mobile Toggle */}
          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={onOpenAccessPortal}
              className="h-10 px-4 sm:px-5 rounded-xl bg-[var(--cdm-sand)] hover:bg-amber-400 active:scale-98 text-slate-950 font-extrabold text-xs sm:text-sm flex items-center justify-center gap-2 leading-none transition-all shadow-md shadow-amber-500/10 cursor-pointer"
            >
              <Lock className="w-3.5 h-3.5 text-slate-900 shrink-0" />
              <span className="inline-block pt-0.5">Access Portal</span>
              <ChevronDown className="w-3 h-3 text-slate-900 shrink-0" />
            </button>

            {/* Mobile Hamburger Toggle */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 rounded-xl text-slate-300 hover:text-white hover:bg-white/10 lg:hidden transition-colors"
              aria-label="Toggle navigation menu"
            >
              <Menu className="w-6 h-6" />
            </button>
          </div>

        </div>
      </div>

      {/* MOBILE DRAWER */}
      {mobileMenuOpen && (
        <div className="lg:hidden border-t border-emerald-950/80 bg-[#092E1D] px-4 py-5 space-y-3 animate-in slide-in-from-top-2 duration-150">
          <div className="space-y-1">
            <a
              href="#hero"
              onClick={() => setMobileMenuOpen(false)}
              className="block px-3 py-2 text-sm font-bold text-slate-100 hover:text-[var(--cdm-sand)] hover:bg-white/10 rounded-lg transition-colors"
            >
              Home
            </a>
            <a
              href="#programs"
              onClick={() => setMobileMenuOpen(false)}
              className="block px-3 py-2 text-sm font-bold text-slate-100 hover:text-[var(--cdm-sand)] hover:bg-white/10 rounded-lg transition-colors"
            >
              Academic Programs
            </a>
            <a
              href="#capabilities"
              onClick={() => setMobileMenuOpen(false)}
              className="block px-3 py-2 text-sm font-bold text-slate-100 hover:text-[var(--cdm-sand)] hover:bg-white/10 rounded-lg transition-colors"
            >
              Capabilities
            </a>
            <Link
              href="/verify-certificate/search"
              onClick={() => setMobileMenuOpen(false)}
              className="block px-3 py-2 text-sm font-bold text-emerald-300 hover:text-[var(--cdm-sand)] hover:bg-white/10 rounded-lg transition-colors"
            >
              Verify Certificate
            </Link>
            <a
              href="#resources"
              onClick={() => setMobileMenuOpen(false)}
              className="block px-3 py-2 text-sm font-bold text-slate-200 hover:text-[var(--cdm-sand)] hover:bg-white/10 rounded-lg transition-colors"
            >
              Downloads &amp; Tools
            </a>
          </div>

          <div className="pt-3 border-t border-emerald-900/40 space-y-2">
            <button
              onClick={() => {
                setMobileMenuOpen(false);
                onOpenAccessPortal();
              }}
              className="w-full h-11 flex items-center justify-center gap-2 rounded-xl bg-[var(--cdm-sand)] text-slate-950 font-bold text-sm shadow-md cursor-pointer"
            >
              <Lock className="w-4 h-4" />
              <span>Launch Sign In Portal</span>
            </button>
            <a
              href="/downloads/CdM-OJT-Portal-Setup-1.0.0.exe"
              download
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-white/10 text-slate-300 text-xs font-semibold hover:bg-white/5"
            >
              Download Windows Desktop App
            </a>
          </div>
        </div>
      )}
    </header>
  );
}
