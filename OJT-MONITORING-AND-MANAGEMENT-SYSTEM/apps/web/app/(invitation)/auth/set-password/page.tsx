'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/src/lib/supabase/client';
import Input from '@/src/components/ui/Input';
import Button from '@/src/components/ui/Button';
import { Eye, EyeOff } from '@/src/components/ui/Icons';

function PasswordField({ label, id, value, onChange }: { label: string; id: string; value: string; onChange: (value: string) => void }) {
  const [visible, setVisible] = useState(false);
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-xs font-bold text-[#37483C]">{label}</label>
      <div className="relative">
        <Input
          id={id}
          type={visible ? 'text' : 'password'}
          autoComplete="new-password"
          minLength={12}
          value={value}
          onChange={event => onChange(event.target.value)}
          className="pr-12"
          required
        />
        <button
          type="button"
          onClick={() => setVisible(current => !current)}
          aria-label={`${visible ? 'Hide' : 'Show'} ${label.toLowerCase()}`}
          aria-pressed={visible}
          title={`${visible ? 'Hide' : 'Show'} ${label.toLowerCase()}`}
          className="absolute inset-y-0 right-1 grid w-11 place-items-center rounded-lg text-[#45644A] transition-colors hover:bg-[#EDF2EB] hover:text-[#0A3824] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#45644A]"
        >
          {visible ? <EyeOff className="h-5 w-5" aria-hidden="true" /> : <Eye className="h-5 w-5" aria-hidden="true" />}
        </button>
      </div>
    </div>
  );
}

export default function SetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    if (password.length < 12) return setError('Use at least 12 characters.');
    if (password !== confirm) return setError('Passwords do not match.');

    setLoading(true);
    const supabase = createClient();
    const { data: { user }, error: sessionError } = await supabase.auth.getUser();
    if (!user || sessionError) {
      setLoading(false);
      setError('This setup link is invalid or has expired. Ask a Super Admin or OJT Coordinator to send another invitation.');
      return;
    }
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (updateError) {
      setError('Password could not be saved. Request a new setup link and try again.');
      return;
    }
    router.replace('/dashboard');
  }

  return (
    <main>
      <p className="text-xs font-bold text-[#45644A]">YOUR ACCOUNT</p>
      <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-[#0A3824]">Set your password</h1>
      <p className="mt-3 text-sm leading-6 text-[#5A6A5E]">Choose a private password to finish setting up your account.</p>
      <form onSubmit={submit} className="mt-7 space-y-5">
        <PasswordField label="New password" id="new-password" value={password} onChange={setPassword} />
        <PasswordField label="Confirm password" id="confirm-password" value={confirm} onChange={setConfirm} />
        <p className="text-xs text-[#5A6A5E]">Use at least 12 characters. You can reveal either field to check what you typed.</p>
        {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
        <Button type="submit" loading={loading} className="w-full">Save password</Button>
      </form>
    </main>
  );
}
