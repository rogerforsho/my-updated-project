'use client';

import { useCallback, useEffect, useState } from 'react';
import { CompanyPicker } from '@/src/components/ui/CompanyPicker';
import { useSearchPaging, SearchBox, PagerBar } from '@/src/components/ui/ListControls';
import { addNonWorkingDay, deleteNonWorkingDay, listNonWorkingDays, type NonWorkingDay } from '@/src/services/nonWorkingDays';

type Scope = 'global' | 'department' | 'company';

/** Admin enters national holidays; coordinators enter department or company suspensions for their granted departments. */
export function NonWorkingDaysPanel({ mode, departments = [] }: { mode: 'admin' | 'coordinator'; departments?: ('ICS' | 'IBE')[] }) {
  const [days, setDays] = useState<NonWorkingDay[]>([]);
  const [date, setDate] = useState('');
  const [label, setLabel] = useState('');
  const [scope, setScope] = useState<Scope>(mode === 'admin' ? 'global' : 'department');
  const [department, setDepartment] = useState<'ICS' | 'IBE'>(departments[0] ?? 'ICS');
  const [companyId, setCompanyId] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await listNonWorkingDays(new Date().toISOString().slice(0, 10));
    if (res.data) setDays(res.data); else setMsg(res.error?.message ?? 'Could not load dates.');
  }, []);
  useEffect(() => { void load(); }, [load]);

  const list = useSearchPaging(days, (d) => `${d.day_date} ${d.label} ${d.scope} ${d.department ?? ''} ${d.companies?.company_name ?? ''}`, 10);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg('');
    const res = await addNonWorkingDay({
      day_date: date, label, scope,
      department: scope === 'global' ? undefined : department,
      company_id: scope === 'company' ? companyId : undefined,
    });
    setBusy(false);
    if (res.error) { setMsg(res.error.message); return; }
    setDate(''); setLabel('');
    await load();
  }
  async function remove(id: string) {
    const res = await deleteNonWorkingDay(id);
    if (res.error) setMsg(res.error.message); else await load();
  }

  const input = 'rounded-lg border border-slate-300 px-3 py-2 text-sm';
  return (
    <section className="space-y-4">
      <p className="text-sm text-slate-600">
        Hours students render are always counted. These dates only move the projected end date, because no work is expected on them.
      </p>
      <form onSubmit={add} className="flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white p-4">
        <label className="flex flex-col gap-1 text-xs font-semibold text-slate-700">Date
          <input type="date" required value={date} onChange={(e) => setDate(e.target.value)} className={input} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-slate-700">Name
          <input required maxLength={150} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Bonifacio Day" className={`${input} w-56`} />
        </label>
        {mode === 'coordinator' && (
          <>
            <label className="flex flex-col gap-1 text-xs font-semibold text-slate-700">Applies to
              <select value={scope} onChange={(e) => setScope(e.target.value as Scope)} className={input}>
                <option value="department">Whole department</option>
                <option value="company">One company</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-slate-700">Department
              <select value={department} onChange={(e) => setDepartment(e.target.value as 'ICS' | 'IBE')} className={input}>
                {departments.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </label>
            {scope === 'company' && <div className="w-64"><CompanyPicker value={companyId} onChange={(id) => setCompanyId(id)} /></div>}
          </>
        )}
        <button type="submit" disabled={busy || (scope === 'company' && !companyId)} className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">Add date</button>
      </form>
      {msg && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{msg}</p>}

      <SearchBox value={list.search} onChange={list.setSearch} placeholder="Search date, name or company..." />
      <div className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white">
        {list.visible.map((d) => {
          const own = mode === 'admin' ? d.scope === 'global' : d.scope !== 'global' && !!d.department && departments.includes(d.department);
          return (
            <div key={d.day_id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
              <div>
                <span className="font-semibold text-slate-900">{d.day_date}</span> · {d.label}
                <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold uppercase text-slate-600">
                  {d.scope === 'global' ? 'National' : d.scope === 'department' ? d.department : `${d.department} · ${d.companies?.company_name ?? 'Company'}`}
                </span>
              </div>
              {own && <button type="button" onClick={() => remove(d.day_id)} className="text-xs font-bold text-red-700 underline">Remove</button>}
            </div>
          );
        })}
        {!list.visible.length && <p className="p-6 text-sm text-slate-500">{list.search ? 'No dates match your search.' : 'No upcoming non-working days.'}</p>}
      </div>
      <PagerBar page={list.page} totalPages={list.totalPages} total={list.matched} setPage={list.setPage} />
    </section>
  );
}
