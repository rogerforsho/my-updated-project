'use client';

import { useEffect, useState } from 'react';
import Alert from '@/src/components/ui/Alert';
import Button from '@/src/components/ui/Button';
import { Badge } from '@/src/components/ui/Badge';
import { Skeleton } from '@/src/components/ui/Skeleton';
import { Search, Users } from '@/src/components/ui/Icons';
import { PagerBar, usePageSize } from '@/src/components/ui/ListControls';
import { RowMenu } from '@/src/components/ui/RowMenu';
import Modal from '@/src/components/ui/Modal';
import { CollapsibleGroup, useGroupFold } from '@/src/components/ui/CollapsibleGroup';
import { listActiveStudents, listStudentGroups, resetStudentPasswordToDefault } from '@/src/services/auth';
import Link from 'next/link';

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

function GroupRows({ course, search, onReset }: { course: string; search: string; onReset: (s: ActiveStudent) => void }) {
  const [students, setStudents] = useState<ActiveStudent[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, changePageSize] = usePageSize();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => { setPage(1); }, [search]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    listActiveStudents(page, pageSize, search, course).then((result) => {
      if (!active) return;
      if (result.error) setError(result.error.message);
      else { setStudents(result.data?.students ?? []); setTotal(result.data?.total ?? 0); }
      setLoading(false);
    }).catch(() => {
      if (!active) return;
      setError('Failed to load students.');
      setLoading(false);
    });
    return () => { active = false; };
  }, [page, pageSize, search, course]);

  if (loading) return <div className="p-5 space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full rounded" />)}</div>;
  if (error) return <div className="p-4"><Alert type="error" message={error} /></div>;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs sm:text-sm">
          <thead className="border-b border-slate-100 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/60 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
            <tr>
              <th className="px-5 py-3.5">Student</th>
              <th className="px-5 py-3.5">Email</th>
              <th className="px-5 py-3.5">Program</th>
              <th className="px-5 py-3.5">Year</th>
              <th className="px-5 py-3.5">Status</th>
              <th className="px-5 py-3.5">Joined</th>
              <th className="px-5 py-3.5"><span className="sr-only">Actions</span></th>
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
                  <p className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums mt-0.5">
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
                <td className="px-5 py-4 text-right">
                  <RowMenu items={[{ label: 'Reset password', onSelect: () => { onReset(student); } }]} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="p-3"><PagerBar page={page} totalPages={totalPages} total={total} setPage={setPage} pageSize={pageSize} setPageSize={(n) => { changePageSize(n); setPage(1); }} /></div>
    </>
  );
}

export default function CoordinatorStudentsPage() {
  const [groups, setGroups] = useState<Array<{ course: string; count: number }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFilter, setSearchFilter] = useState('');
  const [resetTarget, setResetTarget] = useState<ActiveStudent | null>(null);
  const [resetting, setResetting] = useState(false);
  const [notice, setNotice] = useState('');
  const fold = useGroupFold('coordinator-students-fold');

  useEffect(() => {
    const timer = setTimeout(() => setSearchFilter(searchQuery.trim()), 250);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    listStudentGroups(searchFilter).then((result) => {
      if (!active) return;
      if (result.error) { setError(result.error.message); setGroups([]); }
      else setGroups(result.data?.groups ?? []);
      setLoading(false);
    }).catch(() => {
      if (!active) return;
      setError('Failed to load active students.');
      setGroups([]);
      setLoading(false);
    });
    return () => { active = false; };
  }, [searchFilter]);

  async function confirmReset() {
    if (!resetTarget) return;
    setResetting(true);
    setError('');
    setNotice('');
    try {
      const result = await resetStudentPasswordToDefault(resetTarget.user_id);
      if (result.error) setError(result.error.message);
      else setNotice(`${resetTarget.full_name}: ${result.data?.hint ?? 'Password reset.'}`);
    } catch {
      setError('Failed to reset the password.');
    }
    setResetting(false);
    setResetTarget(null);
  }

  const total = groups.reduce((n, g) => n + g.count, 0);
  const courses = groups.map((g) => g.course);

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto page-fade-in">
      {/* Header Section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
              Trainee Directory
            </h1>
            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60">
              {total} Total
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            Active 4th-year ICS & IBE trainees and their registration status.
          </p>
        </div>

        {/* Search Input */}
        <div className="flex w-full items-center gap-2 sm:w-auto">
          <Link href="/coordinator/import" className="rounded-xl bg-[var(--cdm-green)] px-3 py-2 text-xs font-bold text-white">Import CSV</Link>
          <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-500" />
          <input
            type="text"
            placeholder="Search name, email, ID, or course..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 rounded-xl text-xs bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-[#0A3824]/20 dark:focus:ring-emerald-500/20 focus:border-[#0A3824] dark:focus:border-emerald-600 transition-all shadow-2xs"
          />
          </div>
        </div>
      </div>

      {error && (
        <div>
          <Alert type="error" message={error} />
        </div>
      )}

      {notice && (
        <div>
          <Alert type="success" message={notice} />
        </div>
      )}

      <Modal
        title="Reset password"
        open={!!resetTarget}
        onClose={() => { if (!resetting) setResetTarget(null); }}
        footer={
          <>
            <Button variant="outline" onClick={() => setResetTarget(null)} disabled={resetting}>Cancel</Button>
            <Button variant="destructive" onClick={confirmReset} loading={resetting}>Reset password</Button>
          </>
        }
      >
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Reset the password of <strong>{resetTarget?.full_name}</strong> to their student number
          (prefixed with &quot;cdm-&quot; if it is shorter than 8 characters)? They must choose a new
          password the next time they sign in.
        </p>
      </Modal>

      {groups.length > 1 && (
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => fold.setAll(courses, true)}>Expand all</Button>
          <Button variant="outline" onClick={() => fold.setAll(courses, false)}>Collapse all</Button>
        </div>
      )}

      {loading ? (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-6 space-y-4">
          {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-10 w-full rounded" />)}
        </div>
      ) : groups.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 flex flex-col items-center justify-center py-20 text-center px-4">
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
        groups.map((g) => (
          <CollapsibleGroup
            key={g.course}
            title={g.course}
            summary={`${g.count} ${g.count === 1 ? 'student' : 'students'}`}
            // A search opens every group that matched, without changing what the user folded.
            open={!!searchFilter || fold.isOpen(g.course)}
            onToggle={() => fold.toggle(g.course)}
          >
            <GroupRows course={g.course} search={searchFilter} onReset={(student) => { setNotice(''); setResetTarget(student); }} />
          </CollapsibleGroup>
        ))
      )}
    </div>
  );
}
