'use client';
// PROTOTYPE (throwaway): three radically different layouts for /supervisor/reports.
// Each variant is a full-viewport shell (own sidebar + top bar) with the same nav as the current portal:
// My Students, Attendance, Daily Reports, Evaluations, Messages, Notifications, Account Settings, Sign Out.
import { useState } from 'react';
import Link from 'next/link';
import type { ReportWithStudent } from '@/src/services/reports';

export type VProps = {
  reports: ReportWithStudent[];
  filter: 'all' | 'pending' | 'endorsed';
  setFilter: (f: 'all' | 'pending' | 'endorsed') => void;
  openDoc: (path: string, id: string) => void;
  review: (r: ReportWithStudent) => void;
};

const NAV = [
  { label: 'My Students', href: '/supervisor/students', icon: '👥' },
  { label: 'Attendance', href: '/supervisor/attendance', icon: '🕒' },
  { label: 'Daily Reports', href: '/supervisor/reports', icon: '📄' },
  { label: 'Evaluations', href: '/supervisor/evaluations', icon: '⭐' },
  { label: 'Messages', href: '/supervisor/messages', icon: '💬' },
  { label: 'Notifications', href: '/supervisor/notifications', icon: '🔔' },
];

const name = (r: ReportWithStudent) => r.students?.users?.full_name ?? 'Unknown';
const type = (r: ReportWithStudent) => r.report_type.replace(/_/g, ' ');
const when = (d: string) => new Date(d).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
const initials = (r: ReportWithStudent) => name(r).split(' ').map((w) => w[0]).slice(0, 2).join('');
const FILTERS = [['all', 'All Reports'], ['pending', 'Needs Review'], ['endorsed', 'Decided']] as const;

function Seg({ filter, setFilter, dark }: Pick<VProps, 'filter' | 'setFilter'> & { dark?: boolean }) {
  return (
    <div className={`inline-flex rounded-full p-1 ${dark ? 'bg-white/10' : 'bg-slate-100'}`}>
      {FILTERS.map(([k, l]) => (
        <button key={k} onClick={() => setFilter(k)}
          className={`px-4 py-1.5 rounded-full text-xs font-bold cursor-pointer ${filter === k ? 'bg-[#0A3824] text-[#E4DBC4] shadow' : dark ? 'text-white/70' : 'text-slate-600'}`}>{l}</button>
      ))}
    </div>
  );
}

function TopBar({ title }: { title: string }) {
  return (
    <header className="h-16 shrink-0 bg-white border-b border-slate-200 flex items-center justify-between px-6">
      <h2 className="font-bold text-slate-900">{title}</h2>
      <div className="flex items-center gap-4 text-sm">
        <span className="hidden sm:inline rounded-full border border-slate-200 px-3 py-1 text-xs">● CdM Cloud · ISO/IEC 25010</span>
        <span>🔔</span><span>🌙</span>
        <span className="flex items-center gap-2"><b className="grid place-items-center w-9 h-9 rounded-full bg-[#0A3824] text-white">L</b><span className="leading-tight"><b className="block text-sm">Local Supervisor</b><i className="text-[10px] not-italic text-slate-500">Supervisor</i></span></span>
      </div>
    </header>
  );
}

function Decision({ r }: { r: ReportWithStudent }) {
  const d = r.supervisor_decision;
  const c = d === 'approved' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : d === 'returned' ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-amber-50 text-amber-700 border-amber-200';
  return <span className={`inline-block rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${c}`}>{(d ?? 'pending').toUpperCase()}</span>;
}

