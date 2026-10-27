'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { Card, CardContent } from '@/src/components/ui/Card';
import { Badge } from '@/src/components/ui/Badge';
import { Button } from '@/src/components/ui/Button';
import { Input } from '@/src/components/ui/Input';
import Modal from '@/src/components/ui/Modal';
import {
  Users,
  Shield,
  Megaphone,
  Bell,
  Check,
  X,
  AlertCircle,
  Search,
  Filter,
  Trash2,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  RotateCcw,
  AlertTriangle,
} from '@/src/components/ui/Icons';
import {
  updateUserAccountStatus,
  createSystemUser,
  deactivateSystemUser,
  listAllUsers,
  type UserManagementItem,
  type CreateSystemUserInput,
} from '@/src/services/admin';
import { createAnnouncement, listAnnouncements, deleteAnnouncement } from '@/src/services/announcements';
import type { DbAnnouncement } from '@ojt/shared';
import { listAuditLogs, type AuditLogItem } from '@/src/services/audit';
import { accountRoleLabel, type AccountStatus } from '@ojt/shared';

interface Props {
  initialUsers: UserManagementItem[];
  totalUsers: number;
  overview: {
    totalUsers: number;
    activeUsers: number;
    pendingUsers: number;
    roleBreakdown: Record<string, number>;
  };
}

const PAGE_SIZE = 10;

const ROLE_TABS = [
  { id: 'all', label: 'All Roles' },
  { id: 'OJT Student', label: 'OJT Students' },
  { id: 'Supervisor', label: 'Supervisors' },
  { id: 'OJT Coordinator', label: 'OJT Coordinators' },
  { id: 'Super Admin', label: 'Super Admins' },
] as const;

