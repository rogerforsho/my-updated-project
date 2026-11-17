import Link from 'next/link';
import { headers } from 'next/headers';
import QRCode from 'qrcode';
import CertificateSheet from './CertificateSheet';
import { verifyCertificatePublic } from '@/src/services/certificates';
import { Shield, AlertCircle } from '@/src/components/ui/Icons';

interface Props {
  params: Promise<{ code: string }>;
}

export default async function PublicCertificateVerificationPage({ params }: Props) {
  const { code } = await params;
  const result = await verifyCertificatePublic(code);
  const cert = result.data;

  if (cert?.status === 'active' && cert.valid) {
    const h = await headers();
    const host = h.get('x-forwarded-host') ?? h.get('host');
    const proto = h.get('x-forwarded-proto') ?? (host?.startsWith('localhost') ? 'http' : 'https');
    const verifyUrl = `${proto}://${host}/verify-certificate/${encodeURIComponent(cert.verification_code)}`;
    const qrSvg = await QRCode.toString(verifyUrl, { type: 'svg', margin: 0, color: { dark: '#1B4332', light: '#FFFFFF' } });
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4 sm:p-8 page-fade-in font-sans" style={{ background: '#EFEBDD' }}>
        <CertificateSheet
          cert={{
            student_name: cert.student_name ?? '',
            student_number: cert.student_number ?? '',
            course: cert.course ?? '',
            host_company_name: cert.host_company_name ?? '',
            hours: cert.hours_rendered?.toFixed(1) ?? '0.0',
            academic_year: cert.academic_year ?? '',
            issued: cert.issued_at ? new Date(cert.issued_at).toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' }) : 'N/A',
            serial: cert.verification_code,
          }}
          qrSvg={qrSvg}
          verifyUrl={verifyUrl}
        />
        <Link href="/auth/sign-in" className="no-print mt-6 text-xs font-semibold text-[#1B4332] hover:underline">
          ← Return to Colegio de Montalban OJT Portal
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col items-center justify-center p-4 sm:p-6 page-fade-in font-sans">
      <div className="w-full max-w-xl space-y-6">
        {/* Header Branding */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#0A3824]/10 text-[#0A3824] text-xs font-bold ">
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
        {cert?.status === 'revoked' ? (
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