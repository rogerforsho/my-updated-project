'use client';

import React, { useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { User, Users, Building2, ArrowRight, Shield } from '@/src/components/ui/Icons';

interface AccessPortalModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function AccessPortalModal({ isOpen, onClose }: AccessPortalModalProps) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const gateways = [
    {
      role: 'OJT Student',
      badge: '4th-Year ICS & IBE',
      description: 'Register, sign in, and complete OJT workflows in the CdM OJT Mobile App. Students do not use the web or desktop portal.',
      href: '/auth/register',
      icon: User,
      color: 'border-emerald-500/40 hover:border-emerald-500 bg-emerald-50/40',
      badgeColor: 'bg-emerald-100 text-emerald-800',
      btnColor: 'bg-emerald-800 hover:bg-emerald-900 text-white',
    },
    {
      role: 'OJT Coordinator',
      badge: 'Academic Administration',
      description: 'Review registrations, gateway documents, placements, attendance exceptions, academic progress, and final grades within assigned departments.',
      href: '/auth/sign-in?role=coordinator',
      icon: Users,
      color: 'border-emerald-500/40 hover:border-emerald-500 bg-emerald-50/40',
      badgeColor: 'bg-emerald-100 text-emerald-800',
      btnColor: 'bg-emerald-800 hover:bg-emerald-900 text-white',
    },
    {
      role: 'Company Supervisor',
      badge: 'Host Training Establishment',
      description: 'Review attendance and daily reports for assigned students, and submit midterm and final evaluations.',
      href: '/auth/sign-in?role=supervisor',
      icon: Building2,
      color: 'border-emerald-500/40 hover:border-emerald-500 bg-emerald-50/40',
      badgeColor: 'bg-emerald-100 text-emerald-800',
      btnColor: 'bg-emerald-800 hover:bg-emerald-900 text-white',
    },
    {
      role: 'Super Admin',
      badge: 'System Administration',
      description: 'Manage account access and system configuration, and review security audit metadata. Multi-factor authentication is required.',
      href: '/auth/sign-in?role=admin',
      icon: Shield,
      color: 'border-slate-300 hover:border-slate-500 bg-slate-50/60',
      badgeColor: 'bg-slate-200 text-slate-800',
      btnColor: 'bg-slate-800 hover:bg-slate-900 text-white',
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div 
        className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Top Header */}
        <div className="bg-[#092E1D] px-6 py-5 text-white flex items-center justify-between border-b border-emerald-950">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 p-1.5 border border-amber-400/30 flex items-center justify-center">
              <Image src="/logo.png" alt="CdM" width={36} height={36} className="object-contain" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#E4DBC4]">Institutional Access</span>
                <span className="text-[10px] text-emerald-300 font-mono flex items-center gap-1">
                  <Shield className="w-3 h-3" /> Secure Gateway
                </span>
              </div>
              <h2 className="text-base sm:text-lg font-black tracking-tight font-serif text-white">
                Select Your Practicum Channel
              </h2>
            </div>
          </div>

          <button
            onClick={onClose}
            aria-label="Close modal"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-300 hover:text-white hover:bg-white/10 transition-colors"
          >
            &times;
          </button>
        </div>

        {/* Channels List */}
        <div className="p-6 space-y-3.5 bg-slate-50/60 max-h-[75vh] overflow-y-auto">
          {gateways.map((g) => {
            const Icon = g.icon;
            return (
              <Link
                key={g.role}
                href={g.href}
                onClick={onClose}
                className={`group block p-4 sm:p-5 rounded-xl border bg-white shadow-xs hover:shadow-md transition-all duration-150 ${g.color}`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3.5">
                    <div className="w-11 h-11 rounded-xl bg-slate-100 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform text-slate-700">
                      <Icon className="w-5 h-5" />
                    </div>
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-base font-bold text-slate-900 group-hover:text-emerald-900 transition-colors">
                          {g.role}
                        </h3>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${g.badgeColor}`}>
                          {g.badge}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 leading-relaxed max-w-md">
                        {g.description}
                      </p>
                    </div>
                  </div>

                  <div className={`shrink-0 w-8 h-8 rounded-lg flex items-center justify-center ${g.btnColor} shadow-xs group-hover:translate-x-0.5 transition-transform`}>
                    <ArrowRight className="w-4 h-4 text-white" />
                  </div>
                </div>
              </Link>
            );
          })}
        </div>

        {/* Modal Footnote */}
        <div className="px-6 py-3.5 bg-white border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
          <span>Need technical assistance?</span>
          <a href="mailto:ojt-support@cdm.edu.ph" className="text-emerald-800 font-semibold hover:underline">
            Contact MIS Helpdesk
          </a>
        </div>
      </div>
    </div>
  );
}
