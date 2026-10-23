'use client';

import { useCallback, useEffect, useState } from 'react';
import { decideCompanyRequest, getCompanyRequestEvidenceUrl, listPendingCompanyRequests } from '@/src/services/companyRequests';
import type { DbCompanyRequest } from '@ojt/shared';

export default function CompanyRequestsPage() {
  const [rows, setRows] = useState<DbCompanyRequest[]>([]);
  const [selected, setSelected] = useState<DbCompanyRequest | null>(null);
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [feedback, setFeedback] = useState('');
  const [evidence, setEvidence] = useState<{ permit?: string; moa?: string }>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const result = await listPendingCompanyRequests();
    if (result.data) setRows(result.data);
    else setError(result.error?.message ?? 'Could not load requests.');
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!selected) { setEvidence({}); return; }
    let active = true;
    Promise.all([
      selected.business_permit_path ? getCompanyRequestEvidenceUrl(selected.request_id, 'business_permit') : Promise.resolve(null),
      selected.moa_path ? getCompanyRequestEvidenceUrl(selected.request_id, 'moa') : Promise.resolve(null),
    ]).then(([permit, moa]) => {
      if (active) setEvidence({ permit: permit?.data ?? undefined, moa: moa?.data ?? undefined });
    });
    return () => { active = false; };
  }, [selected]);

  async function decide(decision: 'approve' | 'reject') {
    if (!selected) return;
    setBusy(true); setError('');
    const result = await decideCompanyRequest({
      request_id: selected.request_id, decision, feedback,
      latitude: Number(latitude), longitude: Number(longitude), radius: 50,
    });
    setBusy(false);
    if (result.error) { setError(result.error.message); return; }
    setSelected(null); setFeedback(''); setLatitude(''); setLongitude('');
    await load();
  }

  return <main className="mx-auto max-w-5xl p-6 lg:p-8">
    <h1 className="text-2xl font-bold text-slate-900">HTE Requests</h1>
    <p className="mt-1 text-sm text-slate-600">Verify the business and branch before approval. Approval creates an active HTE and its first branch.</p>
    {!!error && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    <div className="mt-6 space-y-3">
      {rows.map((row) => <button key={row.request_id} onClick={() => setSelected(row)} className="w-full rounded-xl border border-slate-200 bg-white p-4 text-left hover:border-emerald-700">
        <span className="block font-semibold text-slate-900">{row.requested_company_name} · {row.requested_branch_name}</span>
        <span className="mt-1 block text-sm text-slate-600">{row.branch_address} · submitted {new Date(row.created_at).toLocaleDateString()}</span>
        <span className="mt-2 block text-xs text-slate-500">{row.business_permit_path ? 'Business permit attached' : 'No business permit'} · {row.moa_path ? 'MOA copy attached' : 'No MOA copy'}</span>
      </button>)}
      {!rows.length && <p className="rounded-xl bg-slate-50 p-6 text-sm text-slate-600">No pending HTE requests.</p>}
    </div>
    {selected && <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 sm:items-center">
      <section role="dialog" aria-modal="true" aria-labelledby="request-title" className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
        <h2 id="request-title" className="text-xl font-bold">{selected.requested_company_name}</h2>
        <dl className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
          {[["HTE address", selected.company_address], ["Branch", selected.requested_branch_name], ["Branch address", selected.branch_address], ["Contact", selected.contact_person], ["Email", selected.contact_email], ["Phone", selected.contact_number]].map(([label, value]) => <div key={label}><dt className="text-slate-500">{label}</dt><dd className="font-medium text-slate-900">{value}</dd></div>)}
          <div className="sm:col-span-2"><dt className="text-slate-500">Evidence</dt><dd className="flex flex-wrap gap-3 font-medium">
            {evidence.permit && <a href={evidence.permit} target="_blank" rel="noreferrer" className="text-emerald-800 underline">View business permit</a>}
            {evidence.moa && <a href={evidence.moa} target="_blank" rel="noreferrer" className="text-emerald-800 underline">View MOA copy</a>}
            {!selected.business_permit_path && !selected.moa_path && 'No optional evidence attached'}
          </dd></div>
        </dl>
        <p className="mt-5 text-sm font-semibold">Approved branch geofence pin (required)</p>
        <div className="mt-2 grid grid-cols-2 gap-3">
          <input aria-label="Latitude" value={latitude} onChange={(e) => setLatitude(e.target.value)} placeholder="Latitude" className="rounded-lg border p-2" />
          <input aria-label="Longitude" value={longitude} onChange={(e) => setLongitude(e.target.value)} placeholder="Longitude" className="rounded-lg border p-2" />
        </div>
        <label className="mt-4 block text-sm font-semibold">Decision feedback</label>
        <textarea value={feedback} onChange={(e) => setFeedback(e.target.value)} maxLength={3000} rows={3} className="mt-2 w-full rounded-lg border p-2" placeholder="Required when rejecting; optional approval note" />
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button onClick={() => setSelected(null)} className="rounded-lg border px-4 py-2">Close</button>
          <button disabled={busy || !feedback.trim()} onClick={() => void decide('reject')} className="rounded-lg border border-red-300 px-4 py-2 text-red-700 disabled:opacity-50">Reject</button>
          <button disabled={busy || !latitude.trim() || !longitude.trim()} onClick={() => void decide('approve')} className="rounded-lg bg-emerald-800 px-4 py-2 font-semibold text-white disabled:opacity-50">Approve HTE</button>
        </div>
      </section>
    </div>}
  </main>;
}
