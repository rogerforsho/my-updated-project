'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import type { AuthUser } from '@ojt/shared';
import { accountRoleLabel } from '@ojt/shared';
import { changeUserPassword } from '@/src/services/auth';
import {
  ShieldCheck,
  Key,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertTriangle,
  Lock,
  Monitor,
  Download,
} from '@/src/components/ui/Icons';
import { Button } from '@/src/components/ui/Button';
import { Input } from '@/src/components/ui/Input';
import { Card, CardContent } from '@/src/components/ui/Card';

interface Props {
  user: AuthUser;
  extraDetails?: {
    course?: string;
    studentNumber?: string;
    department?: string;
    companyName?: string;
  };
}

export default function SettingsClient({ user, extraDetails }: Props) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Compute password strength
  const getStrength = (pwd: string) => {
    if (!pwd) return 0;
    let score = 0;
    if (pwd.length >= 8) score += 25;
    if (pwd.length >= 12) score += 25;
    if (/[A-Z]/.test(pwd) && /[a-z]/.test(pwd)) score += 25;
    if (/[0-9]/.test(pwd) || /[^A-Za-z0-9]/.test(pwd)) score += 25;
    return score;
  };

  const strength = getStrength(newPassword);

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);

    if (newPassword.length < 8) {
      setMsg({ type: 'error', text: 'New password must be at least 8 characters long.' });
      return;
    }

    if (newPassword !== confirmPassword) {
      setMsg({ type: 'error', text: 'New password and confirmation do not match.' });
      return;
    }

    setLoading(true);
    const result = await changeUserPassword(currentPassword, newPassword);
    setLoading(false);

    if (result.error) {
      setMsg({ type: 'error', text: result.error.message });
    } else {
      setMsg({
        type: 'success',
        text: 'Your password has been successfully updated! Use your new password on your next login.',
      });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-5xl mx-auto page-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200/80 pb-5">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight font-serif">
            Account & Security
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Manage your personal profile information and update your account password.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-full shadow-2xs">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            Authenticated Session
          </span>
        </div>
      </div>

      {/* Alert Notifications */}
      {msg && (
        <div
          className={`p-4 rounded-2xl border text-xs font-semibold flex items-center gap-3 shadow-2xs ${
            msg.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-rose-50 border-rose-200 text-rose-900'
          }`}
        >
          {msg.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          ) : (
            <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
          )}
          <p className="leading-relaxed">{msg.text}</p>
        </div>
      )}

      {/* Main Grid: Profile Info & Change Password */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Left Column: User Profile Details Card */}
        <div className="lg:col-span-1 space-y-4">
          <Card className="border-slate-200/80 shadow-2xs overflow-hidden">
            <div className="h-16 bg-[#092E1D] p-4 flex items-center justify-end">
              <div className="w-7 h-7 rounded-lg bg-white/10 p-1 border border-amber-400/30 flex items-center justify-center">
                <Image
                  src="/logo.png"
                  alt="CdM Seal"
                  width={20}
                  height={20}
                  className="object-contain"
                />
              </div>
            </div>

            <CardContent className="p-5 pt-0 relative">
              <div className="-mt-8 mb-3 flex items-end justify-between">
                <div className="w-14 h-14 rounded-2xl bg-[#0A3824] text-amber-300 border-4 border-white dark:border-slate-900 shadow-2xs flex items-center justify-center font-bold text-lg">
                  {user.full_name ? user.full_name[0].toUpperCase() : 'U'}
                </div>
                <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-[#0A3824] text-amber-300 uppercase tracking-wider border border-amber-400/30 shadow-2xs">
                  {accountRoleLabel(user.role)}
                </span>
              </div>

              <h3 className="text-base font-bold text-slate-900 dark:text-white leading-tight">
                {user.full_name}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-medium">{user.email}</p>

              <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 space-y-2.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400 dark:text-slate-500 font-medium">Account Status</span>
                  <span className="font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800/60 uppercase text-[10px]">
                    {user.account_status}
                  </span>
                </div>

                {extraDetails?.course && (
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-slate-400 dark:text-slate-500 font-medium shrink-0">Program</span>
                    <span className="font-bold text-slate-800 dark:text-slate-200 text-right truncate">
                      {extraDetails.course}
                    </span>
                  </div>
                )}

                {extraDetails?.studentNumber && (
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400 dark:text-slate-500 font-medium">Student ID</span>
                    <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                      {extraDetails.studentNumber}
                    </span>
                  </div>
                )}

                {extraDetails?.department && (
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400 dark:text-slate-500 font-medium">Department</span>
                    <span className="font-bold text-slate-800 dark:text-slate-200">
                      {extraDetails.department}
                    </span>
                  </div>
                )}

                {extraDetails?.companyName && (
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400 dark:text-slate-500 font-medium">Host Company</span>
                    <span className="font-bold text-slate-800 dark:text-slate-200 truncate max-w-[140px]">
                      {extraDetails.companyName}
                    </span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Dedicated Windows Desktop Client Card */}
          <Card className="border-slate-200/80 dark:border-slate-800 shadow-xs overflow-hidden bg-gradient-to-b from-white to-slate-50/50 dark:from-slate-900 dark:to-slate-800/50">
            <CardContent className="p-5 space-y-3">
              <div className="flex items-center justify-between pb-1 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-[#0A3824]/10 dark:bg-emerald-950/60 border border-[#0A3824]/20 dark:border-emerald-800/60 flex items-center justify-center text-[#0A3824] dark:text-emerald-400">
                    <Monitor className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-900 dark:text-white leading-tight">Desktop Client</h4>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">Windows 10 / 11 (64-bit)</p>
                  </div>
                </div>
                <span className="text-[9px] font-extrabold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 uppercase tracking-wider">
                  v1.0.0
                </span>
              </div>

              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                Native Windows client for faculty with System Tray parking, background alerts, and floating WFH shift stopwatch (<kbd className="font-mono text-[10px] bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-1 py-0.5 rounded border border-slate-300 dark:border-slate-700">Ctrl+M</kbd>).
              </p>

              <div className="pt-1">
                <a
                  href="/downloads/CdM-OJT-Portal-Setup-1.0.0.exe"
                  download="CdM-OJT-Portal-Setup-1.0.0.exe"
                  className="w-full flex items-center justify-center gap-2 py-2 px-3 bg-[#0A3824] hover:bg-[#092E1D] text-[var(--cdm-sand)] font-bold text-xs rounded-xl shadow-xs transition-all cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download Windows Setup (.exe)
                </a>
                <p className="text-[10px] text-center text-slate-400 dark:text-slate-500 mt-1.5 font-medium">
                  Pre-configured for Colegio de Montalban Cloud
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Security Information Box */}
          <div className="p-4 rounded-2xl bg-amber-500/10 dark:bg-amber-950/40 border border-amber-500/30 dark:border-amber-800/50 text-amber-900 dark:text-amber-300 text-xs space-y-1.5">
            <div className="flex items-center gap-1.5 font-bold text-amber-900 dark:text-amber-200">
              <Lock className="w-3.5 h-3.5 text-amber-700 dark:text-amber-400" />
              <span>Temporary Password Notice</span>
            </div>
            <p className="text-[11px] text-amber-800/90 dark:text-amber-300/90 leading-relaxed">
              If you are logging in with a default or temporary password provided by your institution, please create a new, private password below to secure your practicum records.
            </p>
          </div>
        </div>

        {/* Right Column: Security & Change Password Card */}
        <div className="lg:col-span-2">
          <Card className="border-slate-200/80 dark:border-slate-800 shadow-xs">
            <CardContent className="p-6 sm:p-7 space-y-6">
              <div className="flex items-center gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
                <div className="w-10 h-10 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200/90 dark:border-slate-700 text-[#0A3824] dark:text-emerald-400 flex items-center justify-center shrink-0 shadow-2xs">
                  <Key className="w-5 h-5 text-[#0A3824] dark:text-emerald-400" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900 dark:text-white">Change Account Password</h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Update your password to keep your CdM practicum portal secure.
                  </p>
                </div>
              </div>

              <form onSubmit={handlePasswordSubmit} className="space-y-4">
                {/* Current Password Field */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Current Password <span className="text-slate-400 dark:text-slate-500 font-normal">(Leave blank if first-time setup)</span>
                  </label>
                  <div className="relative">
                    <Input
                      type={showCurrent ? 'text' : 'password'}
                      placeholder="Enter your current password..."
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowCurrent(!showCurrent)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 transition-colors cursor-pointer"
                    >
                      {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* New Password Field */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    New Secure Password <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <Input
                      type={showNew ? 'text' : 'password'}
                      placeholder="At least 8 characters..."
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      required
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNew(!showNew)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors cursor-pointer"
                    >
                      {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>

                  {/* Password Strength Meter */}
                  {newPassword.length > 0 && (
                    <div className="pt-1 space-y-1">
                      <div className="flex items-center justify-between text-[10px] font-bold">
                        <span className="text-slate-400 dark:text-slate-500">Password Strength:</span>
                        <span
                          className={
                            strength <= 25
                              ? 'text-rose-600 dark:text-rose-400'
                              : strength <= 50
                              ? 'text-amber-600 dark:text-amber-400'
                              : strength <= 75
                              ? 'text-blue-600 dark:text-blue-400'
                              : 'text-emerald-600 dark:text-emerald-400'
                          }
                        >
                          {strength <= 25
                            ? 'Weak (Min 8 chars)'
                            : strength <= 50
                            ? 'Fair'
                            : strength <= 75
                            ? 'Good'
                            : 'Strong & Secure'}
                        </span>
                      </div>
                      <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className={`h-full transition-all duration-300 ${
                            strength <= 25
                              ? 'bg-rose-500 w-1/4'
                              : strength <= 50
                              ? 'bg-amber-500 w-2/4'
                              : strength <= 75
                              ? 'bg-blue-500 w-3/4'
                              : 'bg-emerald-500 w-full'
                          }`}
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Confirm New Password Field */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Confirm New Password <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <Input
                      type={showConfirm ? 'text' : 'password'}
                      placeholder="Repeat your new password..."
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirm(!showConfirm)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors cursor-pointer"
                    >
                      {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {confirmPassword.length > 0 && newPassword !== confirmPassword && (
                    <p className="text-[11px] font-bold text-rose-600 pt-0.5">
                      Passwords do not match.
                    </p>
                  )}
                </div>

                <div className="pt-3">
                  <Button
                    type="submit"
                    loading={loading}
                    className="w-full bg-[#0A3824] hover:bg-[#092E1D] text-[var(--cdm-sand)] font-bold py-2.5 rounded-xl cursor-pointer shadow-sm transition-all flex items-center justify-center gap-2"
                  >
                    <Key className="w-4 h-4" />
                    <span>Save & Update Password</span>
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
