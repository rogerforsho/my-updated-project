'use client';

import Link from 'next/link';
import Button from '@/src/components/ui/Button';
import { Badge } from '@/src/components/ui/Badge';
import { Printer, ArrowLeft } from '@/src/components/ui/Icons';
import type { StudentEvaluationSummary } from '@/src/services/evaluations';

interface Props {
  summary: StudentEvaluationSummary;
}

export default function EvaluationSummaryClient({ summary }: Props) {
  const midterm = summary.midterm;
  const final = summary.final;
  const midtermScores = midterm?.rubric_scores as Record<string, number> | null;
  const finalScores = final?.rubric_scores as Record<string, number> | null;

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-5xl mx-auto page-fade-in">
      {/* Top Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 print:hidden">
        <div>
          <Link
            href="/student/certificate"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#0A3824] hover:underline mb-2"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Graduation Clearance
          </Link>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Official Practicum Evaluation Summary
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Consolidated Midterm and Final industry mentor competency ratings.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={() => window.print()}
            className="bg-[#0A3824] hover:bg-[#092E1D] text-[var(--cdm-sand)] font-bold shadow-md cursor-pointer flex items-center gap-2"
          >
            <Printer className="w-4 h-4" /> Print / Save as PDF
          </Button>
        </div>
      </div>

      {/* Printable Sheet Canvas */}
      <div className="bg-white border border-slate-200 shadow-md rounded-2xl p-6 sm:p-10 space-y-8 print:border-none print:shadow-none print:p-0">
        {/* Institutional Header */}
        <div className="text-center border-b border-slate-200 pb-6 space-y-1">
          <div className="flex items-center justify-center gap-2 mb-1">
            <span className="text-[10px] uppercase font-bold tracking-widest text-[#0A3824] bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
              Colegio de Montalban • Practicum Portfolio
            </span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 font-serif tracking-tight">
            COLEGIO DE MONTALBAN
          </h2>
          <p className="text-xs text-slate-500 uppercase tracking-wider">
            Kasiglahan Village, Rodriguez, Rizal • Office of Student Practicum & Placement
          </p>
          <h3 className="text-base font-extrabold text-[#0A3824] uppercase tracking-wide pt-2">
            Trainee Competency Evaluation Summary Sheet
          </h3>
        </div>

        {/* Trainee & Establishment Profile */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs bg-slate-50/80 p-4 rounded-xl border border-slate-200/80">
          <div className="space-y-1.5">
            <p><span className="font-bold text-slate-600">Student Trainee:</span> <strong className="text-slate-900 text-sm">{summary.student_name}</strong></p>
            <p><span className="font-bold text-slate-600">Student Number:</span> <span className="font-mono">{summary.student_number}</span></p>
            <p><span className="font-bold text-slate-600">Academic Program:</span> <Badge variant="outline" className="bg-white">{summary.course}</Badge></p>
          </div>
          <div className="space-y-1.5">
            <p><span className="font-bold text-slate-600">Host Training Establishment:</span> <strong className="text-slate-900">{summary.company_name}</strong></p>
            <p><span className="font-bold text-slate-600">Immediate Supervisor:</span> <span>{summary.supervisor_name}</span></p>
            <p>
              <span className="font-bold text-slate-600">Clearance Status:</span>{' '}
              <span className={`font-bold ${summary.has_passed ? 'text-emerald-700' : 'text-amber-700'}`}>
                {summary.has_passed ? '✓ Passing Threshold Met (≥75%)' : 'Awaiting Final Ratings'}
              </span>
            </p>
          </div>
        </div>

        {/* 5-Dimension Rubric Comparison: Midterm vs Final */}
        <div className="space-y-3">
          <h4 className="text-xs font-black uppercase tracking-wider text-slate-900 border-b border-slate-200 pb-1.5">
            CHED SIPP 5-Dimension Competency Rubric Breakdown
          </h4>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="bg-slate-100/80 border-b border-slate-200 font-bold text-slate-700">
                  <th className="py-2.5 px-3">Competency Dimension</th>
                  <th className="py-2.5 px-3 text-center">Max Points</th>
                  <th className="py-2.5 px-3 text-center">Midterm (243h)</th>
                  <th className="py-2.5 px-3 text-center">Final Exit (486h)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                <tr>
                  <td className="py-2.5 px-3 font-medium text-slate-800">1. Technical Competence & Quality of Output</td>
                  <td className="py-2.5 px-3 text-center font-mono text-slate-400">25 pts</td>
                  <td className="py-2.5 px-3 text-center font-mono font-bold text-slate-900">
                    {midtermScores?.technical_competence ?? (midterm ? '—' : 'Pending')}
                  </td>
                  <td className="py-2.5 px-3 text-center font-mono font-bold text-[#0A3824]">
                    {finalScores?.technical_competence ?? (final ? '—' : 'Pending')}
                  </td>
                </tr>
                <tr>
                  <td className="py-2.5 px-3 font-medium text-slate-800">2. Productivity, Efficiency & Dependability</td>
                  <td className="py-2.5 px-3 text-center font-mono text-slate-400">20 pts</td>
                  <td className="py-2.5 px-3 text-center font-mono font-bold text-slate-900">
                    {midtermScores?.productivity_dependability ?? (midterm ? '—' : 'Pending')}
                  </td>
                  <td className="py-2.5 px-3 text-center font-mono font-bold text-[#0A3824]">
                    {finalScores?.productivity_dependability ?? (final ? '—' : 'Pending')}
                  </td>
                </tr>
                <tr>
                  <td className="py-2.5 px-3 font-medium text-slate-800">3. Attendance, Punctuality & Shift Compliance</td>
                  <td className="py-2.5 px-3 text-center font-mono text-slate-400">20 pts</td>
                  <td className="py-2.5 px-3 text-center font-mono font-bold text-slate-900">
                    {midtermScores?.attendance_punctuality ?? (midterm ? '—' : 'Pending')}
                  </td>
                  <td className="py-2.5 px-3 text-center font-mono font-bold text-[#0A3824]">
                    {finalScores?.attendance_punctuality ?? (final ? '—' : 'Pending')}
                  </td>
                </tr>
                <tr>
                  <td className="py-2.5 px-3 font-medium text-slate-800">4. Communication Skills & Team Collaboration</td>
                  <td className="py-2.5 px-3 text-center font-mono text-slate-400">15 pts</td>
                  <td className="py-2.5 px-3 text-center font-mono font-bold text-slate-900">
                    {midtermScores?.communication_skills ?? (midterm ? '—' : 'Pending')}
                  </td>
                  <td className="py-2.5 px-3 text-center font-mono font-bold text-[#0A3824]">
                    {finalScores?.communication_skills ?? (final ? '—' : 'Pending')}
                  </td>
                </tr>
                <tr>
                  <td className="py-2.5 px-3 font-medium text-slate-800">5. Professionalism, Work Ethics & Initiative</td>
                  <td className="py-2.5 px-3 text-center font-mono text-slate-400">20 pts</td>
                  <td className="py-2.5 px-3 text-center font-mono font-bold text-slate-900">
                    {midtermScores?.work_ethics_professionalism ?? (midterm ? '—' : 'Pending')}
                  </td>
                  <td className="py-2.5 px-3 text-center font-mono font-bold text-[#0A3824]">
                    {finalScores?.work_ethics_professionalism ?? (final ? '—' : 'Pending')}
                  </td>
                </tr>
                <tr className="bg-slate-50/90 font-bold border-t-2 border-slate-300">
                  <td className="py-3 px-3 uppercase text-slate-900">Total Appraisal Rating:</td>
                  <td className="py-3 px-3 text-center font-mono text-slate-500">100%</td>
                  <td className="py-3 px-3 text-center font-mono text-base text-slate-900">
                    {midterm?.performance_score !== null && midterm?.performance_score !== undefined
                      ? `${midterm.performance_score}%`
                      : 'Not Rated'}
                  </td>
                  <td className="py-3 px-3 text-center font-mono text-base text-[#0A3824]">
                    {final?.performance_score !== null && final?.performance_score !== undefined
                      ? `${final.performance_score}%`
                      : 'Not Rated'}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Qualitative Feedback Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div className="p-4 rounded-xl bg-amber-50/50 border border-amber-200/80 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="font-bold text-amber-900 uppercase tracking-wider text-[11px]">
                Midterm Mentor Feedback
              </span>
              <span className="text-[10px] text-amber-700">
                {midterm?.evaluation_date ? new Date(midterm.evaluation_date).toLocaleDateString() : 'Pending'}
              </span>
            </div>
            <p className="text-slate-700 italic leading-relaxed">
              {midterm?.feedback ? `“${midterm.feedback}”` : 'Midterm qualitative feedback has not yet been submitted.'}
            </p>
          </div>

          <div className="p-4 rounded-xl bg-emerald-50/50 border border-emerald-200/80 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="font-bold text-emerald-900 uppercase tracking-wider text-[11px]">
                Final Exit Mentor Appraisal
              </span>
              <span className="text-[10px] text-emerald-700">
                {final?.evaluation_date ? new Date(final.evaluation_date).toLocaleDateString() : 'Pending'}
              </span>
            </div>
            <p className="text-slate-700 italic leading-relaxed">
              {final?.feedback ? `“${final.feedback}”` : 'Final exit evaluation and remarks have not yet been submitted.'}
            </p>
          </div>
        </div>

        {/* Overall Weighted Grade Summary Banner */}
        <div className="p-4 sm:p-5 rounded-2xl bg-[#092E1D] text-white flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="space-y-1">
            <span className="text-xs uppercase font-extrabold text-[var(--cdm-sand)] tracking-wider">
              Practicum Final Evaluation Grade
            </span>
            <p className="text-xs text-slate-300">
              Composite Academic Grade (Midterm 40% + Final 60%)
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-3xl font-black font-mono text-[var(--cdm-sand)]">
              {summary.overall_rating !== null ? `${summary.overall_rating}%` : 'Pending'}
            </span>
            <Badge className={`text-xs font-bold px-3 py-1 ${
              summary.has_passed ? 'bg-emerald-500 text-white' : 'bg-amber-500 text-white'
            }`}>
              {summary.has_passed ? 'PASSED (≥ 75.0%)' : 'INCOMPLETE'}
            </Badge>
          </div>
        </div>

        {/* Academic Signatures */}
        <div className="pt-10 grid grid-cols-3 gap-6 text-center text-xs">
          <div className="space-y-1">
            <div className="border-b border-slate-400 pb-2">
              <span className="font-bold text-slate-900 text-xs">{summary.supervisor_name}</span>
            </div>
            <p className="text-[10px] text-slate-500 font-semibold uppercase">Company Practicum Supervisor</p>
            <p className="text-[9px] text-slate-400">Host Training Establishment</p>
          </div>

          <div className="space-y-1">
            <div className="border-b border-slate-400 pb-2">
              <span className="font-bold text-slate-900 text-xs">OJT Coordinator</span>
            </div>
            <p className="text-[10px] text-slate-500 font-semibold uppercase">College Practicum Faculty</p>
            <p className="text-[9px] text-slate-400">Colegio de Montalban</p>
          </div>

          <div className="space-y-1">
            <div className="border-b border-slate-400 pb-2">
              <span className="font-bold text-slate-900 text-xs">Dean / Program Head</span>
            </div>
            <p className="text-[10px] text-slate-500 font-semibold uppercase">Institute of Computing Studies / IBE</p>
            <p className="text-[9px] text-slate-400">Colegio de Montalban</p>
          </div>
        </div>
      </div>
    </div>
  );
}
