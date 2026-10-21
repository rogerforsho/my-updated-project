'use client';

import { useEffect, useState, useCallback } from 'react';
import Alert from '@/src/components/ui/Alert';
import Badge from '@/src/components/ui/Badge';
import Button from '@/src/components/ui/Button';
import { listOwnAttendance } from '@/src/services/attendance';
import type { DbAttendance } from '@ojt/shared';

const PAGE_SIZE = 20;

export default function StudentAttendancePage() {
  const [records, setRecords] = useState<DbAttendance[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async (p: number) => {
    setLoading(true);
    setError('');
    const result = await listOwnAttendance(p, PAGE_SIZE);
    setLoading(false);
    if (result.error) { setError(result.error.message); return; }
    setRecords(result.data!.records);
    setTotal(result.data!.total);
  }, []);

  useEffect(() => {
    let isMounted = true;

    const fetchData = async () => {
      if (isMounted) {
        await load(page);
      }
    };

    fetchData();
    return () => {
      isMounted = false;
    };
  }, [page, load]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto page-fade-in">
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 font-serif tracking-tight">Attendance History</h1>
          <p className="text-xs text-slate-500 mt-1">Review your verified daily time-ins, time-outs, and punctuality records.</p>
        </div>
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200/80 text-xs font-semibold text-slate-700 w-fit">
          <span className="text-slate-400 font-normal">Total Records:</span>
          <span className="font-bold text-slate-900">{total}</span>
        </div>
      </div>

      {error && <div className="mb-4"><Alert type="error" message={error} /></div>}

      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20 text-slate-400 text-xs">Loading attendance records...</div>
        ) : records.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400">
            <span className="text-4xl mb-3">📋</span>
            <p className="text-sm font-semibold text-slate-700">No attendance records logged yet.</p>
            <p className="text-xs text-slate-400 mt-1">Daily records will appear here as you log time in and time out.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200/80 bg-slate-50/75 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                <tr>
                  <th className="px-5 py-3.5 font-medium text-slate-600">Date</th>
                  <th className="px-5 py-3.5 font-medium text-slate-600">Time In</th>
                  <th className="px-5 py-3.5 font-medium text-slate-600">Time Out</th>
                  <th className="px-5 py-3.5 font-medium text-slate-600">Punctuality</th>
                  <th className="px-5 py-3.5 font-medium text-slate-600">Verification</th>
                  <th className="px-5 py-3.5 font-medium text-slate-600">Sync Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {records.map(r => (
                  <tr key={r.attendance_id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-5 py-4 font-semibold text-slate-900">{r.attendance_date}</td>
                    <td className="px-5 py-4 text-slate-700 font-mono text-xs">
                      {r.time_in ? new Date(r.time_in).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                    </td>
                    <td className="px-5 py-4 text-slate-700 font-mono text-xs">
                      {r.time_out ? new Date(r.time_out).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : (
                        <span className="text-amber-600 text-xs font-medium">Pending Time Out</span>
                      )}
                    </td>
                    <td className="px-5 py-4"><Badge status={r.late_status} /></td>
                    <td className="px-5 py-4"><Badge status={r.verification_status} /></td>
                    <td className="px-5 py-4"><Badge status={r.sync_status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 text-xs text-slate-500">
          <span>Page {page} of {totalPages} ({total} total)</span>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>Previous</Button>
            <Button variant="ghost" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>Next</Button>
          </div>
        </div>
      )}
    </div>
  );
}
