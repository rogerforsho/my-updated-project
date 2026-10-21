'use client';

import { useEffect, useState } from 'react';
import { flushSync } from 'react-dom';
import { isICSCourse, isIBECourse } from '@/src/lib/departments';
import { Card, CardHeader, CardTitle, CardContent } from '@/src/components/ui/Card';
import { Badge } from '@/src/components/ui/Badge';
import {
  Users,
  Building2,
  GraduationCap,
  Timer,
  Search,
  FileSpreadsheet,
  Printer,
  Laptop,
  Cpu,
  Briefcase,
  TrendingUp,
} from '@/src/components/ui/Icons';
import {
  type StudentProgressDetail,
  type DepartmentSummaryData,
} from '@/src/services/progress';

interface Props {
  summary: DepartmentSummaryData;
  initialStudents: StudentProgressDetail[];
  userDepartment: string;
}

export default function DepartmentReportsClient({
  summary,
  initialStudents,
  userDepartment,
}: Props) {
  const [activeDept, setActiveDept] = useState<'ICS' | 'IBE'>(userDepartment === 'IBE' ? 'IBE' : 'ICS');
  const [courseFilter, setCourseFilter] = useState<string>('ALL');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [page, setPage] = useState(1);
  const [printing, setPrinting] = useState(false);
  useEffect(() => {
    // Also support the browser's own Print command without mounting hidden rows.
    const before = () => flushSync(() => setPrinting(true));
    const after = () => setPrinting(false);
    window.addEventListener('beforeprint', before);
    window.addEventListener('afterprint', after);
    return () => {
      window.removeEventListener('beforeprint', before);
      window.removeEventListener('afterprint', after);
    };
  }, []);

  // Filter trainees strictly for the active department
  const filteredStudents = initialStudents.filter((s) => {
    const isICS = isICSCourse(s.course);
    const isIBE = isIBECourse(s.course);

    // 1. Department Boundary Check
    if (activeDept === 'ICS' && !isICS) return false;
    if (activeDept === 'IBE' && !isIBE) return false;

    // 2. Specific Course Filter
    if (courseFilter !== 'ALL') {
      const c = s.course.toUpperCase();
      if (courseFilter === 'BSIT' && !(c.includes('BSIT') || c.includes('INFORMATION TECHNOLOGY'))) return false;
      if (courseFilter === 'BS-CPE' && !(c.includes('BS-CPE') || c.includes('BSCPE') || c.includes('COMPUTER ENGINEERING'))) return false;
      if (courseFilter === 'BSBA-HRM' && !(c.includes('BSBA-HRM') || c.includes('BSBA-HR') || c.includes('HUMAN RESOURCE'))) return false;
      if (courseFilter === 'BSENTREP' && !(c.includes('BSENTREP') || c.includes('ENTREPRENEURSHIP'))) return false;
    }

    // 3. Status Filter
    if (statusFilter !== 'ALL' && s.progress_status !== statusFilter) return false;

    // 4. Search Filter
    if (search.trim()) {
      const q = search.toLowerCase();
      const matchesName = s.full_name.toLowerCase().includes(q);
      const matchesNum = s.student_number.toLowerCase().includes(q);
      const matchesCompany = (s.company_name || '').toLowerCase().includes(q);
      const matchesCourse = s.course.toLowerCase().includes(q);
      if (!matchesName && !matchesNum && !matchesCompany && !matchesCourse) return false;
    }

    return true;
  });

  const deptMetrics = activeDept === 'ICS' ? summary.ics : summary.ibe;
  const isICSView = activeDept === 'ICS';
  const pageCount = Math.max(1, Math.ceil(filteredStudents.length / 25));
  const currentPage = Math.min(page, pageCount);
  const visibleStudents = filteredStudents.slice((currentPage - 1) * 25, currentPage * 25);

  function exportCSV() {
    const headers = [
      'Student Number',
      'Student Name',
      'Course',
      'Host Training Establishment',
      'Target Hours',
      'Completed Hours',
      'Remaining Hours',
      'Progress Status',
      'Completion %',
    ];
    const csvCell = (value: string | number) => {
      const text = String(value);
      const safe = /^[\s]*[=+@-]/.test(text) ? `'${text}` : text;
      return `"${safe.replaceAll('"', '""')}"`;
    };
    const rows = filteredStudents.map((s) => [
      s.student_number,
      s.full_name,
      s.course,
      s.company_name || 'Unassigned',
      s.required_hours,
      s.completed_hours,
      s.remaining_hours,
      s.progress_status,
      `${s.percentage}%`,
    ]);

    const csvContent = [headers, ...rows].map(row => row.map(csvCell).join(',')).join('\r\n');
    const encodedUri = URL.createObjectURL(new Blob(['\uFEFF', csvContent], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute(
      'download',
      `CdM_OJT_${activeDept}_Report_${new Date().toISOString().split('T')[0]}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(encodedUri);
  }

  function handlePrint() {
    flushSync(() => setPrinting(true));
    try { window.print(); } finally { setPrinting(false); }
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-7 page-fade-in max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 print:hidden">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs uppercase font-extrabold tracking-wider text-[var(--cdm-sand)] bg-[#0A3824] px-2.5 py-0.5 rounded-full border border-[var(--cdm-sand)]/40">
              {isICSView ? 'ICS Department' : 'IBE Department'}
            </span>
            <span className="text-xs text-slate-500 font-medium">Academic Practicum Analytics</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 font-serif tracking-tight mt-1">
            {isICSView
              ? 'Institute of Computing Studies (ICS)'
              : 'Institute of Business and Entrepreneurship (IBE)'}
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            {isICSView
              ? 'Practicum cohort reporting for BS in Information Technology (BSIT) & BS in Computer Engineering (BS-CPE).'
              : 'Practicum cohort reporting for BSBA in Human Resource Management (BSBA-HRM) & BS in Entrepreneurship (BSEntrep).'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {userDepartment === 'ALL' && (
            <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-bold mr-2">
              {(['ICS', 'IBE'] as const).map(department => (
                <button key={department} type="button"
                  onClick={() => { setActiveDept(department); setCourseFilter('ALL'); }}
                  className={`px-3 py-1.5 rounded-lg transition-all ${activeDept === department ? 'bg-[#0A3824] text-[var(--cdm-sand)] shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
                >{department}</button>
              ))}
            </div>
          )}
          <button
            onClick={handlePrint}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-xl bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 shadow-sm transition-all cursor-pointer"
          >
            <Printer className="w-4 h-4 text-slate-600" />
            Print Report
          </button>
          <button
            onClick={exportCSV}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-xl bg-[#0A3824] text-white hover:bg-[#092E1D] shadow-sm transition-all cursor-pointer"
          >
            <FileSpreadsheet className="w-4 h-4 text-[var(--cdm-sand)]" />
            Export CSV
          </button>
        </div>
      </div>

      {/* KPI Cards for Selected Department Only */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-slate-200/80 shadow-xs bg-white rounded-2xl">
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                {activeDept} Enrolled Trainees
              </p>
              <p className="text-2xl font-bold text-slate-900 mt-1">{deptMetrics.total}</p>
              <p className="text-[11px] text-slate-400 mt-0.5">Active senior cohort</p>
            </div>
            <div className="w-11 h-11 rounded-xl bg-slate-50 border border-slate-200/90 text-[#0A3824] flex items-center justify-center">
              <Users className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200/80 shadow-xs bg-white rounded-2xl">
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Active In Field</p>
              <p className="text-2xl font-bold text-[#0A3824] mt-1">
                {isICSView ? summary.ics.bsit.active + summary.ics.bscpe.active : summary.ibe.bsbaHrm.active + summary.ibe.bsEntrep.active}
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5">Practicum in progress</p>
            </div>
            <div className="w-11 h-11 rounded-xl bg-slate-50 border border-slate-200/90 text-[#0A3824] flex items-center justify-center">
              <Building2 className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200/80 shadow-xs bg-white rounded-2xl">
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Completed Practicum</p>
              <p className="text-2xl font-bold text-emerald-600 mt-1">{deptMetrics.completed}</p>
              <p className="text-[11px] text-slate-400 mt-0.5">Completed required practicum hours</p>
            </div>
            <div className="w-11 h-11 rounded-xl bg-slate-50 border border-slate-200/90 text-emerald-700 flex items-center justify-center">
              <GraduationCap className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200/80 shadow-xs bg-white rounded-2xl">
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Total Rendered Hours</p>
              <p className="text-2xl font-bold text-slate-900 mt-1">{deptMetrics.hours.toFixed(1)}</p>
              <p className="text-[11px] text-slate-400 mt-0.5">Verified Industry Hours</p>
            </div>
            <div className="w-11 h-11 rounded-xl bg-slate-50 border border-slate-200/90 text-[#0A3824] flex items-center justify-center">
              <Timer className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Course Breakdown Cards (Specific to Active Department Only) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 print:grid-cols-2">
        {isICSView ? (
          <>
            {/* BSIT Breakdown */}
            <Card className="border-slate-200/80 shadow-xs bg-white rounded-2xl">
              <CardHeader className="p-5 pb-3">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-slate-50 border border-slate-200/90 text-[#0A3824] flex items-center justify-center shrink-0">
                      <Laptop className="w-5 h-5" />
                    </div>
                    <div>
                      <CardTitle className="text-base font-bold text-slate-900">
                        BS Information Technology (BSIT)
                      </CardTitle>
                      <p className="text-xs text-slate-400 mt-0.5">Software & Systems Practicum</p>
                    </div>
                  </div>
                  <Badge className="bg-slate-100 text-slate-700 border-slate-200 text-xs font-bold">
                    {summary.ics.bsit.total} Students
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="p-5 pt-0 space-y-2.5">
                <div className="flex justify-between text-xs text-slate-600 pt-2 border-t border-slate-100">
                  <span>Graduation Target Completed:</span>
                  <span className="font-bold text-emerald-700">{summary.ics.bsit.completed} students</span>
                </div>
                <div className="flex justify-between text-xs text-slate-600">
                  <span>Active in Field:</span>
                  <span className="font-semibold text-slate-900">{summary.ics.bsit.active} students</span>
                </div>
                <div className="flex justify-between text-xs text-slate-600">
                  <span>Aggregate Verified Hours:</span>
                  <span className="font-mono font-bold text-slate-900">{summary.ics.bsit.hours.toFixed(1)} hrs</span>
                </div>
              </CardContent>
            </Card>

            {/* BS-CPE Breakdown */}
            <Card className="border-slate-200/80 shadow-xs bg-white rounded-2xl">
              <CardHeader className="p-5 pb-3">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-slate-50 border border-slate-200/90 text-[#0A3824] flex items-center justify-center shrink-0">
                      <Cpu className="w-5 h-5" />
                    </div>
                    <div>
                      <CardTitle className="text-base font-bold text-slate-900">
                        BS Computer Engineering (BS-CPE)
                      </CardTitle>
                      <p className="text-xs text-slate-400 mt-0.5">Hardware & Embedded Systems Practicum</p>
                    </div>
                  </div>
                  <Badge className="bg-slate-100 text-slate-700 border-slate-200 text-xs font-bold">
                    {summary.ics.bscpe.total} Students
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="p-5 pt-0 space-y-2.5">
                <div className="flex justify-between text-xs text-slate-600 pt-2 border-t border-slate-100">
                  <span>Graduation Target Completed:</span>
                  <span className="font-bold text-emerald-700">{summary.ics.bscpe.completed} students</span>
                </div>
                <div className="flex justify-between text-xs text-slate-600">
                  <span>Active in Field:</span>
                  <span className="font-semibold text-slate-900">{summary.ics.bscpe.active} students</span>
                </div>
                <div className="flex justify-between text-xs text-slate-600">
                  <span>Aggregate Verified Hours:</span>
                  <span className="font-mono font-bold text-slate-900">{summary.ics.bscpe.hours.toFixed(1)} hrs</span>
                </div>
              </CardContent>
            </Card>
          </>
        ) : (
          <>
            {/* BSBA-HRM Breakdown */}
            <Card className="border-slate-200/80 shadow-xs bg-white rounded-2xl">
              <CardHeader className="p-5 pb-3">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-slate-50 border border-slate-200/90 text-[#0A3824] flex items-center justify-center shrink-0">
                      <Briefcase className="w-5 h-5" />
                    </div>
                    <div>
                      <CardTitle className="text-base font-bold text-slate-900">
                        BSBA Human Resource Management (BSBA-HRM)
                      </CardTitle>
                      <p className="text-xs text-slate-400 mt-0.5">Human Resource & Corporate Practicum</p>
                    </div>
                  </div>
                  <Badge className="bg-slate-100 text-slate-700 border-slate-200 text-xs font-bold">
                    {summary.ibe.bsbaHrm.total} Students
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="p-5 pt-0 space-y-2.5">
                <div className="flex justify-between text-xs text-slate-600 pt-2 border-t border-slate-100">
                  <span>Graduation Target Completed:</span>
                  <span className="font-bold text-emerald-700">{summary.ibe.bsbaHrm.completed} students</span>
                </div>
                <div className="flex justify-between text-xs text-slate-600">
                  <span>Active in Field:</span>
                  <span className="font-semibold text-slate-900">{summary.ibe.bsbaHrm.active} students</span>
                </div>
                <div className="flex justify-between text-xs text-slate-600">
                  <span>Aggregate Verified Hours:</span>
                  <span className="font-mono font-bold text-slate-900">{summary.ibe.bsbaHrm.hours.toFixed(1)} hrs</span>
                </div>
              </CardContent>
            </Card>

            {/* BSEntrep Breakdown */}
            <Card className="border-slate-200/80 shadow-xs bg-white rounded-2xl">
              <CardHeader className="p-5 pb-3">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-slate-50 border border-slate-200/90 text-[#0A3824] flex items-center justify-center shrink-0">
                      <TrendingUp className="w-5 h-5" />
                    </div>
                    <div>
                      <CardTitle className="text-base font-bold text-slate-900">
                        BS Entrepreneurship (BSEntrep)
                      </CardTitle>
                      <p className="text-xs text-slate-400 mt-0.5">Enterprise & Commercial Practicum</p>
                    </div>
                  </div>
                  <Badge className="bg-slate-100 text-slate-700 border-slate-200 text-xs font-bold">
                    {summary.ibe.bsEntrep.total} Students
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="p-5 pt-0 space-y-2.5">
                <div className="flex justify-between text-xs text-slate-600 pt-2 border-t border-slate-100">
                  <span>Graduation Target Completed:</span>
                  <span className="font-bold text-emerald-700">{summary.ibe.bsEntrep.completed} students</span>
                </div>
                <div className="flex justify-between text-xs text-slate-600">
                  <span>Active in Field:</span>
                  <span className="font-semibold text-slate-900">{summary.ibe.bsEntrep.active} students</span>
                </div>
                <div className="flex justify-between text-xs text-slate-600">
                  <span>Aggregate Verified Hours:</span>
                  <span className="font-mono font-bold text-slate-900">{summary.ibe.bsEntrep.hours.toFixed(1)} hrs</span>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* Trainee Roster and Filters */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 print:hidden">
          {/* Program Quick Filter Tabs */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {isICSView ? (
              <>
                <button
                  onClick={() => setCourseFilter('ALL')}
                  className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all ${
                    courseFilter === 'ALL'
                      ? 'bg-[#0A3824] text-[var(--cdm-sand)] shadow-sm'
                      : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  All ICS Trainees ({summary.ics.total})
                </button>
                <button
                  onClick={() => setCourseFilter('BSIT')}
                  className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all ${
                    courseFilter === 'BSIT'
                      ? 'bg-[#0A3824] text-[var(--cdm-sand)] shadow-sm'
                      : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  BSIT ({summary.ics.bsit.total})
                </button>
                <button
                  onClick={() => setCourseFilter('BS-CPE')}
                  className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all ${
                    courseFilter === 'BS-CPE'
                      ? 'bg-[#0A3824] text-[var(--cdm-sand)] shadow-sm'
                      : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  BS-CPE ({summary.ics.bscpe.total})
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => setCourseFilter('ALL')}
                  className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all ${
                    courseFilter === 'ALL'
                      ? 'bg-[#0A3824] text-[var(--cdm-sand)] shadow-sm'
                      : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  All IBE Trainees ({summary.ibe.total})
                </button>
                <button
                  onClick={() => setCourseFilter('BSBA-HRM')}
                  className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all ${
                    courseFilter === 'BSBA-HRM'
                      ? 'bg-[#0A3824] text-[var(--cdm-sand)] shadow-sm'
                      : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  BSBA-HRM ({summary.ibe.bsbaHrm.total})
                </button>
                <button
                  onClick={() => setCourseFilter('BSENTREP')}
                  className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all ${
                    courseFilter === 'BSENTREP'
                      ? 'bg-[#0A3824] text-[var(--cdm-sand)] shadow-sm'
                      : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  BSEntrep ({summary.ibe.bsEntrep.total})
                </button>
              </>
            )}
          </div>

          {/* Search and Status Filters */}
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search trainee or company..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                aria-label="Search trainees or companies"
                className="pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-[#0A3824] w-48 sm:w-64"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
              aria-label="Filter by progress status"
              className="py-1.5 px-3 text-xs bg-white border border-slate-200 rounded-xl text-slate-700 focus:outline-none focus:ring-1 focus:ring-[#0A3824]"
            >
              <option value="ALL">All Statuses</option>
              <option value="completed">Completed</option>
              <option value="in_progress">In Progress</option>
              <option value="not_started">Not Started</option>
            </select>
          </div>
        </div>

        {/* Detailed Table */}
        <Card className="border-slate-200/80 shadow-xs overflow-hidden bg-white rounded-2xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50/80 border-b border-slate-100 text-xs font-semibold text-slate-600 uppercase tracking-wider">
                <tr>
                  <th className="px-5 py-3.5">Student Details</th>
                  <th className="px-5 py-3.5">Course</th>
                  <th className="px-5 py-3.5">Assigned Establishment</th>
                  <th className="px-5 py-3.5">Rendered Hours</th>
                  <th className="px-5 py-3.5">Clearance Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredStudents.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-12 text-center text-slate-400 text-xs">
                      No {activeDept} student trainees match the current filters.
                    </td>
                  </tr>
                ) : (
                  (printing ? filteredStudents : visibleStudents).map((s) => (
                    <tr key={s.student_id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-5 py-4">
                        <p className="font-bold text-slate-900">{s.full_name}</p>
                        <p className="text-xs text-slate-400 font-mono mt-0.5">{s.student_number}</p>
                      </td>
                      <td className="px-5 py-4">
                        <Badge variant="outline" className="text-xs font-bold text-[#0A3824] bg-emerald-50/50 border-emerald-200">
                          {s.course}
                        </Badge>
                      </td>
                      <td className="px-5 py-4 text-xs font-medium text-slate-700">
                        {s.company_name || <span className="text-slate-400 italic">Unassigned</span>}
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-baseline gap-1.5">
                          <span className="font-mono font-bold text-slate-900 text-sm">{s.completed_hours.toFixed(1)}</span>
                          <span className="text-[11px] text-slate-400">/ {s.required_hours} hrs</span>
                        </div>
                        <div className="w-24 h-1.5 rounded-full bg-slate-100 overflow-hidden mt-1.5">
                          <div
                            className={`h-full rounded-full transition-all ${
                              s.percentage >= 100 ? 'bg-emerald-500' : 'bg-[#0A3824]'
                            }`}
                            style={{ width: `${s.percentage}%` }}
                          />
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                            s.progress_status === 'completed'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : s.progress_status === 'in_progress'
                              ? 'bg-amber-50 text-amber-700 border border-amber-200'
                              : 'bg-slate-100 text-slate-600 border border-slate-200'
                          }`}
                        >
                          {s.progress_status === 'completed'
                            ? '🎓 COMPLETED'
                            : s.progress_status === 'in_progress'
                            ? '⏳ IN PROGRESS'
                            : 'NOT STARTED'}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
        <div className="flex items-center justify-between gap-3 text-sm print:hidden">
          <span>{filteredStudents.length} matching trainees · Page {currentPage} of {pageCount}. Export and print include all matches.</span>
          <div className="flex gap-3">
            <button type="button" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)} className="disabled:opacity-40">Previous</button>
            <button type="button" disabled={currentPage === pageCount} onClick={() => setPage(currentPage + 1)} className="disabled:opacity-40">Next</button>
          </div>
        </div>
      </div>
    </div>
  );
}
