'use client';

import { useEffect, useState } from 'react';
import { getDtr, type DtrData } from '@/src/services/timecard';
import { buildDtrMonth } from '@/src/lib/dtr';

// Print -> Save as PDF, same approach as the certificate. Only the sheet is visible when printing.
const PRINT_CSS = `
@page { size: A4 portrait; margin: 0; }
@media print {
  body * { visibility: hidden !important; }
  .dtr-sheet, .dtr-sheet * { visibility: visible !important; }
  .dtr-sheet { position: absolute; left: 0; top: 0; width: 210mm; box-shadow: none !important; margin: 0 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
}`;

const monthTitle = (ym: string) => {
  const [y, m] = ym.split('-').map(Number);
  return `${new Date(Date.UTC(y, m - 1, 1)).toLocaleString('en', { month: 'long', timeZone: 'UTC' }).toUpperCase()} ${y}`;
};
const t12 = (hm: string) => { if (!hm) return ''; const h = Number(hm.slice(0, 2)); return `${h % 12 || 12}:${hm.slice(3)}`; };
const cell = 'border border-black px-1 py-0.5 text-center text-[11px]';

export function DtrSheet({ studentId, initialMonth, onClose }: { studentId: string; initialMonth: string; onClose: () => void }) {
  const [month, setMonth] = useState(initialMonth);
  const [data, setData] = useState<DtrData | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    setData(null); setError('');
    void getDtr(studentId, month).then((res) => {
      if (!live) return;
      if (res.error || !res.data) setError(res.error?.message ?? 'Could not load the record.'); else setData(res.data);
    });
    return () => { live = false; };
  }, [studentId, month]);

  const dtr = data && buildDtrMonth(data.rows, month, data.schedule);
  const official = data?.schedule.lunchStart ? `${data.schedule.dailyHours} hrs/day, lunch ${t12(data.schedule.lunchStart)} (${data.schedule.lunchMinutes} min)` : `${data?.schedule.dailyHours ?? 8} hrs/day`;

  return (
    <div className="fixed inset-0 z-50 overflow-auto bg-slate-900/60 p-4" role="dialog" aria-label="Daily Time Record">
      <style>{PRINT_CSS}</style>
      <div className="mx-auto mb-3 flex max-w-[210mm] flex-wrap items-center gap-2 rounded-xl bg-white p-3 text-sm">
        <label className="flex items-center gap-2 font-semibold">Month
          <input type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-1 font-normal" />
        </label>
        <button type="button" disabled={!dtr} onClick={() => window.print()} className="rounded-lg bg-[var(--cdm-green)] px-3 py-2 text-xs font-bold text-white disabled:opacity-50">Download DTR (PDF)</button>
        <button type="button" onClick={onClose} className="ml-auto rounded-lg border border-slate-300 px-3 py-2 text-xs font-bold text-slate-700">Close</button>
        <p className="w-full text-xs text-slate-500">In the print dialog choose “Save as PDF”.</p>
      </div>
      {error && <p role="alert" className="mx-auto max-w-[210mm] rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {!data && !error && <p className="text-center text-sm text-white">Loading…</p>}
      {data && dtr && (
        <div className="dtr-sheet mx-auto min-h-[297mm] w-[210mm] max-w-full bg-white p-[12mm_14mm] font-serif text-black shadow-xl">
          <p className="text-[11px] font-bold">Civil Service Form No. 48</p>
          <h2 className="mt-1 text-center text-[22px] font-bold tracking-[2px]">DAILY TIME RECORD</h2>
          <p className="text-center text-[11px]">-----o0o-----</p>
          <p className="mx-8 mt-3 border-b border-black text-center text-[15px] font-bold uppercase">{data.student.name}</p>
          <p className="mb-2 text-center text-[10px]">(Name)</p>
          <div className="mb-2 flex justify-between text-[11px]">
            <p>For the month of <b className="border-b border-black">{monthTitle(month)}</b></p>
            <p>Official hours: <b>{official}</b></p>
          </div>
          <p className="mb-2 text-[11px]">Student No. {data.student.number}{data.student.course ? ` · ${data.student.course}` : ''}{data.student.company ? ` · Company: ${data.student.company}` : ''}</p>
          <table className="w-full border-collapse">
            <thead>
              <tr><th rowSpan={2} className={cell}>Day</th><th colSpan={2} className={cell}>A.M.</th><th colSpan={2} className={cell}>P.M.</th><th colSpan={2} className={cell}>Undertime</th><th rowSpan={2} className={cell}>Status</th><th rowSpan={2} className={cell}>Credited<br />hrs</th></tr>
              <tr><th className={cell}>Arrival</th><th className={cell}>Departure</th><th className={cell}>Arrival</th><th className={cell}>Departure</th><th className={cell}>Hours</th><th className={cell}>Minutes</th></tr>
            </thead>
            <tbody>
              {dtr.days.map((d) => (
                <tr key={d.day} className={d.weekend ? 'bg-gray-100 text-gray-500' : ''}>
                  <td className={cell}>{d.day}</td>
                  <td className={cell}>{t12(d.amIn)}</td><td className={cell}>{t12(d.amOut)}</td><td className={cell}>{t12(d.pmIn)}</td><td className={cell}>{t12(d.pmOut)}</td>
                  <td className={cell}>{d.underMinutes == null ? '' : Math.floor(d.underMinutes / 60)}</td>
                  <td className={cell}>{d.underMinutes == null ? '' : d.underMinutes % 60}</td>
                  <td className={`${cell} text-[10px] font-semibold`}>{d.status || (d.weekend ? d.weekday : '')}</td>
                  <td className={cell}>{d.hours == null ? '' : d.hours.toFixed(2)}</td>
                </tr>
              ))}
              <tr>
                <td colSpan={5} className={`${cell} text-right font-bold`}>TOTAL</td>
                <td className={`${cell} font-bold`}>{Math.floor(dtr.totalUnderMinutes / 60)}</td>
                <td className={`${cell} font-bold`}>{dtr.totalUnderMinutes % 60}</td>
                <td className={cell} />
                <td className={`${cell} font-bold`}>{dtr.totalHours.toFixed(2)}</td>
              </tr>
            </tbody>
          </table>
          <p className="mt-3 indent-6 text-[11px]">I CERTIFY on my honor that the above is a true and correct report of the hours of work performed, record of which was made daily at the time of arrival at and departure from office.</p>
          <div className="mt-6 ml-[55%] text-center text-[11px]"><div className="border-t border-black pt-0.5 font-bold uppercase">{data.student.name}</div>Signature of student</div>
          <p className="mt-3 text-[11px]">VERIFIED as to the prescribed office hours.</p>
          <div className="mt-6 ml-[55%] text-center text-[11px]"><div className="border-t border-black pt-0.5 font-bold">&nbsp;</div>Supervisor{data.student.company ? `, ${data.student.company}` : ''}</div>
          <p className="mt-4 text-[10px]">Generated by the OJT Monitoring and Management System, Colegio de Montalban, from selfie and GPS verified attendance records.</p>
        </div>
      )}
    </div>
  );
}
