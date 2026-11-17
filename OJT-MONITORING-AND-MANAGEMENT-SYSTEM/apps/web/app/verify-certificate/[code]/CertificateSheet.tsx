'use client';

import { useState } from 'react';
import { Playfair_Display } from 'next/font/google';
import { Shield, Building, Clock, Award, FileText } from '@/src/components/ui/Icons';

const serif = Playfair_Display({ subsets: ['latin'], weight: ['500', '700', '800'] });

const GREEN = '#1B4332';
const GOLD = '#B08D57';
const PARCHMENT = '#FAF6EC';

export interface CertificateView {
  student_name: string;
  student_number: string;
  course: string;
  host_company_name: string;
  hours: string;
  academic_year: string;
  issued: string;
  serial: string;
}

// Browsers print only what is visible; this makes "Download PDF" (print -> Save as PDF) a clean A4 landscape page.
const PRINT_CSS = `
@page { size: A4 landscape; margin: 0; }
@media print {
  html, body { background: ${PARCHMENT} !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .no-print { display: none !important; }
  .cert-sheet { box-shadow: none !important; margin: 0 auto !important; max-width: 100% !important; }
}`;

function Crest() {
  // shortcut: text placeholder for the official crest, swap for the school's image file when supplied.
  return (
    <div
      style={{ borderColor: GOLD, color: GOLD }}
      className="w-16 h-16 rounded-full border-2 flex items-center justify-center text-[9px] font-bold tracking-widest text-center leading-tight shrink-0"
    >
      SCHOOL<br />CREST
    </div>
  );
}

function Seal() {
  const rays = Array.from({ length: 24 }, (_, i) => {
    const a = (i * Math.PI) / 12;
    const r = i % 2 ? 40 : 48;
    return `${i ? 'L' : 'M'}${50 + r * Math.cos(a)},${50 + r * Math.sin(a)}`;
  }).join('');
  return (
    <svg width="88" height="88" viewBox="0 0 100 100" aria-label="Official seal" className="shrink-0">
      <defs>
        <radialGradient id="foil" cx="35%" cy="30%" r="80%">
          <stop offset="0" stopColor="#E8D3A2" />
          <stop offset="0.5" stopColor={GOLD} />
          <stop offset="1" stopColor="#7C5F34" />
        </radialGradient>
      </defs>
      <path d={rays + 'Z'} fill="url(#foil)" />
      <circle cx="50" cy="50" r="31" fill="none" stroke="#FFF6DC" strokeWidth="1.5" />
      <path d="M36 51l10 10 18-21" fill="none" stroke="#FFF6DC" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Guilloche() {
  const radii = [22, 17, 12, 7];
  return (
    <svg className="absolute inset-0 w-full h-full pointer-events-none" aria-hidden>
      <defs>
        <pattern id="guilloche" width="48" height="48" patternUnits="userSpaceOnUse">
          {radii.map((r) => (
            <g key={r} fill="none" stroke={GOLD} strokeOpacity="0.16">
              <ellipse cx="24" cy="24" rx={r} ry={r * 0.55} />
              <ellipse cx="24" cy="24" rx={r * 0.55} ry={r} />
            </g>
          ))}
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#guilloche)" />
    </svg>
  );
}

export default function CertificateSheet({ cert, qrSvg, verifyUrl }: { cert: CertificateView; qrSvg: string; verifyUrl: string }) {
  const [copied, setCopied] = useState(false);
  const btn = 'px-3 py-1.5 rounded border text-[11px] font-semibold';

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(cert.serial);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard can be blocked (insecure origin / permissions); the serial is still visible to select.
    }
  };

  const details = [
    { icon: Building, label: 'Host Training Establishment', value: cert.host_company_name },
    { icon: Clock, label: 'Rendered Practicum Hours', value: `${cert.hours} Hours Verified` },
    { icon: Award, label: 'Academic Term', value: `A.Y. ${cert.academic_year}` },
    { icon: FileText, label: 'Date of Official Issuance', value: cert.issued },
  ];

  return (
    <div className="cert-sheet relative w-full max-w-4xl mx-auto shadow-2xl p-3" style={{ background: PARCHMENT, border: `3px solid ${GREEN}` }}>
      <style>{PRINT_CSS}</style>
      <div className="p-1" style={{ border: `1px solid ${GOLD}` }}>
        <div className="relative px-6 sm:px-14 py-8 overflow-hidden" style={{ border: `1px solid ${GREEN}` }}>
          <Guilloche />
          <div className="relative flex flex-col items-center text-center gap-3">
            <Crest />
            <p className="text-[11px] font-bold uppercase tracking-[0.3em]" style={{ color: GOLD }}>Colegio de Montalban</p>
            <h1 className={`${serif.className} text-3xl sm:text-4xl font-bold`} style={{ color: GREEN }}>Certificate of Practicum Completion</h1>
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wider border"
              style={{ color: GREEN, borderColor: GOLD, background: '#fff8e6' }}
            >
              <Shield className="w-3.5 h-3.5" /> Cryptographically Verified &amp; Registered
            </span>
            <p className="text-xs text-slate-600 mt-3">This is to certify that</p>
            <h2 className={`${serif.className} text-4xl sm:text-5xl font-extrabold`} style={{ color: GREEN }}>{cert.student_name}</h2>
            <div className="h-px w-40" style={{ background: GOLD }} />
            <p className="text-xs font-mono text-slate-600">{cert.student_number} • {cert.course}</p>
            <p className="text-xs text-slate-600 max-w-md">has satisfactorily completed the required On-the-Job Training practicum with the following record.</p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full mt-3 text-left">
              {details.map(({ icon: Icon, label, value }) => (
                <div key={label} className="rounded-lg bg-white/70 p-3" style={{ border: `1px solid ${GOLD}66` }}>
                  <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                    <Icon className="w-3.5 h-3.5" style={{ color: GOLD }} /> {label}
                  </div>
                  <p className="font-semibold text-sm mt-1" style={{ color: GREEN }}>{value}</p>
                </div>
              ))}
            </div>

            <div className="flex items-end gap-6 w-full mt-6">
              <div className="flex justify-between gap-10 w-full">
                {['Practicum Coordinator', 'Dean / College Registrar'].map((title) => (
                  <div key={title} className="flex-1 text-center">
                    <div className="h-9" />
                    <div className="border-t" style={{ borderColor: GREEN }} />
                    <p className="text-[11px] font-semibold mt-1" style={{ color: GREEN }}>{title}</p>
                    <p className="text-[9px] text-slate-500">Colegio de Montalban</p>
                  </div>
                ))}
              </div>
              <Seal />
            </div>

            <div className="w-full mt-5 pt-3 flex flex-wrap items-center justify-between gap-3 border-t" style={{ borderColor: GOLD }}>
              <div className="flex items-center gap-3 text-left">
                <a href={verifyUrl} aria-label="Open this certificate's verification page" className="block w-[72px] h-[72px] bg-white border border-slate-300 p-0.5 shrink-0" dangerouslySetInnerHTML={{ __html: qrSvg }} />
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-slate-500">Verification Serial</p>
                  <p className="font-mono font-bold text-sm" style={{ color: GREEN }}>{cert.serial}</p>
                </div>
              </div>
              <div className="no-print flex gap-2">
                <button className={`${btn} hover:bg-black/5`} style={{ borderColor: GREEN, color: GREEN }} onClick={copy}>
                  {copied ? 'Copied ✓' : 'Copy Serial'}
                </button>
                <button className={`${btn} text-white hover:opacity-90`} style={{ background: GREEN, borderColor: GREEN }} onClick={() => window.print()}>
                  Download PDF
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
