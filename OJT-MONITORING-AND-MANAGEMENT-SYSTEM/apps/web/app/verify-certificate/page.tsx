'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { Shield, ArrowRight, ArrowLeft, Search } from '@/src/components/ui/Icons';
import Input from '@/src/components/ui/Input';
import Button from '@/src/components/ui/Button';
import Alert from '@/src/components/ui/Alert';

export default function CertificateSearchPage() {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    const cleanCode = code.trim().toUpperCase();
    if (!cleanCode) {
      setError('Please enter an official Certificate Verification Code.');
      return;
    }

    setLoading(true);
    router.push(`/verify-certificate/${encodeURIComponent(cleanCode)}`);
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col items-center justify-center p-4 sm:p-6 font-sans page-fade-in">
      <div className="w-full max-w-lg space-y-6">
        {/* Institutional Branding */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-[#092E1D] border border-amber-400/30 p-2 shadow-lg shadow-emerald-950/10 mx-auto">
            <Image
              src="/logo.png"
              alt="Colegio de Montalban"
              width={48}
              height={48}
              className="object-contain"
              priority
            />
          </div>

          <div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#0A3824]/10 text-[#0A3824] text-[11px] font-bold tracking-wider uppercase mb-1">
              <Shield className="w-3.5 h-3.5 text-emerald-800" />
              Public Credential Verification
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-slate-900 font-serif tracking-tight">
              Verify Practicum Certificate
            </h1>
            <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
              Authenticate official OJT Certificates of Completion issued by Colegio de Montalban for ICS & IBE graduates.
            </p>
          </div>
        </div>

        {/* Search Card */}
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xl shadow-slate-200/50 p-6 sm:p-8 space-y-5">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Input
                label="Certificate Verification Code"
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="e.g. CDM-OJT-2026-0001"
                required
                className="font-mono uppercase tracking-wider text-base"
              />
              <p className="text-[11px] text-slate-400 mt-1.5 flex items-center gap-1">
                <span>💡</span> Find this alphanumeric code printed on the bottom of the official Certificate of Completion.
              </p>
            </div>

            {error && <Alert type="error" message={error} />}

            <Button
              type="submit"
              loading={loading}
              className="w-full bg-[#0A3824] hover:bg-[#092E1D] text-[#D5B254] font-bold shadow-md shadow-[#0A3824]/20 py-3"
            >
              <Search className="w-4 h-4 mr-1.5" />
              Verify Authenticity
              <ArrowRight className="w-4 h-4 ml-1.5" />
            </Button>
          </form>

          <div className="pt-4 border-t border-slate-100 flex items-center justify-between text-xs">
            <Link
              href="/"
              className="text-slate-500 hover:text-slate-900 inline-flex items-center gap-1.5 font-medium transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Return to Public Portal
            </Link>

            <Link
              href="/auth/sign-in"
              className="text-[#0A3824] hover:underline font-bold"
            >
              Staff Sign In &rarr;
            </Link>
          </div>
        </div>

        {/* Security & Compliance Footer Note */}
        <div className="text-center text-[11px] text-slate-400 space-y-1">
          <p>ISO/IEC 25010:2023 Digital Clearance Verification Standard</p>
          <p>Colegio de Montalban &bull; Office of Student Internship & Placement (OSIP)</p>
        </div>
      </div>
    </div>
  );
}
