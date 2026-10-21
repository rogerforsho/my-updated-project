'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Input from '@/src/components/ui/Input';
import Button from '@/src/components/ui/Button';
import Alert from '@/src/components/ui/Alert';
import { Eye, EyeOff, UserCheck, Trash2, ArrowRight, Clock, Monitor, Smartphone } from '@/src/components/ui/Icons';
import { signIn } from '@/src/services/auth';

const STORAGE_KEY = 'ojt_remembered_profiles';

interface SavedProfile {
  full_name: string;
  email: string;
  role: string;
  last_login?: string;
}

const ROLE_BADGES: Record<string, { label: string; bg: string; text: string }> = {
  Coordinator: { label: 'OJT Coordinator', bg: 'bg-emerald-100', text: 'text-emerald-800' },
  Supervisor: { label: 'Company Supervisor', bg: 'bg-emerald-100', text: 'text-emerald-800' },
  Admin: { label: 'Super Admin', bg: 'bg-emerald-100', text: 'text-emerald-800' },
  Student: { label: 'OJT Student', bg: 'bg-amber-100', text: 'text-amber-800' },
};

function SignInContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isInactiveLogout = searchParams.get('reason') === 'inactivity';
  const isMobileOnly = searchParams.get('reason') === 'mobile_only';

  // Saved Profiles State (Facebook/Google style)
  const [savedProfiles, setSavedProfiles] = useState<SavedProfile[]>([]);
  const [selectedProfile, setSelectedProfile] = useState<SavedProfile | null>(null);
  const [useAnotherAccount, setUseAnotherAccount] = useState(false);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingText, setLoadingText] = useState('Signing in...');
  const [error, setError] = useState('');

  // Web account recovery state
  const [showForgot, setShowForgot] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [resetMessage, setResetMessage] = useState('');

  // Load saved profiles from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed: SavedProfile[] = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setSavedProfiles(parsed);
          setSelectedProfile(parsed[0]); // Default to most recent profile
        }
      }
    } catch {}
  }, []);

  // Save or update profile in localStorage
  function saveProfileLocally(profile: SavedProfile) {
    try {
      const filtered = savedProfiles.filter(p => p.email.toLowerCase() !== profile.email.toLowerCase());
      const updated = [profile, ...filtered].slice(0, 4); // Keep top 4
      setSavedProfiles(updated);
      setSelectedProfile(profile);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch {}
  }

  // Remove a profile from localStorage
  function removeProfile(emailToRemove: string, e?: React.MouseEvent) {
    if (e) e.stopPropagation();
    try {
      const updated = savedProfiles.filter(p => p.email.toLowerCase() !== emailToRemove.toLowerCase());
      setSavedProfiles(updated);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      if (selectedProfile?.email.toLowerCase() === emailToRemove.toLowerCase()) {
        if (updated.length > 0) {
          setSelectedProfile(updated[0]);
        } else {
          setSelectedProfile(null);
          setUseAnotherAccount(true);
        }
      }
    } catch {}
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    setLoadingText('Signing in...');

    const slowTimer = setTimeout(() => {
      setLoadingText('Connecting to CdM servers...');
    }, 2000);

    const loginEmail = selectedProfile && !useAnotherAccount ? selectedProfile.email : email;
    const result = await signIn({ email: loginEmail, password });
    clearTimeout(slowTimer);

    if (result.error) {
      setLoading(false);
      if (result.error.message.includes('CdM OJT Mobile App') || result.error.message.includes('Student accounts must access')) {
        router.push('/auth/sign-in?reason=mobile_only');
        setError('');
        return;
      }
      setError(result.error.message);
      return;
    }

    setLoadingText('Preparing your dashboard...');

    // Save profile locally for 1-click remembered sign-in next time
    if (result.data) {
      saveProfileLocally({
        full_name: result.data.full_name,
        email: result.data.email,
        role: result.data.role,
        last_login: new Date().toISOString(),
      });
    }

    router.push('/dashboard');
    router.refresh();
  }

  async function handleResetRequest(e: React.FormEvent) {
    e.preventDefault();
    setResetMessage('');
    setResetLoading(true);
    const { requestPasswordReset } = await import('@/src/services/auth');
    const result = await requestPasswordReset(resetEmail, 'Web');
    setResetLoading(false);
    if (result.error) {
      setResetMessage(result.error.message);
    } else {
      setResetMessage(result.data?.message ?? 'If an eligible account uses that email, a one-time recovery link will be sent.');
    }
  }

  // VIEW 1: Web-role account recovery
  if (showForgot) {
    return (
      <div className="page-fade-in space-y-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-xl font-black text-[#0A3824] font-serif">Web Account Recovery</h1>
          </div>
          <p className="text-xs text-slate-500">
            Enter your registered email. If it belongs to an active Supervisor, OJT Coordinator, or Super Admin account, we will send a one-time recovery link.
          </p>
        </div>

        <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-900 text-xs flex items-start gap-2.5">
          <div className="w-5 h-5 rounded-full bg-amber-200/80 flex items-center justify-center shrink-0 mt-0.5 font-bold text-[11px] text-amber-800">
            i
          </div>
          <p className="text-[11px] leading-relaxed text-amber-800">
            For security, this page does not reveal whether an email belongs to an account.
          </p>
        </div>

        <form onSubmit={handleResetRequest} className="flex flex-col gap-3.5">
          <Input
            label="Registered Institutional Email"
            type="email"
            value={resetEmail}
            onChange={(e) => setResetEmail(e.target.value)}
            placeholder="msantos@cdm.edu.ph"
            required
          />

          {resetMessage && (
            <Alert
              type="success"
              message={resetMessage}
            />
          )}

          <Button type="submit" loading={resetLoading} className="w-full mt-1 bg-[#0A3824] hover:bg-[#092E1D] text-[var(--cdm-sand)] font-bold shadow-md shadow-[#0A3824]/20 cursor-pointer">
            Send Password Reset Link
          </Button>

          {/* Student Trainee Guidance Box */}
          <div className="mt-2 p-3 rounded-xl bg-slate-50 border border-slate-200 text-center">
            <p className="text-[11px] text-slate-700 font-semibold mb-0.5">
              🎓 Student Trainee?
            </p>
            <p className="text-[11px] text-slate-500">
              Student account recovery is conducted exclusively via the <strong>CdM Mobile Application</strong>.
            </p>
          </div>

          <button
            type="button"
            onClick={() => { setShowForgot(false); setResetMessage(''); }}
            className="text-xs font-bold text-[#0A3824] hover:text-[#092E1D] hover:underline text-center mt-1 cursor-pointer"
          >
            ← Back to Sign In
          </button>
        </form>
      </div>
    );
  }

  // VIEW 2: Remembered Profile Quick Login Card (Like Facebook/Google)
  if (selectedProfile && !useAnotherAccount) {
    const badge = ROLE_BADGES[selectedProfile.role] ?? ROLE_BADGES.Student;
    const firstName = selectedProfile.full_name.split(' ')[0] || 'User';

    return (
      <div className="page-fade-in">
        {isInactiveLogout && (
          <div className="mb-4 p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-start gap-2.5">
            <Clock className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-[11px] leading-relaxed text-amber-800">
              <strong>Session Locked (ISO/IEC 25010:2023):</strong> You were automatically signed out after 15 minutes of inactivity to protect your account on shared campus computers.
            </p>
          </div>
        )}

        <div className="mb-5 text-center">
          <h1 className="text-2xl font-black text-slate-900 font-serif tracking-tight">Welcome Back</h1>
          <p className="text-xs text-slate-500 mt-1">Quick sign-in with your saved institutional profile.</p>
        </div>

        <div className="p-4 rounded-2xl bg-slate-50/75 border border-slate-200/80 shadow-2xs mb-4">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-full bg-[#0A3824] border border-amber-400/30 flex items-center justify-center shrink-0 shadow-2xs">
              <span className="font-bold text-amber-300 text-sm">
                {firstName.charAt(0).toUpperCase()}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="font-bold text-slate-900 text-sm truncate">{selectedProfile.full_name}</p>
                <UserCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              </div>
              <p className="text-xs text-slate-500 truncate">{selectedProfile.email}</p>
              <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full mt-1 ${badge.bg} ${badge.text}`}>
                {badge.label}
              </span>
            </div>
            <button
              type="button"
              onClick={(e) => removeProfile(selectedProfile.email, e)}
              title="Remove profile"
              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {selectedProfile.role === 'Student' ? (
          <div className="space-y-4">
            <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-start gap-2.5">
              <Smartphone className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div className="text-[11px] leading-relaxed text-amber-800">
                <p className="font-bold">Student Mobile App Access Only</p>
                <p className="mt-0.5">
                  OJT Student accounts use the <strong>CdM OJT Mobile App</strong> for registration and OJT workflows. Web sign-in is for Supervisors, OJT Coordinators, and Super Admins.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between text-xs pt-1">
              <button
                type="button"
                onClick={() => { setUseAnotherAccount(true); setEmail(''); setPassword(''); }}
                className="font-bold text-[#0A3824] hover:text-[#092E1D] hover:underline cursor-pointer"
              >
                Sign In with Web Account
              </button>
              <button
                type="button"
                onClick={(e) => removeProfile(selectedProfile.email, e)}
                className="text-slate-400 hover:text-rose-600 cursor-pointer"
              >
                Remove Profile
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700">Password for {firstName}</label>
              <div className="relative">
                <Input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  required
                  autoFocus
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 transition-colors cursor-pointer"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {error && <Alert type="error" message={error} />}

            <Button type="submit" loading={loading} className="w-full mt-1 shadow-xs cursor-pointer">
              {loading ? loadingText : `Continue as ${firstName}`}
            </Button>

            <div className="flex items-center justify-between text-xs pt-1">
              <button
                type="button"
                onClick={() => { setUseAnotherAccount(true); setEmail(''); setPassword(''); }}
                className="font-bold text-[#0A3824] hover:text-[#092E1D] hover:underline cursor-pointer"
              >
                Use Another Account
              </button>
              <button
                type="button"
                onClick={() => { setShowForgot(true); setError(''); }}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                Forgot password?
              </button>
            </div>
          </form>
        )}

        {savedProfiles.length > 1 && (
          <div className="mt-5 pt-4 border-t border-slate-100">
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">Other Saved Profiles</p>
            <div className="space-y-1.5">
              {savedProfiles
                .filter(p => p.email.toLowerCase() !== selectedProfile.email.toLowerCase())
                .map(p => (
                  <button
                    key={p.email}
                    type="button"
                    onClick={() => { setSelectedProfile(p); setPassword(''); }}
                    className="w-full flex items-center justify-between p-2 rounded-xl hover:bg-slate-50 text-left transition-colors border border-transparent hover:border-slate-200 cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center font-bold text-xs text-slate-700">
                        {p.full_name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="text-xs font-bold text-slate-800">{p.full_name}</p>
                        <p className="text-[10px] text-slate-400">{p.email}</p>
                      </div>
                    </div>
                    <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                  </button>
                ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // VIEW 3: Standard Clean Sign-In Form
  return (
    <div className="page-fade-in">
      {isInactiveLogout && (
        <div className="mb-4 p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-start gap-2.5">
          <Clock className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <p className="text-[11px] leading-relaxed text-amber-800">
            <strong>Session Locked (ISO/IEC 25010:2023):</strong> You were automatically signed out after 15 minutes of inactivity to protect your account on shared campus computers.
          </p>
        </div>
      )}

      {isMobileOnly && (
        <div className="mb-4 p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-start gap-2.5">
          <Smartphone className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-[11px] leading-relaxed text-amber-800">
            <p className="font-bold">Student Mobile App Access Only</p>
            <p className="mt-0.5">
              OJT Student accounts use the <strong>CdM OJT Mobile App</strong> for registration and OJT workflows. Web sign-in is for Supervisors, OJT Coordinators, and Super Admins.
            </p>
          </div>
        </div>
      )}

      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <h1 className="text-2xl font-black text-slate-900 font-serif tracking-tight">Sign In</h1>
        </div>
        <p className="text-xs text-slate-500">
          Enter your institutional credentials to access your portal.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Input
          label="Institutional Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="username@cdm.edu.ph"
          required
        />

        <div className="space-y-1">
          <label className="text-xs font-bold text-slate-700">Password</label>
          <div className="relative">
            <Input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              className="pr-10"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 transition-colors cursor-pointer"
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {error && <Alert type="error" message={error} />}

        <Button type="submit" loading={loading} className="w-full mt-1 shadow-xs cursor-pointer">
          {loading ? loadingText : 'Sign In'}
        </Button>

        <div className="flex items-center justify-between text-xs pt-1">
          <Link href="/auth/register" className="font-bold text-[#0A3824] hover:text-[#092E1D] hover:underline">
            Register students in the mobile app
          </Link>
          <button
            type="button"
            onClick={() => { setShowForgot(true); setError(''); }}
            className="text-slate-400 hover:text-slate-600 cursor-pointer"
          >
            Forgot password?
          </button>
        </div>

        <p className="text-[11px] text-slate-400 text-center">
          Enrolled students: Register above, then sign in using the mobile app.
        </p>

        {savedProfiles.length > 0 && useAnotherAccount && (
          <button
            type="button"
            onClick={() => setUseAnotherAccount(false)}
            className="text-xs font-bold text-[#0A3824] hover:underline text-center mt-2 cursor-pointer"
          >
            ← Back to Saved Profiles
          </button>
        )}

        {/* Windows Desktop Client Download Option */}
        <div className="mt-4 pt-3 border-t border-slate-100 text-center">
          <a
            href="/downloads/CdM-OJT-Portal-Setup-1.0.0.exe"
            download="CdM-OJT-Portal-Setup-1.0.0.exe"
            className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-[#0A3824] font-medium transition-colors"
          >
            <Monitor className="w-3.5 h-3.5 text-slate-400" />
            <span>Download Desktop Client for Windows</span>
          </a>
        </div>
      </form>
    </div>
  );
}

export default function SignInPage() {
  return (
    <Suspense
      fallback={
        <div className="w-full max-w-sm mx-auto my-auto py-12 flex flex-col items-center justify-center space-y-3">
          <div className="w-8 h-8 rounded-full border-2 border-[#0A3824] border-t-transparent animate-spin" />
          <p className="text-xs text-slate-500 font-medium">Loading sign-in portal...</p>
        </div>
      }
    >
      <SignInContent />
    </Suspense>
  );
}
