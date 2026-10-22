'use client';

import { useEffect, useState, useCallback } from 'react';
import { listAttendanceForSupervisor, verifyAttendance, getSelfieUrl, batchVerifyAttendance, type AttendanceWithStudent } from '@/src/services/attendance';
import Button from '@/src/components/ui/Button';
import Badge from '@/src/components/ui/Badge';
import Modal from '@/src/components/ui/Modal';
import Alert from '@/src/components/ui/Alert';
import type { VerificationStatus } from '@ojt/shared';

const PAGE_SIZE = 20;

// Errand / justification entries are outside-geofence or no-GPS logs with a student note, at Time In or Time Out.
function isFieldEntry(r: AttendanceWithStudent) {
  return [r.time_in_location_status, r.time_out_location_status].some(s => s === 'flagged_out_of_bounds' || s === 'location_unavailable') ||
    Boolean(r.time_in_flag_reason || r.time_out_flag_reason);
}

const FILTERS: { label: string; value: VerificationStatus | undefined }[] = [
  { label: 'All Records', value: undefined },
  { label: 'Pending Review', value: 'pending' },
  { label: 'Verified', value: 'verified' },
  { label: 'Rejected', value: 'rejected' },
];

export default function SupervisorAttendancePage() {
  const [records, setRecords] = useState<AttendanceWithStudent[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState<VerificationStatus | undefined>('pending');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [batchLoading, setBatchLoading] = useState(false);
  const [batchIds, setBatchIds] = useState<string[]>([]);

  const [selected, setSelected] = useState<AttendanceWithStudent | null>(null);
  const [selfieUrl, setSelfieUrl] = useState('');
  const [timeOutSelfieUrl, setTimeOutSelfieUrl] = useState('');
  const [selfieLoading, setSelfieLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState('');

  const load = useCallback(async (p: number, f: VerificationStatus | undefined) => {
    setLoading(true);
    setError('');
    const result = await listAttendanceForSupervisor(p, PAGE_SIZE, f);
    setLoading(false);
    if (result.error) { setError(result.error.message); return; }
    setRecords(result.data!.records);
    setTotal(result.data!.total);
  }, []);

  useEffect(() => {
    load(page, filter);
  }, [page, filter, load]);

  async function openRecord(record: AttendanceWithStudent) {
    setSelected(record);
    setVerifyError('');
    setSelfieUrl('');
    setTimeOutSelfieUrl('');
    setSelfieLoading(true);

    const promises: Promise<any>[] = [];
    if (record.time_in_selfie_path) {
      promises.push(
        getSelfieUrl(record.time_in_selfie_path).then(res => {
          if (res.data?.url) setSelfieUrl(res.data.url);
        })
      );
    }
    if (record.time_out_selfie_path) {
      promises.push(
        getSelfieUrl(record.time_out_selfie_path).then(res => {
          if (res.data?.url) setTimeOutSelfieUrl(res.data.url);
        })
      );
    }
    await Promise.all(promises);
    setSelfieLoading(false);
  }

  async function handleVerify(status: 'verified' | 'rejected') {
    if (!selected) return;
    setVerifyError('');
    setVerifying(true);
    const result = await verifyAttendance(selected.attendance_id, status);
    setVerifying(false);
    if (result.error) { setVerifyError(result.error.message); return; }
    setSelected(null);
    load(page, filter);
  }

  async function handleBatchVerify() {
    if (batchIds.length === 0 || batchLoading) return;
    setBatchLoading(true);
    setError('');
    setSuccess('');
    try {
      const result = await batchVerifyAttendance(batchIds);
      if (result.error) { setError(result.error.message); return; }
      setSuccess(`Verified ${result.data?.verifiedCount || 0} of ${batchIds.length} requested records. Records already processed or no longer assigned were skipped.`);
      setBatchIds([]);
      await load(page, filter);
    } catch {
      setError('Unable to complete verification. Refresh the records before retrying.');
    } finally { setBatchLoading(false); }
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);

  const cleanLogs = records.filter(
    r => r.verification_status === 'pending' && r.late_status === 'on_time' && !isFieldEntry(r)
  );
  const fieldLogs = records.filter(r => r.verification_status === 'pending' && isFieldEntry(r));
  const lateLogs = records.filter(
    r => r.verification_status === 'pending' && r.late_status === 'late'
  );

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto page-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-black text-slate-900 font-serif tracking-tight">Attendance Verification</h1>
          <p className="text-xs text-slate-500 mt-1">Review trainee daily logs, selfie evidence, punctuality, and sync statuses.</p>
        </div>
        {filter === 'pending' && records.length > 0 && (
          <Button
            onClick={() => setBatchIds(records.filter(record => record.verification_status === 'pending').map(record => record.attendance_id))}
            loading={batchLoading}
            disabled={loading}
            className="bg-[#0A3824] hover:bg-[#092E1D] text-white font-bold text-xs shadow-2xs py-2 px-4 whitespace-nowrap"
          >
            Verify this page ({records.length})
          </Button>
        )}
      </div>

      {error && <div className="mb-4"><Alert type="error" message={error} /></div>}
      {success && <div className="mb-4"><Alert type="success" message={success} /></div>}
      <Modal title="Verify visible attendance" open={batchIds.length > 0} onClose={() => { if (!batchLoading) setBatchIds([]); }}>
        <p className="text-sm">Verify the {batchIds.length} pending records from this page? Review the selfie evidence and any location or punctuality flags before confirming.</p>
        <div className="flex justify-end gap-3 mt-5">
          <Button variant="outline" disabled={batchLoading} onClick={() => setBatchIds([])}>Cancel</Button>
          <Button loading={batchLoading} onClick={handleBatchVerify}>Verify {batchIds.length} records</Button>
        </div>
      </Modal>

      {/* Smart Compliance Triage Summary */}
      {filter === 'pending' && records.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 mb-5">
          <div className="p-4 rounded-2xl bg-white border border-emerald-200/90 shadow-2xs flex items-center justify-between">
            <div>
              <p className="text-[11px] font-bold text-emerald-800 uppercase tracking-wider">Clean Compliant Logs</p>
              <div className="flex items-baseline gap-2 mt-0.5">
                <span className="text-2xl font-black text-slate-900">{cleanLogs.length}</span>
                <span className="text-xs text-slate-400">/ {records.length} pending</span>
              </div>
              <p className="text-[11px] text-emerald-700 font-medium mt-0.5">Live selfie &amp; on-site GPS verified</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold text-base">
              ✓
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-white border border-amber-200/90 shadow-2xs flex items-center justify-between">
            <div>
              <p className="text-[11px] font-bold text-amber-800 uppercase tracking-wider">Field / Errand Work</p>
              <div className="flex items-baseline gap-2 mt-0.5">
                <span className="text-2xl font-black text-slate-900">{fieldLogs.length}</span>
                <span className="text-xs text-slate-400">require note review</span>
              </div>
              <p className="text-[11px] text-amber-700 font-medium mt-0.5">Recorded outside primary facility</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center font-bold text-base">
              📍
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-white border border-slate-200/90 shadow-2xs flex items-center justify-between">
            <div>
              <p className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">Tardy Arrivals</p>
              <div className="flex items-baseline gap-2 mt-0.5">
                <span className="text-2xl font-black text-slate-900">{lateLogs.length}</span>
                <span className="text-xs text-slate-400">exceeded grace period</span>
              </div>
              <p className="text-[11px] text-slate-500 font-medium mt-0.5">Clocked past schedule cutoff</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center font-bold text-base">
              ⏰
            </div>
          </div>
        </div>
      )}

      {/* Modern Filter Pill Bar */}
      <div className="flex items-center gap-1.5 p-1 bg-slate-100/90 rounded-xl border border-slate-200/80 w-fit mb-5 select-none">
        {FILTERS.map(f => (
          <button
            key={f.label}
            onClick={() => { setFilter(f.value); setPage(1); }}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
              filter === f.value
                ? 'bg-white text-slate-900 font-bold shadow-2xs border border-slate-200/60'
                : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20 text-slate-400 text-xs">Loading attendance records...</div>
        ) : records.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400">
            <span className="text-4xl mb-3">📋</span>
            <p className="text-sm font-semibold text-slate-700">No attendance records found for this filter.</p>
            <p className="text-xs text-slate-400 mt-1">All trainee attendance submissions are up to date.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200/80 bg-slate-50/75 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                <tr>
                  <th className="px-5 py-3.5 font-medium text-slate-600">Trainee</th>
                  <th className="px-5 py-3.5 font-medium text-slate-600">Date</th>
                  <th className="px-5 py-3.5 font-medium text-slate-600">Time In</th>
                  <th className="px-5 py-3.5 font-medium text-slate-600">Time Out</th>
                  <th className="px-5 py-3.5 font-medium text-slate-600">GPS Location</th>
                  <th className="px-5 py-3.5 font-medium text-slate-600">Schedule</th>
                  <th className="px-5 py-3.5 font-medium text-slate-600">Status</th>
                  <th className="px-5 py-3.5 text-right font-medium text-slate-600">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {records.map(r => {
                  const isOfflineSynced = r.sync_status === 'pending_sync' || Boolean(r.time_in_selfie_path?.includes('offline'));
                  const isField = isFieldEntry(r);
                  const isClean = r.verification_status === 'pending' && r.late_status === 'on_time' && !isField;
                  return (
                    <tr key={r.attendance_id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2">
                          <div>
                            <p className="font-semibold text-slate-900">{r.students?.users?.full_name}</p>
                            <p className="text-xs text-slate-400 font-mono mt-0.5">{r.students?.student_number}</p>
                          </div>
                          {isOfflineSynced && (
                            <span className="inline-flex items-center text-[10px] font-bold text-amber-800 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200" title="Captured offline and synced">
                              📁 Offline
                            </span>
                          )}
                        </div>
                        {r.verification_status === 'pending' && (
                          <div className="mt-1">
                            {isClean ? (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                                ✓ Clean Log
                              </span>
                            ) : isField ? (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200" title={r.time_in_flag_reason || r.time_out_flag_reason || ''}>
                                📍 Field Errand
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200">
                                ⏰ Tardy
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-5 py-4 text-slate-700 font-medium">{r.attendance_date}</td>
                      <td className="px-5 py-4 text-slate-700 font-mono text-xs">
                        {r.time_in ? new Date(r.time_in).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-'}
                      </td>
                      <td className="px-5 py-4 text-slate-700 font-mono text-xs">
                        {r.time_out ? new Date(r.time_out).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-'}
                      </td>
                      <td className="px-5 py-4">
                        {r.time_in_location_status === 'flagged_out_of_bounds' ? (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200">
                            📍 Off-Site / Field ({r.time_in_distance_meters ?? '?'}m)
                          </span>
                        ) : r.time_in_location_status === 'verified' && r.time_in_distance_meters != null ? (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                            📍 On-Site ({r.time_in_distance_meters}m)
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        <Badge status={r.late_status} />
                      </td>
                      <td className="px-5 py-4">
                        <Badge status={r.verification_status} />
                      </td>
                      <td className="px-5 py-4 text-right">
                        <Button
                          variant="ghost"
                          onClick={() => openRecord(r)}
                          className="bg-slate-50 hover:bg-slate-100 text-[#0A3824] text-xs font-semibold px-3 py-1.5 border border-slate-200"
                        >
                          Inspect & Verify
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 text-sm text-slate-500">
          <span>Page {page} of {totalPages} ({total} total)</span>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>Previous</Button>
            <Button variant="ghost" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>Next</Button>
          </div>
        </div>
      )}

      {/* Review Modal */}
      <Modal title="Inspect Attendance & Selfie Evidence" open={!!selected} onClose={() => setSelected(null)}>
        {selected && (
          <div className="space-y-4">
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-2.5">
                <span className="text-base">📁</span>
                <div>
                  <p className="text-xs font-bold text-amber-900">Attendance requires your review</p>
                  <p className="text-xs text-amber-700 mt-0.5">
                    Event times are reported by the student&apos;s device; server receipt times show when the system received them. Review both times and the evidence. Syncing never approves attendance.
                    {selected.time_in_received_at && ` Server received Time In at ${new Date(selected.time_in_received_at).toLocaleString()}.`}
                    {selected.time_out_received_at && ` Server received Time Out at ${new Date(selected.time_out_received_at).toLocaleString()}.`}
                  </p>
                </div>
            </div>

            {/* GPS Location Inspection */}
            {selected.time_in_location_status === 'flagged_out_of_bounds' ? (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-2.5">
                <span className="text-base">📍</span>
                <div className="flex-1">
                  <p className="text-xs font-bold text-amber-900">
                    Off-Site / Field Work Recorded ({selected.time_in_distance_meters ?? '?'}m from primary site)
                  </p>
                  {selected.time_in_flag_reason ? (
                    <p className="text-xs text-amber-800 mt-1 italic">
                      Trainee Note / Activity: &ldquo;{selected.time_in_flag_reason}&rdquo;
                    </p>
                  ) : (
                    <p className="text-xs text-amber-700 mt-0.5">
                      Recorded off-site or outside primary office premises. Review the trainee&apos;s coordinates and activity context.
                    </p>
                  )}
                  {selected.time_in_lat != null && selected.time_in_lng != null && (
                    <a
                      href={`https://www.openstreetmap.org/?mlat=${selected.time_in_lat}&mlon=${selected.time_in_lng}#map=18/${selected.time_in_lat}/${selected.time_in_lng}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-block mt-1.5 text-xs text-emerald-800 underline font-semibold"
                    >
                      View Coordinates on OpenStreetMap ↗
                    </a>
                  )}
                </div>
              </div>
            ) : selected.time_in_location_status === 'verified' && selected.time_in_distance_meters != null ? (
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 flex items-center justify-between text-xs text-emerald-900">
                <div className="flex items-center gap-2">
                  <span>📍</span>
                  <span className="font-semibold">
                    GPS Verified: Recorded {selected.time_in_distance_meters}m from assigned workplace.
                  </span>
                </div>
                {selected.time_in_lat != null && selected.time_in_lng != null && (
                  <a
                    href={`https://www.openstreetmap.org/?mlat=${selected.time_in_lat}&mlon=${selected.time_in_lng}#map=18/${selected.time_in_lat}/${selected.time_in_lng}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-emerald-700 underline font-medium"
                  >
                    Map Pin ↗
                  </a>
                )}
              </div>
            ) : null}

            {/* Notes the time-in banner above does not already show */}
            {[
              { label: 'Time In', status: selected.time_in_location_status, reason: selected.time_in_location_status === 'flagged_out_of_bounds' ? null : selected.time_in_flag_reason },
              { label: 'Time Out', status: selected.time_out_location_status, reason: selected.time_out_flag_reason },
            ].filter(note => note.reason).map(note => (
              <div key={note.label} className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs">
                <p className="font-bold text-amber-900">
                  {note.label}: {note.status === 'flagged_out_of_bounds' ? 'Outside the geofence' : note.status === 'location_unavailable' ? 'GPS location unavailable' : 'Flagged'}
                </p>
                <p className="text-amber-800 mt-1 italic">Trainee Note / Activity: &ldquo;{note.reason}&rdquo;</p>
              </div>
            ))}

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                <p className="text-xs text-slate-400 mb-0.5">Trainee</p>
                <p className="font-semibold text-slate-900">{selected.students?.users?.full_name}</p>
                <p className="text-xs text-slate-500 font-mono">{selected.students?.student_number}</p>
              </div>
              <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                <p className="text-xs text-slate-400 mb-0.5">Date & Punctuality</p>
                <p className="font-semibold text-slate-900">{selected.attendance_date}</p>
                <div className="mt-1"><Badge status={selected.late_status} /></div>
              </div>
              <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                <p className="text-xs text-slate-400 mb-0.5">Time In</p>
                <p className="font-mono text-xs font-semibold text-slate-900">
                  {selected.time_in ? new Date(selected.time_in).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-'}
                </p>
                {selected.time_in_received_at && <p className="mt-1 text-[10px] text-slate-500">Server received: {new Date(selected.time_in_received_at).toLocaleString()}</p>}
              </div>
              <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                <p className="text-xs text-slate-400 mb-0.5">Time Out</p>
                <p className="font-mono text-xs font-semibold text-slate-900">
                  {selected.time_out ? new Date(selected.time_out).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-'}
                </p>
                {selected.time_out_received_at && <p className="mt-1 text-[10px] text-slate-500">Server received: {new Date(selected.time_out_received_at).toLocaleString()}</p>}
              </div>
            </div>

            {/* Dual Selfie Evidence Preview */}
            <div className="space-y-1.5">
              <p className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                Photo Biometric Evidence
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Time In Selfie */}
                <div className="bg-slate-50 rounded-xl p-2.5 border border-slate-200 text-center">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[11px] font-bold text-slate-700">Time In Evidence</span>
                    <span className="text-[10px] font-mono text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                      {selected.time_in ? new Date(selected.time_in).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-'}
                    </span>
                  </div>
                  {selfieLoading ? (
                    <div className="h-44 bg-slate-100 rounded-lg flex items-center justify-center text-slate-400 text-xs">
                      Loading evidence...
                    </div>
                  ) : selfieUrl ? (
                    <img
                      src={selfieUrl}
                      alt="Time In Selfie"
                      className="w-full h-44 object-cover rounded-lg border border-slate-200 shadow-xs"
                    />
                  ) : (
                    <div className="h-44 bg-slate-100 rounded-lg flex items-center justify-center text-slate-400 text-xs">
                      No clock-in selfie recorded
                    </div>
                  )}
                </div>

                {/* Time Out Selfie */}
                <div className="bg-slate-50 rounded-xl p-2.5 border border-slate-200 text-center">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[11px] font-bold text-slate-700">Time Out Evidence</span>
                    <span className="text-[10px] font-mono text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                      {selected.time_out ? new Date(selected.time_out).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Pending'}
                    </span>
                  </div>
                  {selfieLoading ? (
                    <div className="h-44 bg-slate-100 rounded-lg flex items-center justify-center text-slate-400 text-xs">
                      Loading evidence...
                    </div>
                  ) : timeOutSelfieUrl ? (
                    <img
                      src={timeOutSelfieUrl}
                      alt="Time Out Selfie"
                      className="w-full h-44 object-cover rounded-lg border border-slate-200 shadow-xs"
                    />
                  ) : (
                    <div className="h-44 bg-slate-100 rounded-lg flex flex-col items-center justify-center text-slate-400 text-xs px-2">
                      <span>{selected.time_out ? 'No clock-out selfie recorded' : 'Trainee currently on duty'}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {verifyError && <Alert type="error" message={verifyError} />}

            {selected.verification_status === 'pending' ? (
              <div className="flex gap-3 pt-2">
                <Button
                  onClick={() => handleVerify('verified')}
                  loading={verifying}
                  className="flex-1 bg-[#0A3824] hover:bg-[#092E1D] text-white py-2 font-medium"
                >
                  ✓ Verify Attendance
                </Button>
                <Button
                  onClick={() => handleVerify('rejected')}
                  loading={verifying}
                  variant="ghost"
                  className="flex-1 text-red-600 hover:bg-red-50 border border-red-200 py-2 font-medium"
                >
                  ✕ Reject Record
                </Button>
              </div>
            ) : (
              <div className="text-center py-2 bg-slate-50 rounded-xl border border-slate-100 text-sm text-slate-600">
                This record has already been marked as <Badge status={selected.verification_status} />
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
