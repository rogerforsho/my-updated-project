'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import type { VerificationStatus } from '@ojt/shared';
import Alert from '@/src/components/ui/Alert';
import Badge from '@/src/components/ui/Badge';
import Button from '@/src/components/ui/Button';
import Modal from '@/src/components/ui/Modal';
import { coordinatorOverrideVerifyAttendance, getSelfieUrl, listAttendanceForCoordinator, type AttendanceWithStudent } from '@/src/services/attendance';

const PAGE_SIZE = 20;
const FILTERS: { label: string; value: VerificationStatus | undefined }[] = [
  { label: 'Pending review', value: 'pending' },
  { label: 'Verified', value: 'verified' },
  { label: 'Rejected', value: 'rejected' },
  { label: 'All records', value: undefined },
];
const timestamp = (value?: string | null) => value ? new Date(value).toLocaleString() : '—';

export function ExceptionReview() {
  const [records, setRecords] = useState<AttendanceWithStudent[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState<VerificationStatus | undefined>('pending');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [selected, setSelected] = useState<AttendanceWithStudent | null>(null);
  const [timeInPhoto, setTimeInPhoto] = useState('');
  const [timeOutPhoto, setTimeOutPhoto] = useState('');
  const [photoLoading, setPhotoLoading] = useState(false);
  const [decision, setDecision] = useState<'verified' | 'rejected' | null>(null);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const photoRequest = useRef(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    const result = await listAttendanceForCoordinator(page, PAGE_SIZE, filter);
    setLoading(false);
    if (result.error) { setError(result.error.message); return; }
    setRecords(result.data?.records ?? []);
    setTotal(result.data?.total ?? 0);
  }, [page, filter]);

  useEffect(() => { void load(); }, [load]);

  async function openRecord(record: AttendanceWithStudent) {
    const request = ++photoRequest.current;
    setSelected(record);
    setDecision(null);
    setReason('');
    setError('');
    setTimeInPhoto('');
    setTimeOutPhoto('');
    setPhotoLoading(true);
    const [timeIn, timeOut] = await Promise.all([
      record.time_in_selfie_path ? getSelfieUrl(record.time_in_selfie_path) : Promise.resolve(null),
      record.time_out_selfie_path ? getSelfieUrl(record.time_out_selfie_path) : Promise.resolve(null),
    ]);
    if (request !== photoRequest.current) return;
    setTimeInPhoto(timeIn?.data?.url ?? '');
    setTimeOutPhoto(timeOut?.data?.url ?? '');
    setPhotoLoading(false);
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 page-fade-in">
      <header className="mb-6">
        <h1 className="text-2xl font-black text-slate-900 font-serif tracking-tight">Attendance exceptions</h1>
        <p className="mt-1 text-sm text-slate-600">Review delayed or exceptional attendance within your department grants. Every Coordinator decision requires a reason and is recorded in the audit log.</p>
      </header>

      {error && <div className="mb-4"><Alert type="error" message={error} /></div>}
      {success && <div className="mb-4"><Alert type="success" message={success} /></div>}

      <div className="flex flex-wrap gap-2 mb-4" role="group" aria-label="Filter attendance records">
        {FILTERS.map(item => <button key={item.label} type="button" onClick={() => { setFilter(item.value); setPage(1); }} aria-pressed={filter === item.value} className={`rounded-lg px-3 py-2 text-xs font-semibold ${filter === item.value ? 'bg-[var(--cdm-green)] text-white' : 'bg-white text-slate-600 border border-slate-200'}`}>{item.label}</button>)}
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        {loading ? <p className="p-12 text-center text-sm text-slate-500">Loading attendance…</p> : records.length === 0 ? <p className="p-12 text-center text-sm text-slate-500">No attendance records for this filter.</p> : (
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="p-4">Student</th><th className="p-4">Date</th><th className="p-4">Captured</th><th className="p-4">Received by server</th><th className="p-4">Review</th><th className="p-4 text-right">Evidence</th></tr></thead>
            <tbody className="divide-y divide-slate-100">{records.map(record => <tr key={record.attendance_id}>
              <td className="p-4"><p className="font-semibold text-slate-900">{record.students?.users?.full_name || 'Student'}</p><p className="text-xs text-slate-500">{record.students?.student_number}</p></td>
              <td className="p-4 whitespace-nowrap">{record.attendance_date}</td>
              <td className="p-4 text-xs"><div>In: {timestamp(record.time_in)}</div><div>Out: {timestamp(record.time_out)}</div></td>
              <td className="p-4 text-xs"><div>In: {timestamp(record.time_in_received_at)}</div><div>Out: {timestamp(record.time_out_received_at)}</div></td>
              <td className="p-4"><Badge status={record.verification_status} />{record.time_in_flag_reason && <p className="mt-1 max-w-56 text-xs text-amber-800">{record.time_in_flag_reason}</p>}</td>
              <td className="p-4 text-right"><Button size="sm" variant="outline" onClick={() => void openRecord(record)}>{record.verification_status === 'pending' ? 'Review' : 'View'}</Button></td>
            </tr>)}</tbody>
          </table>
        )}
      </div>

      <div className="mt-4 flex items-center justify-between text-xs text-slate-500">
        <span>{total ? `${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, total)} of ${total}` : '0 records'}</span>
        <div className="flex gap-2"><Button size="sm" variant="outline" disabled={page <= 1 || loading} onClick={() => setPage(value => value - 1)}>Previous</Button><Button size="sm" variant="outline" disabled={page >= totalPages || loading} onClick={() => setPage(value => value + 1)}>Next</Button></div>
      </div>

      <Modal title="Review attendance exception" open={Boolean(selected)} onClose={() => { if (!saving) { photoRequest.current++; setSelected(null); } }} size="xl">
        {selected && <div className="space-y-5">
          <div className="rounded-xl bg-slate-50 p-4 text-sm"><p className="font-semibold text-slate-900">{selected.students?.users?.full_name} · {selected.students?.student_number}</p><p className="mt-1 text-slate-600">Attendance date: {selected.attendance_date}</p>
            <dl className="mt-3 grid gap-3 sm:grid-cols-2"><div><dt className="text-xs font-semibold text-slate-500">Time in captured</dt><dd>{timestamp(selected.time_in)}</dd><dt className="mt-1 text-xs text-slate-500">Server received</dt><dd>{timestamp(selected.time_in_received_at)}</dd></div><div><dt className="text-xs font-semibold text-slate-500">Time out captured</dt><dd>{timestamp(selected.time_out)}</dd><dt className="mt-1 text-xs text-slate-500">Server received</dt><dd>{timestamp(selected.time_out_received_at)}</dd></div></dl>
            {(selected.time_in_flag_reason || selected.time_out_flag_reason) && <p className="mt-3 text-amber-800">Flag: {selected.time_in_flag_reason || selected.time_out_flag_reason}</p>}
          </div>
          {photoLoading ? <p className="text-sm text-slate-500">Loading photo evidence…</p> : <div className="grid gap-4 sm:grid-cols-2">{[["Time-in photo", timeInPhoto], ["Time-out photo", timeOutPhoto]].map(([label, url]) => <section key={label}><h3 className="mb-2 text-xs font-semibold text-slate-700">{label}</h3>{url ? <Image src={url} alt={`${label} evidence`} width={800} height={600} unoptimized className="max-h-72 w-full rounded-xl border border-slate-200 object-contain" /> : <p className="rounded-xl bg-slate-50 p-8 text-center text-xs text-slate-500">No photo available</p>}</section>)}</div>}
          {selected.verification_status === 'pending' ? <div className="border-t border-slate-200 pt-4"><label htmlFor="exception-reason" className="mb-1 block text-sm font-semibold text-slate-800">Reason for this decision</label><textarea id="exception-reason" value={reason} onChange={event => setReason(event.target.value)} minLength={10} maxLength={1000} rows={3} required className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-700/20" placeholder="Record the evidence reviewed and why this exception is approved or rejected." /><p className="mt-1 text-xs text-slate-500">10–1000 characters. This reason is saved with the decision.</p>
            <div className="mt-4 flex flex-wrap justify-end gap-2"><Button variant="outline" disabled={saving || photoLoading || reason.trim().length < 10} loading={saving && decision === 'rejected'} onClick={() => { setDecision('rejected'); void decideWith('rejected'); }}>Reject exception</Button><Button disabled={saving || photoLoading || reason.trim().length < 10} loading={saving && decision === 'verified'} onClick={() => { setDecision('verified'); void decideWith('verified'); }}>Verify exception</Button></div>
          </div> : <div className="border-t border-slate-200 pt-3 text-sm text-slate-600">This record has already been decided and cannot be changed.</div>}
          {error && <Alert type="error" message={error} />}
        </div>}
      </Modal>
    </div>
  );

  async function decideWith(value: 'verified' | 'rejected') {
    if (!selected || reason.trim().length < 10 || saving) return;
    setDecision(value);
    setSaving(true);
    setError('');
    const result = await coordinatorOverrideVerifyAttendance(selected.attendance_id, value, reason);
    setSaving(false);
    if (result.error) { setError(result.error.message); return; }
    setSelected(null);
    setSuccess(`Attendance ${value === 'verified' ? 'verified' : 'rejected'} with an audit reason.`);
    await load();
  }
}
