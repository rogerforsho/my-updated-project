'use client';

import { useCallback, useEffect, useState } from 'react';
import { CompanyPicker } from '@/src/components/ui/CompanyPicker';
import {
  createSupervisorInvite, listSupervisorInvites, revokeSupervisorInvite, type SupervisorInviteRow,
} from '@/src/services/supervisorInvites';

const STATUS: Record<SupervisorInviteRow['status'], string> = {
  active: 'bg-emerald-50 text-emerald-800', used_up: 'bg-slate-100 text-slate-600',
  expired: 'bg-slate-100 text-slate-600', revoked: 'bg-red-50 text-red-800',
};

/** Coordinator-issued sign-up links for Supervisors: two uses, seven days, department and company fixed. */
export function SupervisorInvitesPanel() {
  const [invites, setInvites] = useState<SupervisorInviteRow[]>([]);
  const [departments, setDepartments] = useState<('ICS' | 'IBE')[]>([]);
  const [department, setDepartment] = useState<'ICS' | 'IBE'>('ICS');
  const [companyId, setCompanyId] = useState('');
  const [link, setLink] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await listSupervisorInvites();
    if (res.data) {
      setInvites(res.data.invites); setDepartments(res.data.departments);
      setDepartment((d) => (res.data!.departments.includes(d) ? d : res.data!.departments[0]));
    } else setMsg(res.error?.message ?? 'Could not load links.');
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg(''); setLink('');
    const res = await createSupervisorInvite({ company_id: companyId, department });
    setBusy(false);
    if (res.error || !res.data) { setMsg(res.error?.message ?? 'Could not create the link.'); return; }
    setLink(res.data.url);
    await load();
  }
  async function copy() {
    try { await navigator.clipboard.writeText(link); setMsg('Link copied.'); } catch { setMsg('Copy the link manually.'); }
  }
  async function revoke(id: string) {
    const res = await revokeSupervisorInvite(id);
    if (res.error) setMsg(res.error.message); else await load();
  }

  if (!departments.length && !msg) return null;
  const field = 'rounded-lg border border-slate-300 px-3 py-2 text-sm';
  return (
    <section className="mt-8 space-y-4" aria-label="Supervisor invitation links">
      <div>
        <h2 className="text-lg font-bold text-slate-900">Invitation links</h2>
        <p className="text-sm text-slate-500">Send a company a link so its Supervisors can sign up themselves. Each link works for two sign-ups and expires after 7 days.</p>
      </div>
      {departments.length > 0 && (
        <form onSubmit={create} className="flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white p-4">
          <label className="flex flex-col gap-1 text-xs font-semibold text-slate-700">Department
            <select value={department} onChange={(e) => setDepartment(e.target.value as 'ICS' | 'IBE')} className={field}>
              {departments.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </label>
          <div className="w-64"><CompanyPicker value={companyId} onChange={(id) => setCompanyId(id)} /></div>
          <button type="submit" disabled={busy || !companyId} className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">Create link</button>
        </form>
      )}
      {link && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm">
          <p className="font-semibold text-amber-900">Copy this link now. It cannot be shown again.</p>
          <p className="mt-1 break-all font-mono text-xs text-slate-800">{link}</p>
          <button type="button" onClick={copy} className="mt-2 rounded-lg border border-amber-300 px-3 py-1.5 text-xs font-bold text-amber-900">Copy link</button>
        </div>
      )}
      {msg && <p role="status" className="text-sm text-slate-700">{msg}</p>}
      <div className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white">
        {invites.map((i) => (
          <div key={i.invite_id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
            <div>
              <span className="font-semibold text-slate-900">{i.company_name}</span>
              <span className="ml-2 text-xs text-slate-500">{i.department} · used {i.use_count}/{i.max_uses} · expires {new Date(i.expires_at).toLocaleDateString()}</span>
            </div>
            <div className="flex items-center gap-3">
              <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase ${STATUS[i.status]}`}>{i.status.replace('_', ' ')}</span>
              {i.status === 'active' && <button type="button" onClick={() => revoke(i.invite_id)} className="text-xs font-bold text-red-700 underline">Revoke</button>}
            </div>
          </div>
        ))}
        {!invites.length && <p className="p-6 text-sm text-slate-500">No invitation links yet.</p>}
      </div>
    </section>
  );
}