// ACCOUNT_STATUS_ACTIVE -> "Account status active"
function formatAuditAction(action: string) {
  const text = action.replace(/_/g, ' ').toLowerCase();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function formatAuditDetails(details?: Record<string, unknown>) {
  const entries = Object.entries(details ?? {});
  if (entries.length === 0) return '—';
  return entries
    .map(([key, value]) => `${key.replace(/_/g, ' ')}: ${typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value)}`)
    .join(' · ');
}

type AdminTab ='users' | 'announcements' | 'audit';

const ADMIN_TABS: { id: AdminTab; label: string; Icon: typeof Users }[] = [
  { id: 'users', label: 'Users', Icon: Users },
  { id: 'announcements', label: 'Announcements', Icon: Megaphone },
  { id: 'audit', label: 'Audit Log', Icon: Shield },
];

export default function AdminClient({ initialUsers, totalUsers: initialTotal, overview }: Props) {
  const [users, setUsers] = useState<UserManagementItem[]>(initialUsers);
  const [totalCount, setTotalCount] = useState(initialTotal);
  const [page, setPage] = useState(1);
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const usersRequestRef = useRef(0);
  const [tableLoading, setTableLoading] = useState(false);
  const [tableError, setTableError] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const hasLoadedInitialRef = useRef(false);

  // Delete User Modal State
  const [deleteTarget, setDeleteTarget] = useState<UserManagementItem | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  // Coordinator invitation state
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [staffForm, setStaffForm] = useState<CreateSystemUserInput>({
    full_name: '',
    email: '',
    role: 'OJT Coordinator',
    department_scopes: ['ICS'],
  });
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState('');

  // Announcement State
  const [anncTitle, setAnncTitle] = useState('');
  const [anncContent, setAnncContent] = useState('');
  const [anncDept, setAnncDept] = useState('All');
  const [anncDeliveryType, setAnncDeliveryType] = useState<'announcement' | 'alert'>('announcement');
  const [anncLoading, setAnncLoading] = useState(false);
  const [announcements, setAnnouncements] = useState<DbAnnouncement[]>([]);
  const [anncListLoading, setAnncListLoading] = useState(true);
  const [anncListError, setAnncListError] = useState('');
  const [deleteAnncModalOpen, setDeleteAnncModalOpen] = useState(false);
  const [anncToDelete, setAnncToDelete] = useState<DbAnnouncement | null>(null);
  const [deleteAnncLoading, setDeleteAnncLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<AdminTab>('users');

  // Audit Logs State
  const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>([]);
  const [auditLoading, setAuditLoading] = useState(true);
  const [auditError, setAuditError] = useState('');


  const fetchUsers = useCallback(async (
    targetPage: number,
    targetRole: string,
    targetStatus: string,
    targetSearch: string
  ) => {
    const requestId = ++usersRequestRef.current;
    setTableLoading(true);
    setTableError(null);
    try {
      const res = await listAllUsers(targetPage, PAGE_SIZE, targetRole, targetStatus, targetSearch);
      if (requestId !== usersRequestRef.current) return;
      if (res.data) {
        setUsers(res.data.users);
        setTotalCount(res.data.total);
      } else if (res.error) {
        setTableError(res.error.message || 'Failed to retrieve user records.');
      }
    } catch (err: unknown) {
      if (requestId === usersRequestRef.current)
        setTableError(err instanceof Error ? err.message : 'Network error while loading user records.');
    } finally {
      if (requestId === usersRequestRef.current) setTableLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Fetch users when filters change, keeping initialUsers on first render if already present
  useEffect(() => {
    if (!hasLoadedInitialRef.current) {
      hasLoadedInitialRef.current = true;
      if (initialUsers && initialUsers.length > 0 && roleFilter === 'all' && statusFilter === 'all' && !searchQuery && page === 1) {
        setUsers(initialUsers);
        setTotalCount(initialTotal);
        return;
      }
    }
    if (searchQuery !== debouncedSearch) return;
    fetchUsers(page, roleFilter, statusFilter, debouncedSearch);
  }, [page, roleFilter, statusFilter, searchQuery, debouncedSearch, fetchUsers, initialUsers, initialTotal]);

  const loadAnnouncements = useCallback(async () => {
    setAnncListLoading(true);
    setAnncListError('');
    try {
      const res = await listAnnouncements();
      if (res.error) setAnncListError(res.error.message);
      else setAnnouncements(res.data ?? []);
    } catch {
      setAnncListError('Unable to load broadcasts. Please retry.');
    } finally { setAnncListLoading(false); }
  }, []);

  useEffect(() => {
    loadAudit();
    loadAnnouncements();
  }, [loadAnnouncements]);

  async function loadAudit() {
    setAuditLoading(true);
    setAuditError('');
    try {
      const res = await listAuditLogs(1, 10);
      if (res.error) setAuditError(res.error.message);
      else setAuditLogs(res.data?.logs ?? []);
    } catch {
      setAuditError('Unable to load audit records. Please refresh the log.');
    } finally { setAuditLoading(false); }
  }

  const handleDeleteAnnouncementClick = (annc: DbAnnouncement) => {
    setAnncToDelete(annc);
    setDeleteAnncModalOpen(true);
  };

  const confirmDeleteAnnouncement = async () => {
    if (!anncToDelete) return;
    setDeleteAnncLoading(true);
    const res = await deleteAnnouncement(anncToDelete.announcement_id);
    setDeleteAnncLoading(false);
    setDeleteAnncModalOpen(false);

    if (res.error) {
      setMsg({ type: 'error', text: res.error.message });
    } else {
      setMsg({ type: 'success', text: `Announcement "${anncToDelete.title}" has been permanently removed.` });
      setAnncToDelete(null);
      loadAnnouncements();
      loadAudit();
    }
  };

  const handleSearchChange = (val: string) => {
    usersRequestRef.current++;
    setSearchQuery(val);
    setPage(1);
  };

  const handleRoleChange = (role: string) => {
    setRoleFilter(role);
    setPage(1);
  };

  const handleStatusFilterChange = (status: string) => {
    setStatusFilter(status);
    setPage(1);
  };

  const handleStatusChange = async (userId: string, newStatus: AccountStatus) => {
    setLoadingId(userId);
    setMsg(null);
    const result = await updateUserAccountStatus(userId, newStatus);
    setLoadingId(null);

    if (result.error) {
      setMsg({ type: 'error', text: result.error.message });
    } else {
      setUsers((prev) =>
        prev.map((u) => (u.user_id === userId ? { ...u, account_status: newStatus } : u))
      );
      setMsg({ type: 'success', text: `User account status updated to ${newStatus}.` });
      loadAudit();
    }
  };

  const handleDeleteUser = async () => {
    if (!deleteTarget) return;

    setDeleteLoading(true);
    setDeleteError('');
    const res = await deactivateSystemUser(deleteTarget.user_id);
    setDeleteLoading(false);

    if (res.error) {
      setDeleteError(res.error.message);
      return;
    }

    setMsg({
      type: 'success',
      text: `Deactivated account for ${deleteTarget.full_name}. OJT history is retained.`,
    });
    setDeleteTarget(null);
    fetchUsers(page, roleFilter, statusFilter, searchQuery);
    loadAudit();
  };

  const handleCreateStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateLoading(true);
    setCreateError('');

    const res = await createSystemUser(staffForm);
    setCreateLoading(false);

    if (res.error) {
      setCreateError(res.error.message);
      return;
    }

    setMsg({
      type: 'success',
      text: `Setup invitation sent to ${staffForm.email}.`,
    });
    setCreateModalOpen(false);
    setStaffForm({
      full_name: '',
      email: '',
      role: 'OJT Coordinator',
      department_scopes: ['ICS'],
    });
    fetchUsers(page, roleFilter, statusFilter, searchQuery);
    loadAudit();
  };

  const handlePublishAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!anncTitle.trim() || !anncContent.trim()) return;

    setAnncLoading(true);
    setMsg(null);
    const result = await createAnnouncement({
      title: anncTitle,
      content: anncContent,
      target_department: anncDept,
      target_role: 'All',
      delivery_type: anncDeliveryType,
    });
    setAnncLoading(false);

    if (result.error) {
      setMsg({ type: 'error', text: result.error.message });
    } else {
      setAnncTitle('');
      setAnncContent('');
      setMsg({
        type: 'success',
        text: anncDeliveryType === 'alert'
          ? 'Urgent alert published and dispatched with 🚨 icon to all user inboxes!'
          : 'Announcement published and dispatched with 📢 icon to all user inboxes!',
      });
      loadAnnouncements();
      loadAudit();
    }
  };

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const startIndex = (page - 1) * PAGE_SIZE + 1;
  const endIndex = Math.min(totalCount, page * PAGE_SIZE);

  return (
    <div className="space-y-4 max-w-6xl mx-auto p-4 sm:p-6 lg:p-8 page-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200/80 dark:border-slate-800">
        <div>
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1.5 text-xs font-bold text-[#0A3824] dark:text-emerald-400 hover:text-[#092E1D] hover:underline mb-1 transition-colors cursor-pointer"
          >
            Back to Dashboard
          </Link>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">System Administration</h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Manage user accounts, provision academic staff, and broadcast campus announcements.
          </p>
        </div>
        <div>
          <Button
            onClick={() => { setCreateError(''); setCreateModalOpen(true); }}
            className="bg-[#0A3824] hover:bg-[#092E1D] text-[var(--cdm-sand)] font-bold shadow-xs hover:shadow-md transition-all duration-150 cursor-pointer active:scale-95"
          >
            + Invite OJT Coordinator
          </Button>
        </div>
      </div>

      {msg && (
        <div
          className={`p-3.5 rounded-xl text-sm font-medium flex items-center justify-between gap-2 transition-all ${
            msg.type === 'success' ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800' : 'bg-red-50 dark:bg-red-950/30 text-red-800 dark:text-red-300 border border-red-200 dark:border-red-800'
          }`}
        >
          <div className="flex items-center gap-2">
            {msg.type === 'success' ? <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400 flex-shrink-0" /> : <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 flex-shrink-0" />}
            <span>{msg.text}</span>
          </div>
          <button onClick={() => setMsg(null)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* System Metrics Cards - Standardized Heights & Micro-interactions */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        <Card className="group h-full min-h-[104px] border-slate-200/80 dark:border-slate-800 shadow-xs hover:shadow-md hover:border-slate-300 dark:hover:border-slate-700 transition-all duration-200 hover:-translate-y-0.5 cursor-default bg-white dark:bg-slate-900">
          <CardContent className="p-4 sm:p-5 flex items-center gap-3.5 h-full">
            <div className="w-11 h-11 rounded-xl bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-300 flex items-center justify-center flex-shrink-0 transition-transform duration-200 group-hover:scale-105">
              <Users className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0 flex flex-col justify-center">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Total Users</p>
              <h3 className="text-2xl font-bold text-slate-900 dark:text-white mt-0.5 leading-tight">{overview.totalUsers}</h3>
              <p className="text-xs text-slate-400 mt-0.5 truncate">{overview.activeUsers} active accounts</p>
            </div>
          </CardContent>
        </Card>

        <Card className="group h-full min-h-[104px] border-slate-200/80 dark:border-slate-800 shadow-xs hover:shadow-md hover:border-slate-300 dark:hover:border-slate-700 transition-all duration-200 hover:-translate-y-0.5 cursor-default bg-white dark:bg-slate-900">
          <CardContent className="p-4 sm:p-5 flex items-center gap-3.5 h-full">
            <div className="w-11 h-11 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 flex items-center justify-center flex-shrink-0 transition-transform duration-200 group-hover:scale-105">
              <Shield className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0 flex flex-col justify-center">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Pending Approvals</p>
              <h3 className="text-2xl font-bold text-amber-600 dark:text-amber-400 mt-0.5 leading-tight">{overview.pendingUsers}</h3>
              <p className="text-xs text-slate-400 mt-0.5 truncate">Awaiting verification</p>
            </div>
          </CardContent>
        </Card>

        {([['OJT Coordinator', 'OJT Coordinators'], ['Supervisor', 'Supervisors']] as const).map(([role, label]) => (
          <Card key={role} className="group h-full min-h-[104px] border-slate-200/80 dark:border-slate-800 shadow-xs hover:shadow-md hover:border-slate-300 dark:hover:border-slate-700 transition-all duration-200 hover:-translate-y-0.5 cursor-default bg-white dark:bg-slate-900">
            <CardContent className="p-4 sm:p-5 flex items-center gap-3.5 h-full">
              <div className="w-11 h-11 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 flex items-center justify-center flex-shrink-0 transition-transform duration-200 group-hover:scale-105">
                <Users className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0 flex flex-col justify-center">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{label}</p>
                <h3 className="text-2xl font-bold text-slate-900 dark:text-white mt-0.5 leading-tight">{overview.roleBreakdown[role] ?? 0}</h3>
                <p className="text-xs text-slate-400 mt-0.5 truncate">Registered accounts</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Section tabs: one section is shown at a time */}
      <div role="tablist" aria-label="Administration sections" className="flex flex-wrap items-center gap-1.5 p-1.5 bg-slate-100 dark:bg-slate-800/80 rounded-2xl border border-slate-200 dark:border-slate-700/60 shadow-xs w-fit max-w-full">
        {ADMIN_TABS.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={activeTab === id}
            onClick={() => setActiveTab(id)}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer ${
              activeTab === id
                ? 'bg-white dark:bg-slate-900 text-[#0A3824] dark:text-emerald-400 shadow-xs'
                : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Icon className="w-4 h-4" /> {label}
          </button>
        ))}
      </div>

      <>
        {activeTab === 'users' && (
          <section className="space-y-4 rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 sm:p-6 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3.5 border-b border-slate-100 dark:border-slate-800">
              <div>
                <div className="flex items-center gap-2">
                  <Users className="w-5 h-5 text-emerald-800 dark:text-emerald-400 shrink-0" />
                  <h2 className="text-lg font-bold text-slate-900 dark:text-white tracking-tight">User Management &amp; Status Control</h2>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Search accounts, review status, and deactivate access while retaining records.
                </p>
              </div>
              <span className="text-xs font-medium px-3.5 py-1 rounded-full bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 self-start sm:self-auto shadow-2xs">
                Total {totalCount} account{totalCount !== 1 ? 's' : ''}
              </span>
            </div>

            {/* Header Layout: Search Bar, Dropdown Selector & Horizontally Spacious Tab Bar */}
            <div className="rounded-xl border border-slate-200/80 dark:border-slate-800 p-3.5 sm:p-4 bg-white dark:bg-slate-900 space-y-3">
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                {/* Spacious Search Bar */}
                <div className="relative flex-1">
                  <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search by name or email..."
                    value={searchQuery}
                    onChange={(e) => handleSearchChange(e.target.value)}
                    className="w-full pl-10 pr-9 py-2 text-xs sm:text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder:text-slate-400 outline-none focus:border-[#0A3824] dark:focus:border-emerald-500 focus:ring-1 focus:ring-[#0A3824]/15 transition-all"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => handleSearchChange('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Elegant 'All Statuses' Dropdown Selector */}
                <div className="relative shrink-0 flex items-center">
                  <div className="relative w-full sm:w-auto">
                    <Filter className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-400 pointer-events-none" />
                    <select
                      value={statusFilter}
                      onChange={(e) => handleStatusFilterChange(e.target.value)}
                      className="w-full sm:w-auto pl-8.5 pr-8 py-2 text-xs sm:text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-medium text-slate-700 dark:text-slate-200 outline-none hover:border-slate-300 dark:hover:border-slate-600 focus:border-[#0A3824] dark:focus:border-emerald-500 cursor-pointer appearance-none shadow-2xs"
                    >
                      <option value="all">All Statuses</option>
                      <option value="active">Active Accounts</option>
                      <option value="pending">Pending Verification</option>
                      <option value="inactive">Inactive Accounts</option>
                    </select>
                    <ChevronDown className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  </div>
                </div>
              </div>

              {/* Un-cropped, Horizontally Spacious Tab Selection Bar with Inline Pagination */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-0.5">
                <div className="flex flex-wrap items-center gap-1.5">
                  {ROLE_TABS.map((tab) => {
                    const isActive = roleFilter === tab.id;
                    return (
                      <button
                        key={tab.id}
                        onClick={() => handleRoleChange(tab.id)}
                        className={`px-3.5 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all duration-150 cursor-pointer ${
                          isActive
                            ? 'bg-[#D1F2DF] text-[#15803D] border border-[#A7F3D0] dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800 font-semibold shadow-2xs'
                            : 'bg-slate-100/90 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-white'
                        }`}
                      >
                        {tab.label}
                      </button>
                    );
                  })}
                </div>

              </div>
            </div>

            {/* Beautifully Balanced Data Table with Spacious Horizontal Margins */}
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200/90 dark:border-slate-800 shadow-xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-left">
                  <thead className="bg-slate-50/80 dark:bg-slate-800/60 border-b border-slate-200/80 dark:border-slate-800 text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    <tr>
                      <th className="px-6 py-3.5">USER</th>
                      <th className="px-6 py-3.5">ROLE</th>
                      <th className="px-6 py-3.5">STATUS</th>
                      <th className="px-6 py-3.5 text-right">ACTIONS</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {tableError ? (
                      <tr>
                        <td colSpan={4} className="px-6 py-10 text-center text-xs text-red-600 bg-red-50/40 dark:bg-red-950/20">
                          <div className="flex flex-col items-center gap-2">
                            <AlertCircle className="w-5 h-5 text-red-500" />
                            <p className="font-semibold">{tableError}</p>
                            <button
                              onClick={() => fetchUsers(page, roleFilter, statusFilter, searchQuery)}
                              className="mt-1 px-3.5 py-1.5 rounded-lg bg-red-100 dark:bg-red-900/40 hover:bg-red-200 text-red-800 dark:text-red-200 font-semibold transition-colors cursor-pointer text-xs"
                            >
                              Retry Loading Users
                            </button>
                          </div>
                        </td>
                      </tr>
                    ) : tableLoading ? (
                      <tr>
                        <td colSpan={4} className="px-6 py-12 text-center text-xs text-slate-400">
                          <div className="flex items-center justify-center gap-2.5">
                            <div className="w-4 h-4 border-2 border-[#0A3824] dark:border-emerald-400 border-t-transparent rounded-full animate-spin" />
                            <span className="font-medium text-slate-500">Loading directory...</span>
                          </div>
                        </td>
                      </tr>
                    ) : users.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-6 py-12 text-center text-xs text-slate-500 dark:text-slate-400">
                          <p className="font-semibold text-slate-700 dark:text-slate-200">No users match the current criteria.</p>
                          <p className="text-[11px] text-slate-400 mt-1">Try adjusting your search query or clearing the filter.</p>
                          {(roleFilter !== 'all' || statusFilter !== 'all' || searchQuery) && (
                            <button
                              onClick={() => {
                                setSearchQuery('');
                                setStatusFilter('all');
                                handleRoleChange('all');
                              }}
                              className="mt-3 px-3.5 py-1.5 text-xs rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold transition-colors cursor-pointer"
                            >
                              Clear Filters &amp; Show All
                            </button>
                          )}
                        </td>
                      </tr>
                    ) : (
                      users.map((u) => {
                        return (
                          <tr key={u.user_id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors">
                            {/* USER Column: Name + Inline ID Badge + Email Underneath */}
                            <td className="px-6 py-4">
                              <p className="font-semibold text-slate-900 dark:text-white text-sm" title={`ID: ${u.employee_number || u.user_id.slice(0, 8)}`}>
                                {u.full_name}
                              </p>
                              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 break-all">
                                {u.email}
                              </p>
                            </td>

                            {/* ROLE Column: Pill with dot */}
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-[#EEF2F6] text-[#334155] border border-[#E2E8F0] dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700">
                                <span className="w-1.5 h-1.5 rounded-full bg-slate-500 dark:bg-slate-400" />
                                {accountRoleLabel(u.role)}
                              </span>
                            </td>

                            {/* STATUS Column: Soft Vibrant Light-Green Active Indicator */}
                            <td className="px-6 py-4 whitespace-nowrap">
                              {u.account_status === 'active' ? (
                                <span className="inline-flex items-center justify-center px-2.5 py-0.5 rounded-md text-xs font-medium bg-[#DCFCE7] text-[#15803D] border border-[#BBF7D0] dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800/60">
                                  active
                                </span>
                              ) : u.account_status === 'pending' ? (
                                <span className="inline-flex items-center justify-center px-2.5 py-0.5 rounded-md text-xs font-medium bg-[#FEF3C7] text-[#B45309] border border-[#FDE68A] dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800/60">
                                  pending
                                </span>
                              ) : (
                                <span className="inline-flex items-center justify-center px-2.5 py-0.5 rounded-md text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700">
                                  inactive
                                </span>
                              )}
                            </td>

                            {/* ACTIONS Column: Modern Flat-Style Pill Buttons + Compressed Delete Button */}
                            <td className="px-6 py-4 text-right whitespace-nowrap">
                              <div className="inline-flex items-center justify-end gap-2">
                                {u.account_status === 'pending' && u.role !== 'Student' && (
                                  <button
                                    type="button"
                                    onClick={() => handleStatusChange(u.user_id, 'active')}
                                    disabled={loadingId === u.user_id}
                                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full border border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950/40 text-xs font-medium text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 shadow-2xs transition-all cursor-pointer disabled:opacity-50"
                                  >
                                    <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                                    <span>Approve</span>
                                  </button>
                                )}
                                {u.account_status === 'active' && (
                                  <button
                                    type="button"
                                    onClick={() => { setDeleteError(''); setDeleteTarget(u); }}
                                    disabled={loadingId === u.user_id}
                                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 shadow-2xs transition-all cursor-pointer disabled:opacity-50"
                                  >
                                    <Trash2 className="w-3.5 h-3.5 text-slate-600 dark:text-slate-400" />
                                    <span>Deactivate</span>
                                  </button>
                                )}
                                {u.account_status === 'inactive' && (
                                  <button
                                    type="button"
                                    onClick={() => handleStatusChange(u.user_id, 'active')}
                                    disabled={loadingId === u.user_id}
                                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 shadow-2xs transition-all cursor-pointer disabled:opacity-50"
                                  >
                                    <RotateCcw className="w-3.5 h-3.5 text-slate-600 dark:text-slate-400" />
                                    <span>Reactivate</span>
                                  </button>
                                )}

                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

            {/* Table Pagination Footer */}
            {totalCount > 0 && (
              <div className="px-4 py-3 bg-slate-50 dark:bg-slate-800/70 border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
                <span>
                  Showing <strong className="text-slate-700 dark:text-slate-200">{startIndex}</strong> to{' '}
                  <strong className="text-slate-700 dark:text-slate-200">{endIndex}</strong> of{' '}
                  <strong className="text-slate-700 dark:text-slate-200">{totalCount}</strong> users
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-slate-400">Page {page} of {totalPages}</span>
                  <div className="flex items-center gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={page <= 1 || tableLoading}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      className="h-7 px-2 border-slate-200 dark:border-slate-700 cursor-pointer"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={page >= totalPages || tableLoading}
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      className="h-7 px-2 border-slate-200 dark:border-slate-700 cursor-pointer"
                    >
                      <ChevronRight className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>
        )}

        {/* Announcements tab: compose and sent list side by side on wide screens */}
        {activeTab === 'announcements' && (
          <section className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
            <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs p-5 sm:p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-[#0A3824] dark:text-emerald-400 flex items-center justify-center shrink-0">
                  <Megaphone className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <h2 className="text-base font-bold text-slate-900 dark:text-white">Send Announcement</h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Delivered to the dashboards and inboxes of trainees and staff.</p>
                </div>
              </div>

              <form onSubmit={handlePublishAnnouncement} className="space-y-3.5">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Subject / Title</label>
                  <Input
                    placeholder="e.g. Practicum Orientation Schedule"
                    value={anncTitle}
                    onChange={(e) => setAnncTitle(e.target.value)}
                    required
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Send to</label>
                  <select
                    className="w-full h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-white outline-none focus:border-[#0A3824] focus:ring-1 focus:ring-[#0A3824] transition-all cursor-pointer"
                    value={anncDept}
                    onChange={(e) => setAnncDept(e.target.value)}
                  >
                    <option value="All">All Departments (Campus-wide)</option>
                    <option value="ICS">Institute of Computing Studies (ICS)</option>
                    <option value="IBE">Institute of Business and Entrepreneurship (IBE)</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Message</label>
                  <textarea
                    className="w-full p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-white outline-none focus:border-[#0A3824] focus:ring-1 focus:ring-[#0A3824] min-h-[110px] transition-all"
                    placeholder="Write the notice that all system users will receive..."
                    value={anncContent}
                    onChange={(e) => setAnncContent(e.target.value)}
                    required
                  />
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setAnncDeliveryType('announcement')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                        anncDeliveryType === 'announcement'
                          ? 'bg-[#0A3824] text-[var(--cdm-sand)] shadow-xs'
                          : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      📢 General Notice
                    </button>
                    <button
                      type="button"
                      onClick={() => setAnncDeliveryType('alert')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                        anncDeliveryType === 'alert'
                          ? 'bg-amber-600 text-white shadow-xs'
                          : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      🚨 Urgent Alert
                    </button>
                  </div>

                  <Button
                    type="submit"
                    className="bg-[#0A3824] hover:bg-[#092E1D] text-[var(--cdm-sand)] font-bold text-xs cursor-pointer shadow-xs"
                    loading={anncLoading}
                  >
                    {anncDeliveryType === 'alert' ? 'Send Urgent Alert' : 'Send Announcement'}
                  </Button>
                </div>
              </form>
            </div>

            <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs overflow-hidden">
              <div className="p-5 sm:p-6 pb-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400 flex items-center justify-center shrink-0">
                    <Bell className="w-4 h-4" />
                  </div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    Sent Announcements <span className="text-slate-400 font-medium">({announcements.length})</span>
                  </h3>
                </div>
                <Button size="sm" variant="outline" onClick={loadAnnouncements} disabled={anncListLoading} className="text-xs h-7 cursor-pointer shrink-0">
                  Refresh
                </Button>
              </div>

              <div className="border-t border-slate-100 dark:border-slate-800">
                {anncListLoading ? (
                  <div className="p-8 text-center text-xs text-slate-400">Loading announcements...</div>
                ) : anncListError ? (
                  <div role="alert" className="p-6 text-sm text-rose-700">
                    {anncListError} <button type="button" onClick={loadAnnouncements} className="underline font-semibold cursor-pointer">Retry</button>
                  </div>
                ) : announcements.length === 0 ? (
                  <div className="p-8 text-center text-xs text-slate-500">
                    <p className="font-semibold text-slate-700 dark:text-slate-200">No announcements sent yet.</p>
                    <p className="text-[11px] text-slate-400 mt-1">Announcements you send will be listed here.</p>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-[480px] overflow-y-auto">
                    {announcements.map((annc) => (
                      <div key={annc.announcement_id} className="p-4 sm:p-5 flex items-start justify-between gap-3 hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-[9px] font-extrabold px-2 py-0.5 rounded bg-[#0A3824] text-[var(--cdm-sand)] uppercase tracking-wider">
                              {annc.target_department === 'All' ? 'Campus-Wide' : `${annc.target_department} Dept`}
                            </span>
                            <span className="text-[11px] text-slate-400 font-medium">
                              {new Date(annc.created_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
                            </span>
                          </div>
                          <h4 className="text-xs font-bold text-slate-900 dark:text-white leading-snug">{annc.title}</h4>
                          <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 line-clamp-2 leading-relaxed">{annc.content}</p>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleDeleteAnnouncementClick(annc)}
                          title="Delete announcement"
                          className="text-xs font-bold text-rose-600 hover:text-white bg-rose-50 hover:bg-rose-600 border border-rose-200 hover:border-rose-600 px-2.5 py-1.5 rounded-lg transition-all flex items-center gap-1 shrink-0 cursor-pointer shadow-2xs"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Delete</span>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

      {/* System Security & Audit Trail */}
        {activeTab === 'audit' && (
      <div className="space-y-3 pt-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-[#0A3824]" />
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">System Activity & Security Audit Trail</h2>
          </div>
          <Button size="sm" variant="outline" onClick={loadAudit} disabled={auditLoading} className="text-xs h-7 cursor-pointer">
            Refresh Log
          </Button>
        </div>

        <Card className="border-slate-200/80 dark:border-slate-800 shadow-sm overflow-hidden bg-white dark:bg-slate-900">
          <CardContent className="p-0">
            {auditLoading ? (
              <div className="p-8 text-center text-xs text-slate-400">Loading audit records...</div>
            ) : auditError ? (
              <div role="alert" className="p-8 text-sm text-rose-700">{auditError} Use Refresh Log to retry.</div>
            ) : auditLogs.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                <p className="font-semibold text-slate-700">No security audit events recorded yet.</p>
                <p className="text-[11px] text-slate-400 mt-1">
                  Administrative actions (invitations, account deactivation, and system changes) are automatically logged.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                    <tr>
                      <th className="px-4 py-3">Timestamp</th>
                      <th className="px-4 py-3">Actor</th>
                      <th className="px-4 py-3">Action</th>
                      <th className="px-4 py-3">Target</th>
                      <th className="px-4 py-3">Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {auditLogs.map((log) => (
                      <tr key={log.log_id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                        <td className="px-4 py-2.5 text-slate-500 dark:text-slate-400 whitespace-nowrap">
                          {new Date(log.created_at).toLocaleString()}
                        </td>
                        <td className="px-4 py-2.5">
                          <span className="font-semibold text-slate-800 dark:text-slate-100">{log.actor_name}</span>
                          <span className="text-[10px] text-slate-400 block">{log.actor_role}</span>
                        </td>
                        <td className="px-4 py-2.5">
                          <span className="inline-block px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700 font-semibold">
                            {formatAuditAction(log.action)}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-slate-600 dark:text-slate-300">
                          <span className="capitalize">{log.entity_type}</span>
                          {log.entity_id && <span className="block font-mono text-[10px] text-slate-400" title={log.entity_id}>{log.entity_id.slice(0, 8)}…</span>}
                        </td>
                        <td className="px-4 py-2.5 text-slate-500 dark:text-slate-400 text-[11px] break-words">
                          {formatAuditDetails(log.details)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
        )}
      </>

      {/* Backup administration remains provider-side; avoid exporting academic data in-app. */}
      {/* ========================================================================= */}
      <Card>
        <CardContent className="p-5 text-sm text-slate-600 dark:text-slate-300">
          Database backups and restores are managed in the Supabase project. Storage objects require a separate backup; the application does not export student records.
        </CardContent>
      </Card>

      {/* Modal: Delete User Confirmation */}
      <Modal
        title="Deactivate User Account"
        open={!!deleteTarget}
        onClose={() => { if (!deleteLoading) setDeleteTarget(null); }}
      >
        <div className="space-y-4">
          <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 flex items-start gap-3 text-xs text-red-900">
            <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-bold">The user will lose access; linked academic records remain intact.</p>
              <p className="text-red-700 leading-relaxed">
                Deactivating this account revokes access while preserving the profile and OJT history.
              </p>
            </div>
          </div>

          {deleteTarget && (
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500 font-medium">User Name:</span>
                <span className="font-bold text-slate-900">{deleteTarget.full_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 font-medium">Email Address:</span>
                <span className="font-mono text-slate-700">{deleteTarget.email}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 font-medium">Assigned Role:</span>
                <Badge variant="outline" className="text-[10px] font-bold">
                  {deleteTarget.role}
                </Badge>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 font-medium">Current Status:</span>
                <span className="font-semibold text-slate-700 uppercase text-[10px]">
                  {deleteTarget.account_status}
                </span>
              </div>
            </div>
          )}

          {deleteError && (
            <div className="p-3 rounded-lg bg-red-50 text-red-700 text-xs font-medium border border-red-200">
              {deleteError}
            </div>
          )}

          <div className="flex gap-2.5 pt-2">
            <Button
              type="button"
              variant="ghost"
              disabled={deleteLoading}
              onClick={() => setDeleteTarget(null)}
              className="flex-1 cursor-pointer"
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              loading={deleteLoading}
              onClick={handleDeleteUser}
              className="flex-1 bg-red-600 hover:bg-red-700 text-white font-bold cursor-pointer"
            >
              Deactivate Account
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal: Create Staff Account */}
      <Modal title="Invite OJT Coordinator" open={createModalOpen} onClose={() => setCreateModalOpen(false)}>
        <form onSubmit={handleCreateStaff} className="space-y-4">
          <Input
            label="Full Name"
            placeholder="e.g. Prof. Maria Santos"
            value={staffForm.full_name}
            onChange={(e) => setStaffForm({ ...staffForm, full_name: e.target.value })}
            required
          />

          <Input
            label="Institutional Email"
            type="email"
            placeholder="e.g. msantos@cdm.edu.ph"
            value={staffForm.email}
            onChange={(e) => setStaffForm({ ...staffForm, email: e.target.value })}
            required
          />

          <fieldset className="space-y-2">
            <legend className="text-xs font-semibold text-slate-700">Department access</legend>
            {(['ICS', 'IBE'] as const).map(department => (
              <label key={department} className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={staffForm.department_scopes.includes(department)}
                  onChange={event => setStaffForm({
                    ...staffForm,
                    department_scopes: event.target.checked
                      ? [...staffForm.department_scopes, department]
                      : staffForm.department_scopes.filter(item => item !== department),
                  })}
                />
                {department === 'ICS' ? 'Institute of Computing Studies (ICS)' : 'Institute of Business and Entrepreneurship (IBE)'}
              </label>
            ))}
          </fieldset>

          {createError && (
            <div className="p-3 rounded-lg bg-red-50 text-red-700 text-xs font-medium border border-red-200">
              {createError}
            </div>
          )}

          <div className="flex gap-2.5 pt-2">
            <Button type="button" variant="ghost" onClick={() => setCreateModalOpen(false)} className="flex-1">
              Cancel
            </Button>
            <Button
              type="submit"
              loading={createLoading}
              className="flex-1 bg-[#0A3824] hover:bg-[#092E1D] text-[var(--cdm-sand)] font-bold"
            >
              Send Setup Invitation
            </Button>
          </div>
        </form>
      </Modal>
      {/* Permanent Delete Announcement Confirmation Modal */}
      {deleteAnncModalOpen && anncToDelete && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-100 page-fade-in">
            <div className="flex items-center gap-3 text-rose-600 mb-4">
              <div className="w-10 h-10 rounded-full bg-rose-50 border border-rose-200 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5 text-rose-600" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Delete Broadcast Notice?</h3>
                <p className="text-xs text-slate-500">This action cannot be undone.</p>
              </div>
            </div>

            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl mb-4 text-xs space-y-1">
              <p className="font-bold text-slate-800">{anncToDelete.title}</p>
              <p className="text-slate-600 line-clamp-2">{anncToDelete.content}</p>
              <p className="text-[10px] text-slate-400 pt-1">
                Target: {anncToDelete.target_department === 'All' ? 'Campus-Wide' : anncToDelete.target_department} • {new Date(anncToDelete.created_at).toLocaleDateString()}
              </p>
            </div>

            <p className="text-xs text-slate-600 mb-5 leading-relaxed">
              Deleting this announcement removes it from student and OJT Coordinator dashboards.
            </p>

            <div className="flex items-center justify-end gap-2.5">
              <Button
                variant="outline"
                size="sm"
                onClick={() => { setDeleteAnncModalOpen(false); setAnncToDelete(null); }}
                disabled={deleteAnncLoading}
                className="cursor-pointer"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={confirmDeleteAnnouncement}
                loading={deleteAnncLoading}
                className="bg-rose-600 hover:bg-rose-700 text-white font-bold cursor-pointer"
              >
                <Trash2 className="w-4 h-4 mr-1.5" />
                Delete Announcement
              </Button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
