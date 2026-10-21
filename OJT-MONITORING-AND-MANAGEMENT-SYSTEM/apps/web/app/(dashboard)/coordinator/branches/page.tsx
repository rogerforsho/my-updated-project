'use client';

import { useEffect, useState } from 'react';
import { createCompanyBranch, listCompanies, listCompanyBranches, type CompanyWithSupervisors } from '@/src/services/companies';
import type { DbCompanyBranch } from '@ojt/shared';

export default function BranchesPage() {
  const [companies, setCompanies] = useState<CompanyWithSupervisors[]>([]);
  const [companyId, setCompanyId] = useState('');
  const [branches, setBranches] = useState<DbCompanyBranch[]>([]);
  const [form, setForm] = useState({ branch_name: '', address: '', latitude: '', longitude: '', radius: '150' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { void listCompanies(1, 100).then((result) => {
    if (result.data) { setCompanies(result.data.companies); setCompanyId(result.data.companies[0]?.company_id ?? ''); }
    else setError(result.error?.message ?? 'Could not load HTEs.');
  }); }, []);
  useEffect(() => { if (companyId) void listCompanyBranches(companyId).then((result) => {
    if (result.data) setBranches(result.data); else setError(result.error?.message ?? 'Could not load branches.');
  }); else setBranches([]); }, [companyId]);

  async function submit(event: React.FormEvent) {
    event.preventDefault(); setError(''); setSaving(true);
    const result = await createCompanyBranch({
      company_id: companyId, branch_name: form.branch_name, address: form.address,
      latitude: Number(form.latitude), longitude: Number(form.longitude), geofence_radius_meters: Number(form.radius),
    });
    setSaving(false);
    if (result.error) { setError(result.error.message); return; }
    setForm({ branch_name: '', address: '', latitude: '', longitude: '', radius: '150' });
    const refreshed = await listCompanyBranches(companyId);
    if (refreshed.data) setBranches(refreshed.data);
  }

  return <main className="mx-auto max-w-5xl p-6 lg:p-8">
    <h1 className="text-2xl font-bold text-slate-900">HTE Branches</h1>
    <p className="mt-1 text-sm text-slate-600">Add verified work locations. Attendance uses the assigned branch geofence.</p>
    {!!error && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    <label className="mt-6 block text-sm font-semibold">Host Training Establishment</label>
    <select className="mt-2 w-full rounded-lg border p-2.5" value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
      {companies.map((company) => <option key={company.company_id} value={company.company_id}>{company.company_name}</option>)}
    </select>
    <div className="mt-5 space-y-2">{branches.map((branch) => <div key={branch.branch_id} className="rounded-xl border bg-white p-4">
      <p className="font-semibold text-slate-900">{branch.branch_name}{branch.is_primary ? ' · Primary' : ''}</p>
      <p className="text-sm text-slate-600">{branch.address}</p>
      <p className="text-xs text-slate-500">{branch.latitude}, {branch.longitude} · {branch.geofence_radius_meters} m radius</p>
    </div>)}</div>
    {!!companyId && <form onSubmit={submit} className="mt-6 rounded-xl border bg-white p-5">
      <h2 className="font-bold text-slate-900">Add verified branch</h2>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <input required maxLength={150} value={form.branch_name} onChange={(e) => setForm({ ...form, branch_name: e.target.value })} placeholder="Branch name" className="rounded-lg border p-2.5" />
        <input required maxLength={500} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Street address" className="rounded-lg border p-2.5 sm:col-span-2" />
        <input required type="number" min={-90} max={90} step="any" value={form.latitude} onChange={(e) => setForm({ ...form, latitude: e.target.value })} placeholder="Latitude" className="rounded-lg border p-2.5" />
        <input required type="number" min={-180} max={180} step="any" value={form.longitude} onChange={(e) => setForm({ ...form, longitude: e.target.value })} placeholder="Longitude" className="rounded-lg border p-2.5" />
        <input required type="number" min={50} max={5000} value={form.radius} onChange={(e) => setForm({ ...form, radius: e.target.value })} aria-label="Geofence radius in meters" className="rounded-lg border p-2.5" />
      </div>
      <button disabled={saving} className="mt-4 rounded-lg bg-emerald-800 px-4 py-2 font-semibold text-white disabled:opacity-50">{saving ? 'Saving…' : 'Add branch'}</button>
    </form>}
  </main>;
}
