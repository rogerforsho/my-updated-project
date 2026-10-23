'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/src/lib/supabase/client';
import Button from '@/src/components/ui/Button';
import Input from '@/src/components/ui/Input';

function getUnverifiedTotpFactors(factors: { all: Array<{ factor_type: string; id: string; status: string }> }) {
  return factors.all.filter(factor => factor.factor_type === 'totp' && factor.status === 'unverified');
}

export default function AdminMfaGate() {
  const router = useRouter();
  const [factorId, setFactorId] = useState('');
  const [qrCode, setQrCode] = useState('');
  const [secret, setSecret] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [setupRequired, setSetupRequired] = useState(false);
  const [pendingSetup, setPendingSetup] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;
    async function prepareFactor() {
      const supabase = createClient();
      const { data: assurance, error: assuranceError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (assuranceError) throw assuranceError;
      // The server rendered this gate, so it does not see aal2 even if this browser session does.
      // Refresh the session once and fall through to the code form instead of spinning forever.
      if (assurance?.currentLevel === 'aal2') {
        await supabase.auth.refreshSession();
        router.refresh();
      }
      const { data: factors, error: listError } = await supabase.auth.mfa.listFactors();
      if (listError) throw listError;
      const verified = factors.totp.find(factor => factor.status === 'verified');
      if (verified) {
        if (active) {
          setFactorId(verified.id);
          setLoading(false);
        }
      } else {
        const pending = getUnverifiedTotpFactors(factors)[0];
        if (active) {
          if (pending) {
            setFactorId(pending.id);
            setPendingSetup(true);
          } else {
            setSetupRequired(true);
          }
          setLoading(false);
        }
      }
    }
    prepareFactor().catch(error => {
      if (active) { setError(error instanceof Error ? error.message : 'Multi-factor setup is unavailable.'); setLoading(false); }
    });
    return () => { active = false; };
  }, [router]);

  async function startEnrollment() {
    setError('');
    setLoading(true);
    const supabase = createClient();
    try {
      const { data: factors, error: listError } = await supabase.auth.mfa.listFactors();
      if (listError) throw listError;
      const verified = factors.totp.find(factor => factor.status === 'verified');
      if (verified) {
        setFactorId(verified.id);
        setQrCode('');
        setSecret('');
        setPendingSetup(false);
        setSetupRequired(false);
        setLoading(false);
        return;
      }
      for (const factor of getUnverifiedTotpFactors(factors)) {
        const { error: cleanupError } = await supabase.auth.mfa.unenroll({ factorId: factor.id });
        if (cleanupError) throw cleanupError;
      }
      const { data, error: enrollError } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'CdM OJT Super Admin' });
      if (enrollError) throw enrollError;
      setFactorId(data.id);
      setQrCode(data.totp.qr_code);
      setSecret(data.totp.secret);
      setCode('');
      setPendingSetup(false);
      setSetupRequired(false);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Multi-factor setup is unavailable.');
      setFactorId('');
      setQrCode('');
      setSecret('');
      setPendingSetup(false);
      setSetupRequired(true);
    } finally {
      setLoading(false);
    }
  }

  async function verify() {
    setError('');
    if (!factorId) { setError('Authenticator setup is not ready. Refresh the page and try again.'); return; }
    if (!/^\d{6}$/.test(code)) { setError('Enter the 6-digit code from your authenticator app.'); return; }
    setSubmitting(true);
    const supabase = createClient();
    const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
    setSubmitting(false);
    if (verifyError) { setError('That code could not be verified. Check the code and try again.'); return; }
    router.refresh();
  }

  return (
    <main className="mx-auto max-w-lg p-6">
      <h1 className="text-2xl font-bold text-[#0A3824]">Super Admin multi-factor verification</h1>
      <p className="mt-2 text-sm text-slate-600">Use an authenticator app. The administration console stays locked until this account completes MFA.</p>
      {loading ? <p className="mt-6 text-sm text-slate-600">Preparing secure verification…</p> : (
        setupRequired ? (
          <div className="mt-6 space-y-4">
            <p className="text-sm text-slate-600">Set up an authenticator app to secure this Super Admin account.</p>
            {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
            <Button type="button" loading={submitting} onClick={startEnrollment} className="w-full">Set up authenticator</Button>
          </div>
        ) : factorId ? (
          <div className="mt-6 space-y-4">
            {qrCode && (
              <div className="rounded-xl border border-slate-200 p-4">
                <p className="mb-3 text-sm font-semibold">Scan this code with your authenticator app</p>
                {/* Supabase provides an inline SVG data URI that next/image cannot render. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qrCode} alt="Authenticator setup QR code" width={208} height={208} className="mx-auto h-52 w-52" />
                <p className="mt-3 text-xs text-slate-600">Or enter this setup key manually: <code className="break-all">{secret}</code></p>
              </div>
            )}
            {pendingSetup && <p className="text-sm text-slate-600">Authenticator setup is still pending. If you already scanned its QR code, use that authenticator entry. Otherwise, restart setup to create a new QR code.</p>}
            <Input label="6-digit authenticator code" inputMode="numeric" autoComplete="off" maxLength={6} value={code} onChange={event => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} />
            {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
            <Button type="button" loading={submitting} onClick={verify} className="w-full">Verify and open administration</Button>
            {(pendingSetup || qrCode) && <Button type="button" loading={loading} onClick={startEnrollment} className="w-full">{pendingSetup ? 'Restart authenticator setup' : 'Start over'}</Button>}
          </div>
        ) : <p role="alert" className="mt-6 text-sm text-red-700">{error || 'Authenticator setup could not be started. Refresh the page to try again.'}</p>
      )}
    </main>
  );
}
