'use client';

import { useState } from 'react';
import Input from '@/src/components/ui/Input';
import Button from '@/src/components/ui/Button';
import { acceptSupervisorInvite } from '@/src/services/supervisorInvites';

export function InviteForm({ token }: { token: string }) {
  const [form, setForm] = useState({ full_name: '', email: '', position: '' });
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(''); setLoading(true);
    const res = await acceptSupervisorInvite(token, form);
    setLoading(false);
    if (res.error) setError(res.error.message); else setSent(true);
  }

  if (sent) {
    return (
      <div role="status" className="rounded-xl border border-[#0A3824]/20 bg-[#0A3824]/5 p-5 text-xs text-slate-700 leading-relaxed">
        <p className="font-bold text-[#0A3824] mb-1">Check your email</p>
        If this address can receive an invitation, we sent a one-time link to choose your password. Then sign in to the web portal.
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <Input label="Full name" value={form.full_name} maxLength={150} required onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))} />
      <Input label="Work email" type="email" value={form.email} maxLength={254} required onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
      <Input label="Position" value={form.position} maxLength={150} required onChange={(e) => setForm((f) => ({ ...f, position: e.target.value }))} />
      {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-xs text-red-800">{error}</p>}
      <Button type="submit" loading={loading}>Create Supervisor account</Button>
    </form>
  );
}
