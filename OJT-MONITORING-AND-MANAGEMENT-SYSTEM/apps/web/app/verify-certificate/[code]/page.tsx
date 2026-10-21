import Link from 'next/link';
import { verifyCertificatePublic } from '@/src/services/certificates';
import { Shield, Check, AlertCircle, Building, Clock, Award, FileText } from '@/src/components/ui/Icons';

interface Props {
  params: Promise<{ code: string }>;
}

export default async function PublicCertificateVerificationPage({ params }: Props) {
  const { code } = await params;
  const result = await verifyCertificatePublic(code);
  const cert = result.data;

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col items-center justify-center p-4 sm:p-6 page-fade-in font-sans">
      <div className="w-full max-w-xl space-y-6">
        {/* Header Branding */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#0A3824]/10 text-[#0A3824] text-xs font-bold tracking-wider uppercase">
            <Shield className="w-4 h-4" />
            Official Credential Verification Portal
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            Colegio de Montalban
          </h1>
          <p className="text-xs text-slate-500">
            Institutional On-the-Job Training & Practicum Verification Engine
          </p>
        </div>

        {/* Verification Result Card */}
        {cert?.status === 'active' && cert.valid ? (
          <div className="bg-white rounded-2xl border-2 border-emerald-500/80 shadow-xl overflow-hidden">
            {/* Success Top Banner */}
            <div className="bg-emerald-600 px-6 py-4 text-white flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
                <Check className="w-6 h-6 text-white stroke-[3]" />
              </div>
              <div>
                <h2 className="text-base font-bold">Authentic Practicum Credential Verified</h2>
                <p className="text-xs text-emerald-100">
                  This Certificate of Completion is authentic, tamper-proof, and officially registered with Colegio de Montalban.
                </p>
              </div>
            </div>

            {/* Credential Details */}
            <div className="p-6 space-y-5">
              <div className="border-b border-slate-100 pb-4">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Trainee Graduate</p>
                <h3 className="text-xl font-bold text-slate-900 mt-0.5">{cert.student_name}</h3>
                <p className="text-xs text-slate-500 font-mono mt-0.5">{cert.student_number} • {cert.course}</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-100 space-y-1">
                  <div className="flex items-center gap-1.5 text-slate-400 font-semibold uppercase">
                    <Building className="w-3.5 h-3.5" /> Host Training Establishment
                  </div>
                  <p className="font-bold text-slate-800 text-sm">{cert.host_company_name}</p>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-100 space-y-1">
                  <div className="flex items-center gap-1.5 text-slate-400 font-semibold uppercase">
                    <Clock className="w-3.5 h-3.5" /> Rendered Practicum Hours
                  </div>
                  <p className="font-bold text-emerald-700 text-sm">{cert.hours_rendered?.toFixed(1)} Hours Verified</p>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-100 space-y-1">
                  <div className="flex items-center gap-1.5 text-slate-400 font-semibold uppercase">
                    <Award className="w-3.5 h-3.5" /> Academic Term
                  </div>
                  <p className="font-bold text-slate-800 text-sm">A.Y. {cert.academic_year}</p>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-100 space-y-1">
                  <div className="flex items-center gap-1.5 text-slate-400 font-semibold uppercase">
                    <FileText className="w-3.5 h-3.5" /> Date of Official Issuance
                  </div>
                  <p className="font-bold text-slate-800 text-sm">
                    {cert.issued_at ? new Date(cert.issued_at).toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' }) : 'N/A'}
                  </p>
                </div>
              </div>

              {/* Security Verification Footer */}
              <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400">
                <span>Verification Serial:</span>
                <span className="font-mono font-bold text-slate-800 bg-slate-100 px-2.5 py-1 rounded border border-slate-200">
                  {cert.verification_code}
                </span>
              </div>
            </div>
          </div>
        ) : cert?.status === 'revoked' ? (
          <div className="bg-white rounded-2xl border-2 border-rose-500 shadow-xl overflow-hidden">
            <div className="bg-rose-600 px-6 py-4 text-white flex items-center gap-3">
              <AlertCircle className="w-8 h-8 flex-shrink-0" />
              <div>
                <h2 className="text-base font-bold">Credential Revoked</h2>
                <p className="text-xs text-rose-100">
                  This Certificate of Completion has been officially revoked by the Colegio de Montalban Academic Council.
                </p>
              </div>
            </div>
            <div className="p-6 space-y-3 text-xs">
              <p className="text-slate-600 font-medium">
                <strong>Reason for Revocation:</strong> {cert.revocation_reason || 'Administrative action due to academic or attendance discrepancy.'}
              </p>
              <p className="text-slate-400 font-mono">Serial: {cert.verification_code}</p>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl p-8 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-amber-50 text-amber-600 mx-auto flex items-center justify-center">
              <AlertCircle className="w-6 h-6" />
            </div>
            <h2 className="text-lg font-bold text-slate-900">Certificate Not Found</h2>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              No registered practicum certificate matches the verification code <strong className="font-mono text-slate-700">{code}</strong>. Please verify the QR code or link on the physical document.
            </p>
          </div>
        )}

        {/* Bottom Institutional Link */}
        <div className="text-center pt-2">
          <Link
            href="/auth/sign-in"
            className="text-xs font-semibold text-[#0A3824] hover:underline"
          >
            ← Return to Colegio de Montalban OJT Portal
          </Link>
        </div>
      </div>
    </div>
  );
}