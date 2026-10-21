'use client';

import Link from 'next/link';
import Button from '@/src/components/ui/Button';
import { Card, CardContent } from '@/src/components/ui/Card';
import { Award, Check, Clock, Shield, FileText } from '@/src/components/ui/Icons';
import type { ClearanceCheckResult } from '@/src/services/certificates';

interface Props {
  clearance: ClearanceCheckResult | null;
}

export default function CertificateClientView({ clearance }: Props) {
  if (!clearance) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto page-fade-in text-center text-slate-500">
        Unable to load graduation clearance profile.
      </div>
    );
  }

  const hasCertificate = !!clearance.certificate && clearance.certificate.status === 'active';

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-5xl mx-auto page-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Certificate of Completion</h1>
          <p className="text-sm text-slate-500 mt-0.5">Official Colegio de Montalban Practicum Credential & Graduation Clearance</p>
        </div>
        {hasCertificate && (
          <Button
            onClick={() => window.print()}
            className="bg-[#0A3824] hover:bg-[#092E1D] text-[var(--cdm-sand)] font-bold shadow-md"
          >
            🖨️ Print / Save as PDF
          </Button>
        )}
      </div>

      {/* 3-Pillar Clearance Status Banner */}
      <Card className="border-slate-200 shadow-sm overflow-hidden">
        <CardContent className="p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
              <Shield className="w-4 h-4 text-[#0A3824]" /> 3-Pillar Institutional Clearance Gate
            </h3>
            <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${
              hasCertificate ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
            }`}>
              {hasCertificate ? 'Clearance Completed & Issued' : 'Clearance in Progress'}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
            {/* Pillar 1: Rendered Hours */}
            <div className={`p-3.5 rounded-xl border flex items-start gap-3 ${
              clearance.hours_met ? 'bg-emerald-50/70 border-emerald-200' : 'bg-slate-50 border-slate-200'
            }`}>
              <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${
                clearance.hours_met ? 'bg-emerald-600 text-white' : 'bg-slate-300 text-slate-600'
              }`}>
                {clearance.hours_met ? <Check className="w-3.5 h-3.5 stroke-[3]" /> : <Clock className="w-3.5 h-3.5" />}
              </div>
              <div>
                <p className="font-bold text-slate-800">1. Rendered Hours</p>
                <p className="text-slate-500 mt-0.5">{clearance.completed_hours} / {clearance.required_hours} Hours</p>
                <p className="text-[10px] font-semibold mt-1 text-emerald-700">
                  {clearance.hours_met ? 'Target Met (100%)' : 'In Progress'}
                </p>
              </div>
            </div>

            {/* Pillar 2: Final Report */}
            <div className={`p-3.5 rounded-xl border flex items-start gap-3 ${
              clearance.final_report_approved ? 'bg-emerald-50/70 border-emerald-200' : 'bg-slate-50 border-slate-200'
            }`}>
              <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${
                clearance.final_report_approved ? 'bg-emerald-600 text-white' : 'bg-slate-300 text-slate-600'
              }`}>
                {clearance.final_report_approved ? <Check className="w-3.5 h-3.5 stroke-[3]" /> : <FileText className="w-3.5 h-3.5" />}
              </div>
              <div>
                <p className="font-bold text-slate-800">2. Final Report & Portfolio</p>
                <p className="text-slate-500 mt-0.5">OJT Coordinator Sign-off</p>
                <p className={`text-[10px] font-semibold mt-1 ${clearance.final_report_approved ? 'text-emerald-700' : 'text-amber-700'}`}>
                  {clearance.final_report_approved ? 'Approved by Faculty' : 'Pending Review'}
                </p>
              </div>
            </div>

            {/* Pillar 3: Supervisor Evaluation */}
            <div className={`p-3.5 rounded-xl border flex items-start gap-3 ${
              clearance.evaluation_passed ? 'bg-emerald-50/70 border-emerald-200' : 'bg-slate-50 border-slate-200'
            }`}>
              <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${
                clearance.evaluation_passed ? 'bg-emerald-600 text-white' : 'bg-slate-300 text-slate-600'
              }`}>
                {clearance.evaluation_passed ? <Check className="w-3.5 h-3.5 stroke-[3]" /> : <Award className="w-3.5 h-3.5" />}
              </div>
              <div className="flex-1">
                <p className="font-bold text-slate-800">3. Industry Evaluation</p>
                <p className="text-slate-500 mt-0.5">
                  {clearance.midterm_score !== null && `Midterm: ${clearance.midterm_score}% • `}
                  {clearance.final_score !== null ? `Final: ${clearance.final_score}%` : 'Passing ≥ 75.0%'}
                </p>
                <p className={`text-[10px] font-semibold mt-1 ${clearance.evaluation_passed ? 'text-emerald-700' : 'text-slate-500'}`}>
                  {clearance.evaluation_appeal_pending ? 'Appeal pending Coordinator review' : clearance.evaluation_score !== null ? `${clearance.evaluation_score}% (Passed)` : 'Awaiting Rating'}
                </p>
                <Link
                  href="/student/evaluation-summary"
                  className="text-[11px] font-bold text-[#0A3824] hover:underline inline-flex items-center gap-1 mt-1.5"
                >
                  View Evaluation Summary Sheet →
                </Link>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Official Certificate Canvas */}
      {hasCertificate ? (
        <div className="bg-[#FAF8F5] border-8 border-[#0A3824] p-8 sm:p-12 rounded-3xl shadow-2xl relative text-center space-y-6 overflow-hidden">
          {/* Top Decorative Border */}
          <div className="flex items-center justify-center gap-3">
            <div className="h-0.5 flex-1 bg-gradient-to-r from-transparent via-[var(--cdm-sand)] to-transparent" />
            <span className="text-xs font-bold tracking-widest text-[#0A3824] uppercase">Republic of the Philippines</span>
            <div className="h-0.5 flex-1 bg-gradient-to-r from-transparent via-[var(--cdm-sand)] to-transparent" />
          </div>

          <div className="space-y-1">
            <h2 className="text-2xl sm:text-3xl font-extrabold text-[#092E1D] tracking-tight font-serif">
              COLEGIO DE MONTALBAN
            </h2>
            <p className="text-xs text-slate-600 uppercase tracking-widest">
              Kasiglahan Village, Rodriguez, Rizal
            </p>
          </div>

          <div className="py-2">
            <span className="inline-block text-base sm:text-lg font-serif italic text-slate-700">
              This is to officially certify that
            </span>
            <h3 className="text-3xl sm:text-4xl font-extrabold text-[#0A3824] tracking-tight mt-2 font-serif underline decoration-[var(--cdm-sand)] decoration-4 underline-offset-8">
              {clearance.student_name}
            </h3>
            <p className="text-xs text-slate-500 font-mono mt-3">
              Student ID: {clearance.student_number} • {clearance.course}
            </p>
          </div>

          <p className="text-xs sm:text-sm text-slate-700 max-w-xl mx-auto leading-relaxed">
            has successfully completed the prescribed <strong className="text-slate-900">{clearance.completed_hours.toFixed(1)} Hours</strong> of On-the-Job Training & Practicum Experience in partial fulfillment of the academic requirements for the Bachelor’s Degree.
          </p>

          {clearance.final_grade !== null && (
            <p className="text-sm font-semibold text-slate-800">Final OJT Grade: {clearance.final_grade.toFixed(2)}</p>
          )}

          <div className="pt-8 border-t border-slate-300 grid grid-cols-2 gap-8 text-center text-xs">
            <div>
              <div className="h-10 flex items-end justify-center">
                <span className="font-bold text-slate-800 text-sm">OJT Coordinator</span>
              </div>
              <p className="text-[10px] text-slate-400 mt-1">Colegio de Montalban</p>
            </div>
            <div>
              <div className="h-10 flex items-end justify-center">
                <span className="font-bold text-slate-800 text-sm">Dean / Program Head</span>
              </div>
              <p className="text-[10px] text-slate-400 mt-1">Institute of Computing Studies & IBE</p>
            </div>
          </div>

          {/* Tamper-Proof Serial & Public Link */}
          <div className="pt-4 flex flex-col sm:flex-row items-center justify-between gap-3 text-[11px] text-slate-500 bg-white/60 p-3 rounded-xl border border-slate-200">
            <span className="font-mono">
              Digital Verification Serial: <strong className="text-slate-900">{clearance.certificate?.verification_code}</strong>
            </span>
            <Link
              href={`/verify-certificate/${clearance.certificate?.verification_code}`}
              target="_blank"
              className="text-[#0A3824] font-bold hover:underline"
            >
              🔗 Public Verification Portal →
            </Link>
          </div>
        </div>
      ) : (
        <Card className="border-slate-200 p-8 text-center space-y-3 bg-white">
          <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 mx-auto flex items-center justify-center">
            <Award className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-bold text-slate-800">Certificate Issuance Pending</h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Your official Certificate of Completion will be generated once all 3 clearance pillars (486.0 rendered hours, final narrative report approval, and supervisor evaluation) are signed off by your OJT Coordinator.
          </p>
        </Card>
      )}
    </div>
  );
}