/* ---------- A: dark sidebar (as in the screenshot) + stat strip + review-queue rows ---------- */
export function VariantA({ reports, filter, setFilter, openDoc, review }: VProps) {
  const pending = reports.filter((r) => !r.supervisor_decision).length;
  const [q, setQ] = useState('');
  const rows = reports.filter((r) => name(r).toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="fixed inset-0 z-[8000] flex bg-[#F6F7F4]">
      <aside className="w-64 shrink-0 bg-[#092E1D] text-white flex flex-col">
        <div className="h-16 flex items-center gap-3 px-5 border-b border-white/10"><span className="w-9 h-9 rounded-full bg-[#E4DBC4]" /><b className="text-sm leading-tight">Colegio de Montalban<br /><small className="text-[10px] tracking-wider">OJT PRACTICUM PORTAL</small></b></div>
        <nav className="p-3 space-y-1 flex-1">
          {NAV.map((n) => (
            <Link key={n.label} href={n.href} className={`flex items-center gap-3 rounded-xl px-4 py-2.5 text-sm ${n.label === 'Daily Reports' ? 'bg-white/10 ring-1 ring-white/20 font-bold' : 'text-white/70 hover:bg-white/5'}`}>{n.icon} {n.label}</Link>
          ))}
        </nav>
        <div className="p-3 text-sm text-white/70 space-y-1"><div className="px-4 py-2">⚙ Account Settings</div><div className="px-4 py-2 text-rose-300">⇥ Sign Out</div></div>
      </aside>
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar title="Daily Accomplishment Reports" />
        <main className="flex-1 overflow-y-auto p-6 space-y-5">
          <div className="grid grid-cols-3 gap-4">
            {[['Needs your review', pending, 'text-amber-600'], ['Decided', reports.length - pending, 'text-emerald-700'], ['Total submissions', reports.length, 'text-slate-900']].map(([l, v, c]) => (
              <div key={l as string} className="rounded-2xl bg-white border border-slate-200 p-5"><p className="text-xs uppercase tracking-wider text-slate-500 font-semibold">{l}</p><p className={`text-4xl font-bold mt-1 ${c}`}>{v}</p></div>
            ))}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Seg filter={filter} setFilter={setFilter} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search intern…" className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm w-64" />
          </div>
          <ul className="space-y-3">
            {rows.map((r) => (
              <li key={r.report_id} className="flex items-center gap-4 rounded-2xl bg-white border border-slate-200 p-4 border-l-4" style={{ borderLeftColor: r.supervisor_decision ? '#10b981' : '#f59e0b' }}>
                <b className="grid place-items-center w-11 h-11 rounded-full bg-emerald-50 text-[#0A3824]">{initials(r)}</b>
                <div className="w-56"><p className="font-bold">{name(r)}</p><p className="text-xs text-slate-400 font-mono">{r.students?.student_number} • {r.students?.course}</p></div>
                <div className="flex-1"><p className="font-semibold capitalize">{type(r)}</p><p className="text-xs text-slate-400">Submitted {when(r.submission_date)}</p>{r.supervisor_feedback && <p className="text-xs text-slate-600 mt-1 line-clamp-1">“{r.supervisor_feedback}”</p>}</div>
                <Decision r={r} />
                <button onClick={() => openDoc(r.file_path, r.report_id)} className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-[#0A3824] cursor-pointer">📄 Document</button>
                {!r.supervisor_decision && <button onClick={() => review(r)} className="rounded-lg bg-[#0A3824] px-4 py-1.5 text-xs font-bold text-[#E4DBC4] cursor-pointer">Review</button>}
              </li>
            ))}
          </ul>
        </main>
      </div>
    </div>
  );
}

/* ---------- B: icon rail + master/detail split view ---------- */
export function VariantB({ reports, filter, setFilter, openDoc, review }: VProps) {
  const [sel, setSel] = useState<string | null>(null);
  const cur = reports.find((r) => r.report_id === sel) ?? reports[0];
  return (
    <div className="fixed inset-0 z-[8000] flex bg-white">
      <aside className="w-[72px] shrink-0 bg-[#0A3824] flex flex-col items-center py-4 gap-2 text-white">
        <span className="w-10 h-10 rounded-full bg-[#E4DBC4] mb-4" />
        {NAV.map((n) => (
          <Link key={n.label} href={n.href} title={n.label} className={`group relative grid place-items-center w-12 h-12 rounded-2xl text-lg ${n.label === 'Daily Reports' ? 'bg-[#E4DBC4] text-black' : 'hover:bg-white/10'}`}>
            {n.icon}<span className="absolute left-14 hidden group-hover:block whitespace-nowrap rounded bg-black px-2 py-1 text-xs z-10">{n.label}</span>
          </Link>
        ))}
        <div className="mt-auto text-lg space-y-3 text-center">⚙<br /><span className="text-rose-300">⇥</span></div>
      </aside>
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar title="Daily Accomplishment Reports" />
        <div className="flex-1 flex min-h-0">
          <section className="w-96 shrink-0 border-r border-slate-200 flex flex-col">
            <div className="p-4 border-b border-slate-100"><Seg filter={filter} setFilter={setFilter} /></div>
            <ul className="flex-1 overflow-y-auto divide-y divide-slate-100">
              {reports.map((r) => (
                <li key={r.report_id}><button onClick={() => setSel(r.report_id)} className={`w-full text-left px-4 py-3.5 flex gap-3 cursor-pointer ${cur?.report_id === r.report_id ? 'bg-emerald-50' : 'hover:bg-slate-50'}`}>
                  <span className={`mt-1.5 w-2.5 h-2.5 rounded-full shrink-0 ${r.supervisor_decision ? 'bg-emerald-500' : 'bg-amber-400'}`} />
                  <span className="flex-1 min-w-0"><b className="block text-sm">{name(r)}</b><span className="block text-xs text-slate-500 capitalize">{type(r)} · {when(r.submission_date)}</span></span>
                </button></li>
              ))}
            </ul>
          </section>
          <section className="flex-1 overflow-y-auto bg-[#F6F7F4] p-8">
            {!cur ? <p className="text-slate-400">No reports.</p> : (
              <div className="max-w-2xl mx-auto bg-white rounded-3xl border border-slate-200 p-8 space-y-6">
                <div className="flex items-center gap-4"><b className="grid place-items-center w-14 h-14 rounded-full bg-[#0A3824] text-[#E4DBC4] text-lg">{initials(cur)}</b><div className="flex-1"><h3 className="text-xl font-bold">{name(cur)}</h3><p className="text-xs font-mono text-slate-400">{cur.students?.student_number} • {cur.students?.course}</p></div><Decision r={cur} /></div>
                <div className="grid grid-cols-2 gap-4 text-sm"><div><p className="text-xs uppercase text-slate-500 font-semibold">Category</p><p className="capitalize font-semibold">{type(cur)}</p></div><div><p className="text-xs uppercase text-slate-500 font-semibold">Submitted</p><p className="font-semibold">{when(cur.submission_date)}</p></div></div>
                {cur.remarks && <blockquote className="rounded-xl bg-slate-50 border border-slate-100 p-4 text-sm italic">“{cur.remarks}”</blockquote>}
                <button onClick={() => openDoc(cur.file_path, cur.report_id)} className="w-full rounded-2xl border-2 border-dashed border-emerald-300 bg-emerald-50 py-6 font-bold text-[#0A3824] cursor-pointer">📄 Open document</button>
                {cur.supervisor_decision ? <div className="rounded-xl bg-emerald-50 p-4 text-sm"><b className="uppercase">{cur.supervisor_decision}</b> — {cur.supervisor_feedback}</div>
                  : <button onClick={() => review(cur)} className="w-full rounded-2xl bg-[#0A3824] py-3 font-bold text-[#E4DBC4] cursor-pointer">Review & decide</button>}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

/* ---------- C: light sidebar + kanban lanes ---------- */
export function VariantC({ reports, openDoc, review }: VProps) {
  const lanes = [
    ['Needs review', (r: ReportWithStudent) => !r.supervisor_decision, 'bg-amber-400'],
    ['Approved', (r: ReportWithStudent) => r.supervisor_decision === 'approved', 'bg-emerald-500'],
    ['Returned', (r: ReportWithStudent) => r.supervisor_decision === 'returned', 'bg-rose-500'],
  ] as const;
  return (
    <div className="fixed inset-0 z-[8000] flex bg-[#EEF1EC]">
      <aside className="w-60 shrink-0 bg-white border-r border-slate-200 flex flex-col p-4">
        <div className="flex items-center gap-2 mb-6"><span className="w-9 h-9 rounded-xl bg-[#0A3824]" /><b className="text-sm leading-tight">CdM OJT<br /><small className="text-slate-400 text-[10px]">PRACTICUM PORTAL</small></b></div>
        <nav className="space-y-1 flex-1">
          {NAV.map((n) => (
            <Link key={n.label} href={n.href} className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm ${n.label === 'Daily Reports' ? 'bg-emerald-50 text-[#0A3824] font-bold border-l-4 border-[#0A3824]' : 'text-slate-600 hover:bg-slate-50'}`}>{n.icon} {n.label}</Link>
          ))}
        </nav>
        <div className="text-sm text-slate-500 space-y-2 pt-3 border-t"><div>⚙ Account Settings</div><div className="text-rose-600">⇥ Sign Out</div></div>
      </aside>
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar title="Daily Accomplishment Reports" />
        <main className="flex-1 overflow-x-auto p-6">
          <div className="flex gap-5 h-full min-w-[900px]">
            {lanes.map(([title, test, dot]) => {
              const items = reports.filter(test);
              return (
                <section key={title} className="flex-1 flex flex-col rounded-2xl bg-white/60 border border-slate-200 min-h-0">
                  <h3 className="px-4 py-3 font-bold flex items-center gap-2"><span className={`w-2.5 h-2.5 rounded-full ${dot}`} />{title}<span className="ml-auto text-xs bg-white rounded-full px-2 py-0.5 border">{items.length}</span></h3>
                  <div className="flex-1 overflow-y-auto p-3 space-y-3">
                    {items.map((r) => (
                      <article key={r.report_id} className="rounded-xl bg-white border border-slate-200 p-4 shadow-sm space-y-2">
                        <div className="flex items-center gap-2"><b className="grid place-items-center w-8 h-8 rounded-full bg-emerald-50 text-xs text-[#0A3824]">{initials(r)}</b><div className="min-w-0"><p className="font-bold text-sm truncate">{name(r)}</p><p className="text-[11px] text-slate-400 font-mono">{r.students?.student_number}</p></div></div>
                        <p className="text-sm font-semibold capitalize">{type(r)} <span className="text-xs text-slate-400 font-normal">· {when(r.submission_date)}</span></p>
                        {r.supervisor_feedback && <p className="text-xs text-slate-600 bg-slate-50 rounded p-2">{r.supervisor_feedback}</p>}
                        <div className="flex gap-2 pt-1"><button onClick={() => openDoc(r.file_path, r.report_id)} className="flex-1 rounded-lg border border-slate-200 py-1.5 text-xs font-bold cursor-pointer">📄 View</button>{!r.supervisor_decision && <button onClick={() => review(r)} className="flex-1 rounded-lg bg-[#0A3824] py-1.5 text-xs font-bold text-[#E4DBC4] cursor-pointer">Review</button>}</div>
                      </article>
                    ))}
                    {items.length === 0 && <p className="text-center text-xs text-slate-400 py-8">Nothing here</p>}
                  </div>
                </section>
              );
            })}
          </div>
        </main>
      </div>
    </div>
  );
}
