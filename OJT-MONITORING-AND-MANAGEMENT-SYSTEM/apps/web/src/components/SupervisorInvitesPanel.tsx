'use client';

import { useCallback, useEffect, useState } from 'react';
import { CompanyPicker } from '@/src/components/ui/CompanyPicker';
import {
  createSupervisorInvite, listSupervisorInvites, revokeSupervisorInvite, type SupervisorInviteRow,
} from '@/src/services/supervisorInvites';

const STATUS: Record<SupervisorInviteRow['status'], string> = {
  active: 'bg-emerald-100 text-emerald-900', used_up: 'bg-slate-100 text-slate-600',
  expired: 'bg-slate-100 text-slate-600', revoked: 'bg-red-100 text-red-900',
};

const COLS = 'grid grid-cols-[1.5rem_minmax(0,1fr)_3rem_3.5rem_6rem_5.5rem_4rem] items-center gap-x-3 px-3';
const fmt = (iso: string) => new Date(iso).toLocaleString();

/** One table row; the chevron or the row opens a drawer with the details that would not fit the columns. */
function InviteRow({ invite: i, onRevoke }: { invite: SupervisorInviteRow; onRevoke: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const drawer = `invite-${i.invite_id}`;
  return (
    <div>
      <div className={`${COLS} cursor-pointer py-1.5 hover:bg-slate-50`} onClick={() => setOpen((o) => !o)}>
        <button type="button" aria-expanded={open} aria-controls={drawer} aria-label={`${open ? 'Hide' : 'Show'} details for ${i.company_name}`}
          onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }} className="text-slate-500">
          <span aria-hidden className={`inline-block transition-transform ${open ? 'rotate-180' : ''}`}>▼</span>
        </button>
        <span className="truncate font-semibold text-slate-900" title={i.company_name}>{i.company_name}</span>
        <span className="text-xs text-slate-600">{i.department}</span>
        <span className="text-xs tabular-nums text-slate-600">{i.use_count}/{i.max_uses}</span>
        <span className="text-xs tabular-nums text-slate-600">{new Date(i.expires_at).toLocaleDateString()}</span>
        <span><span className={`rounded-full px-2 py-0.5 text-xs font-bold ${STATUS[i.status]}`}>{i.status.replace('_', ' ')}</span></span>
        <span className="text-right">
          {i.status === 'active' && <button type="button" onClick={(e) => { e.stopPropagation(); onRevoke(i.invite_id); }} className="text-xs font-bold text-red-700 underline">Revoke</button>}
        </span>
      </div>
      {open && (
        <dl id={drawer} className="grid grid-cols-1 gap-x-6 gap-y-1 bg-slate-50 px-3 py-2 pl-[2.25rem] text-xs sm:grid-cols-2">
          <div><dt className="inline font-semibold text-slate-500">Link ID </dt><dd className="inline break-all font-mono text-slate-800">{i.invite_id}</dd></div>
          <div><dt className="inline font-semibold text-slate-500">Created by </dt><dd className="inline break-all font-mono text-slate-800">{i.created_by ?? 'unknown'}</dd></div>
          <div><dt className="inline font-semibold text-slate-500">Created </dt><dd className="inline text-slate-800">{fmt(i.created_at)}</dd></div>
          <div><dt className="inline font-semibold text-slate-500">Expires </dt><dd className="inline text-slate-800">{fmt(i.expires_at)}</dd></div>
          {i.revoked_at && <div><dt className="inline font-semibold text-slate-500">Revoked </dt><dd className="inline text-slate-800">{fmt(i.revoked_at)}</dd></div>}
        </dl>
      )}
    </div>
  );
}

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
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white text-sm">
        <div className={`${COLS} border-b border-slate-200 bg-slate-50 py-2 text-[11px] font-bold uppercase tracking-wide text-slate-500`} role="row">
          <span />
          <span>Company</span><span>Dept</span><span>Used</span><span>Expires</span><span>Status</span><span className="text-right">Action</span>
        </div>
        <div className="divide-y divide-slate-100">
          {invites.map((i) => <InviteRow key={i.invite_id} invite={i} onRevoke={revoke} />)}
        </div>
        {!invites.length && <p className="p-6 text-sm text-slate-500">No invitation links yet.</p>}
      </div>
    </section>
  );
}
