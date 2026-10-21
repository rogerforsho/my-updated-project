'use client';

import { useMemo, useState } from 'react';
import { simulateCompletion } from '@ojt/shared';
import type { StudentProgressDetail } from '@/src/services/progress';

export default function WhatIfClient({ students }: { students: StudentProgressDetail[] }) {
  const [studentId, setStudentId] = useState(students[0]?.student_id ?? '');
  const [weeklyHours, setWeeklyHours] = useState('40');
  const [missedWeeks, setMissedWeeks] = useState('0');
  const [asOfDate, setAsOfDate] = useState(new Date().toISOString().slice(0, 10));
  const selected = students.find(student => student.student_id === studentId);
  const scenario = useMemo(() => selected ? simulateCompletion({
    completedHours: selected.completed_hours,
    requiredHours: selected.required_hours,
    plannedWeeklyHours: Number(weeklyHours),
    missedWeeks: Number(missedWeeks),
    asOfDate,
  }) : null, [selected, weeklyHours, missedWeeks, asOfDate]);

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 sm:p-6 lg:p-8 page-fade-in">
      <header>
        <p className="text-[10px] font-black uppercase tracking-widest text-emerald-800">Read-only planning</p>
        <h1 className="text-2xl font-bold text-slate-900">What-if analysis</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-500">Explore how a different weekly pace or missed weeks could affect completion. Scenarios run in this page only and never change student records.</p>
      </header>
      {students.length === 0 ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">No students are available in your department scope.</section>
      ) : (
        <>
          <section className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-5 sm:grid-cols-2">
            <label className="text-xs font-semibold text-slate-700 sm:col-span-2">Student
              <select value={studentId} onChange={event => setStudentId(event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal">
                {students.map(student => <option key={student.student_id} value={student.student_id}>{student.full_name} · {student.student_number} · {student.course}</option>)}
              </select>
            </label>
            <div className="rounded-xl bg-slate-50 p-3">
              <p className="text-[10px] font-bold uppercase text-slate-500">Verified progress baseline</p>
              <p className="mt-1 text-lg font-bold text-slate-900">{selected?.completed_hours ?? 0} / {selected?.required_hours ?? 0} hours</p>
              <p className="text-xs text-slate-500">{selected?.company_name ?? 'No assigned HTE'}</p>
            </div>
            <label className="text-xs font-semibold text-slate-700">Hypothetical weekly hours (max 40)
              <input type="number" min="1" max="40" step="0.5" value={weeklyHours} onChange={event => setWeeklyHours(event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal" />
            </label>
            <label className="text-xs font-semibold text-slate-700">Weeks missed in the scenario (0–52)
              <input type="number" min="0" max="52" step="1" value={missedWeeks} onChange={event => setMissedWeeks(event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal" />
            </label>
            <label className="text-xs font-semibold text-slate-700">Scenario start date
              <input type="date" value={asOfDate} onChange={event => setAsOfDate(event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal" />
            </label>
          </section>
          <section aria-live="polite" className="rounded-2xl border border-emerald-900 bg-[#092E1D] p-6 text-white">
            <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-200">Projected outcome</p>
            {scenario?.ok ? (
              <div className="mt-2 grid gap-4 sm:grid-cols-2">
                <div><p className="text-sm text-emerald-100">Estimated practicum weeks</p><p className="text-3xl font-black">{scenario.weeksToCompletion}</p></div>
                <div><p className="text-sm text-emerald-100">Estimated completion date</p><p className="text-2xl font-black">{scenario.projectedFinishDate ? new Date(`${scenario.projectedFinishDate}T00:00:00`).toLocaleDateString() : 'Complete'}</p></div>
              </div>
            ) : <p className="mt-3 text-sm text-amber-100">{scenario?.message ?? 'Select a student to model a scenario.'}</p>}
            <p className="mt-5 text-[11px] leading-relaxed text-emerald-100/80">Estimate assumes the chosen weekly pace continues without holidays, schedule changes, or further attendance adjustments. Only verified hours form the baseline; this projection does not approve or record future hours.</p>
          </section>
        </>
      )}
    </div>
  );
}
