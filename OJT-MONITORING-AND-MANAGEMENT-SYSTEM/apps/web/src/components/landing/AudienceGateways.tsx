'use client';

import React from 'react';
import Link from 'next/link';
import { 
  Monitor, 
  Cpu, 
  Briefcase, 
  TrendingUp, 
  ShieldCheck, 
  ArrowRight 
} from '@/src/components/ui/Icons';

export default function AudienceGateways() {
  const tracks = [
    {
      id: 'bsit',
      title: 'BS Information Technology',
      category: 'Institute of Computing Studies',
      description: 'Software solutions, system administration, network infrastructure, and IT technical practicum track.',
      icon: Monitor,
      iconBg: 'bg-emerald-50 text-emerald-700',
      badge: 'ICS Department',
      href: '/auth/register',
    },
    {
      id: 'bscpe',
      title: 'BS Computer Engineering',
      category: 'Institute of Computing Studies',
      description: 'Computer hardware, embedded systems, microcontrollers, and engineering technology practicum track.',
      icon: Cpu,
      iconBg: 'bg-teal-50 text-teal-700',
      badge: 'ICS Department',
      href: '/auth/register',
    },
    {
      id: 'bsba-hrm',
      title: 'BSBA - Human Resource Mgt.',
      category: 'Institute of Business & Entrepreneurship',
      description: 'Talent management, organizational development, corporate operations, and workplace training practicum.',
      icon: Briefcase,
      iconBg: 'bg-amber-50 text-amber-700',
      badge: 'IBE Department',
      href: '/auth/register',
    },
    {
      id: 'bs-entrep',
      title: 'BS Entrepreneurship',
      category: 'Institute of Business & Entrepreneurship',
      description: 'Business venture development, corporate operations, enterprise management, and innovation practicum.',
      icon: TrendingUp,
      iconBg: 'bg-orange-50 text-orange-700',
      badge: 'IBE Department',
      href: '/auth/register',
    },
    {
      id: 'portals',
      title: 'Stakeholder Role Portals',
      category: 'System Roles & Access',
      description: 'Web and desktop access for OJT Coordinators, Supervisors, and Super Admins. Students use the mobile app.',
      icon: ShieldCheck,
      iconBg: 'bg-slate-100 text-slate-800',
      badge: 'Coordinator • Supervisor • Super Admin',
      href: '/auth/sign-in',
    },
  ];

  return (
    <section id="programs" className="py-16 sm:py-20 bg-white border-b border-slate-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Section Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between mb-12">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="w-6 h-1 bg-[#0A3824] rounded-full" />
              <span className="text-xs uppercase font-extrabold tracking-widest text-[#0A3824]">
                ACADEMIC DEPARTMENTS
              </span>
            </div>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 font-serif tracking-tight">
              Approved Academic Programs
            </h2>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 max-w-md mt-2 md:mt-0">
            Dedicated 4th-Year practicum milestone tracking for the Institute of Computing Studies (ICS) and the Institute of Business &amp; Entrepreneurship (IBE).
          </p>
        </div>

        {/* 5-Column Responsive Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-5">
          {tracks.map((t) => {
            const Icon = t.icon;
            return (
              <div
                key={t.id}
                className="p-5 rounded-2xl bg-white border border-slate-200/90 shadow-2xs hover:shadow-xl hover:border-emerald-500/50 transition-all duration-200 flex flex-col justify-between group"
              >
                <div>
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-4 ${t.iconBg} group-hover:scale-105 transition-transform`}>
                    <Icon className="w-6 h-6" />
                  </div>

                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                    {t.category}
                  </span>

                  <h3 className="text-base font-bold text-slate-900 tracking-tight leading-snug group-hover:text-emerald-900 transition-colors">
                    {t.title}
                  </h3>

                  <p className="text-xs text-slate-500 mt-2.5 leading-relaxed">
                    {t.description}
                  </p>
                </div>

                <div className="mt-6 pt-3 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-[10px] font-bold text-slate-500 font-mono">
                    {t.badge}
                  </span>
                  <Link
                    href={t.href}
                    className="text-xs font-bold text-[#0A3824] group-hover:text-amber-600 flex items-center gap-1 transition-colors"
                  >
                    <span>{t.id === 'portals' ? 'Web Portals' : 'Student App Registration'}</span>
                    <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>

      </div>
    </section>
  );
}
