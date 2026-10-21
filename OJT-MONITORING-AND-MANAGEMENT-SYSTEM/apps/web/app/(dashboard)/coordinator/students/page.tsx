'use client';

import { useEffect, useState } from 'react';
import Alert from '@/src/components/ui/Alert';
import Button from '@/src/components/ui/Button';
import { Badge } from '@/src/components/ui/Badge';
import { Skeleton } from '@/src/components/ui/Skeleton';
import { Search, Users } from '@/src/components/ui/Icons';
import { listActiveStudents } from '@/src/services/auth';

type ActiveStudent = {
  user_id: string;
  full_name: string;
  email: string;
  student_number: string;
  course: string;
  year_level: number;
  account_status: string;
  created_at: string;
};

const PAGE_SIZE = 20;

export default function CoordinatorStudentsPage() {
  const [students, setStudents] = useState<ActiveStudent[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFilter, setSearchFilter] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setSearchFilter(searchQuery.trim()), 250);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    listActiveStudents(page, PAGE_SIZE, searchFilter).then((result) => {
      if (!active) return;
      if (result.error) {
        setError(result.error.message);
        setStudents([]);
        setTotal(0);
      } else {
        setStudents(result.data?.students ?? []);
        setTotal(result.data?.total ?? 0);
      }
      setLoading(false);
    }).catch(() => {
      if (!active) return;
      setError('Failed to load active students.');
      setStudents([]);
      setTotal(0);
      setLoading(false);
    });
    return () => { active = false; };
  }, [page, searchFilter]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto page-fade-in">
      {/* Header Section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
              Trainee Directory
            </h1>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60">
              {total} Total
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            Active 4th-year ICS & IBE trainees and their registration status.
          </p>
        </div>

        {/* Search Input */}
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-500" />
          <input
            type="text"
            placeholder="Search name, email, ID, or course..."
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); if (page !== 1) setPage(1); }}
            className="w-full pl-9 pr-4 py-2 rounded-xl text-xs bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-[#0A3824]/20 dark:focus:ring-emerald-500/20 focus:border-[#0A3824] dark:focus:border-emerald-600 transition-all shadow-2xs"
          />
        </div>
      </div>

      {error && (
        <div>
          <Alert type="error" message={error} />
        </div>
      )}

      {/* Trainees Data Table */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs overflow-hidden">
        {loading ? (
          <div className="p-6 space-y-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <Skeleton className="w-10 h-10 rounded-full shrink-0" />
                  <div className="space-y-1.5">
                    <Skeleton className="h-3.5 w-36 rounded" />
                    <Skeleton className="h-2.5 w-24 rounded" />
                  </div>
                </div>
                <Skeleton className="h-3 w-40 rounded hidden sm:block" />
                <Skeleton className="h-3 w-28 rounded hidden md:block" />
                <Skeleton className="h-5 w-16 rounded-full" />
              </div>
            ))}
          </div>
        ) : students.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center px-4">
            <div className="w-12 h-12 rounded-2xl bg-slate-50 dark:bg-slate-800 text-slate-400 dark:text-slate-500 flex items-center justify-center mb-3">
              <Users className="w-6 h-6" />
            </div>
            <p className="text-sm font-bold text-slate-700 dark:text-slate-300">
              {searchQuery ? 'No matching trainees found' : 'No active students found'}
            </p>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1 max-w-sm">
              {searchQuery
                ? `No student records match "${searchQuery}". Try searching with a different keyword.`
                : 'Approved practicum students will appear in this directory once activated.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs sm:text-sm">
              <thead className="border-b border-slate-100 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/60 text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                <tr>
                  <th className="px-5 py-3.5">Student</th>
                  <th className="px-5 py-3.5">Email</th>
                  <th className="px-5 py-3.5">Program</th>
                  <th className="px-5 py-3.5">Year</th>
                  <th className="px-5 py-3.5">Status</th>
                  <th className="px-5 py-3.5">Joined</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {students.map((student) => (
                  <tr
                    key={student.user_id}
                    className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors"
                  >
                    <td className="px-5 py-4">
                      <p className="font-semibold text-slate-900 dark:text-white leading-tight">
                        {student.full_name}
                      </p>
                      <p className="text-xs text-slate-400 dark:text-slate-500 font-mono mt-0.5">
                        {student.student_number}
                      </p>
                    </td>
                    <td className="px-5 py-4 text-slate-600 dark:text-slate-300 font-mono text-xs">
                      {student.email}
                    </td>
                    <td className="px-5 py-4">
                      <span className="inline-block font-medium text-slate-700 dark:text-slate-300 text-xs">
                        {student.course}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-slate-600 dark:text-slate-400 font-medium">
                      4th Year
                    </td>
                    <td className="px-5 py-4">
                      <Badge status={student.account_status} />
                    </td>
                    <td className="px-5 py-4 text-slate-500 dark:text-slate-400 text-xs">
                      {new Date(student.created_at).toLocaleDateString('en-PH', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination Bar */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 pt-2">
          <span>
            Showing Page <strong className="text-slate-900 dark:text-white">{page}</strong> of{' '}
            <strong className="text-slate-900 dark:text-white">{totalPages}</strong>
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
