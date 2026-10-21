'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/src/lib/supabase/client';
import Input from '@/src/components/ui/Input';
import Button from '@/src/components/ui/Button';

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
    <main className="mx-auto max-w-md p-6">
      <h1 className="text-2xl font-bold text-[#0A3824]">Set your password</h1>
      <p className="mt-2 text-sm text-slate-600">Choose a private password to finish setting up your account.</p>
      <form onSubmit={submit} className="mt-6 space-y-4">
        <Input label="New password" type="password" autoComplete="new-password" minLength={12} value={password} onChange={event => setPassword(event.target.value)} required />
        <Input label="Confirm password" type="password" autoComplete="new-password" minLength={12} value={confirm} onChange={event => setConfirm(event.target.value)} required />
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        <Button type="submit" loading={loading} className="w-full">Save password</Button>
      </form>
    </main>
  );
}
