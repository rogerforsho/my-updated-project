'use client';

import { useEffect, useState, useCallback } from 'react';
import dynamic from 'next/dynamic';
import Button from '@/src/components/ui/Button';
import Input from '@/src/components/ui/Input';
import Alert from '@/src/components/ui/Alert';
import Badge from '@/src/components/ui/Badge';
import Modal from '@/src/components/ui/Modal';
import { Trash2, AlertTriangle, RotateCcw, Search, Filter } from '@/src/components/ui/Icons';
import {
  listCompanies, createCompany, updateCompany, setCompanyStatus, deleteCompany,
  type CompanyInput, type CompanyWithSupervisors,
} from '@/src/services/companies';

const LocationPickerMap = dynamic(
  () => import('@/src/components/companies/LocationPickerMap'),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-64 bg-slate-100 animate-pulse rounded-xl flex items-center justify-center text-xs text-slate-400">
        Loading OpenStreetMap...
      </div>
    ),
  }
);

const EMPTY_FORM: CompanyInput = {
  company_name: '',
  address: '',
  contact_person: '',
  contact_email: '',
  contact_number: '',
  latitude: null,
  longitude: null,
  geofence_radius_meters: 50,
  geofence_enabled: false,
};

const PAGE_SIZE = 20;

export default function CoordinatorCompaniesPage() {
  const [companies, setCompanies] = useState<CompanyWithSupervisors[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<CompanyWithSupervisors | null>(null);
  const [form, setForm] = useState<CompanyInput>(EMPTY_FORM);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  // Delete State
  const [deleteTarget, setDeleteTarget] = useState<CompanyWithSupervisors | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const load = useCallback(async (p: number) => {
    setLoading(true);
    setError('');
    const result = await listCompanies(p, PAGE_SIZE);
    setLoading(false);
    if (result.error) { setError(result.error.message); return; }
    setCompanies(result.data!.companies);
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

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormError('');
    setSuccessMessage('');
    setModalOpen(true);
  }

  function openEdit(company: CompanyWithSupervisors) {
    setEditing(company);
    setForm({
      company_name: company.company_name,
      address: company.address,
      contact_person: company.contact_person,
      contact_email: company.contact_email,
      contact_number: company.contact_number,
      latitude: company.latitude ?? null,
      longitude: company.longitude ?? null,
      geofence_radius_meters: company.geofence_radius_meters ?? 50,
      geofence_enabled: company.geofence_enabled ?? false,
    });
    setFormError('');
    setSuccessMessage('');
    setModalOpen(true);
  }

  async function handleSave() {
    setFormError('');
    setSaving(true);
    const result = editing
      ? await updateCompany(editing.company_id, form)
      : await createCompany(form);
    setSaving(false);
    if (result.error) { setFormError(result.error.message); return; }
    setModalOpen(false);
    setSuccessMessage(editing ? 'Company details updated successfully.' : 'New company added successfully.');
    load(page);
  }

  async function handleToggleStatus(company: CompanyWithSupervisors) {
    setSuccessMessage('');
    const next = company.status === 'active' ? 'inactive' : 'active';
    const result = await setCompanyStatus(company.company_id, next);
    if (result.error) { setError(result.error.message); return; }
    setSuccessMessage(`Company status updated to ${next}.`);
    load(page);
  }

  async function handleDeleteCompany() {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError('');
    const result = await deleteCompany(deleteTarget.company_id);
    setDeleting(false);
    if (result.error) {
      setDeleteError(result.error.message);
      return;
    }
    const name = deleteTarget.company_name;
    setDeleteTarget(null);
    setSuccessMessage(`Company "${name}" was permanently deleted.`);
    load(page);
  }

  // Table Controls State
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive' | 'geofence' | 'with-supervisors' | 'no-supervisors'>('all');

  const filteredCompanies = companies.filter(c => {
    // 1. Search Query filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchesName = c.company_name?.toLowerCase().includes(q);
      const matchesContact = c.contact_person?.toLowerCase().includes(q);
      const matchesEmail = c.contact_email?.toLowerCase().includes(q);
      const matchesAddress = c.address?.toLowerCase().includes(q);
      if (!matchesName && !matchesContact && !matchesEmail && !matchesAddress) return false;
    }

    // 2. Status & Attributes filter
    if (statusFilter === 'active' && c.status !== 'active') return false;
    if (statusFilter === 'inactive' && c.status !== 'inactive') return false;
    if (statusFilter === 'geofence' && (!c.geofence_enabled || c.latitude == null || c.longitude == null)) return false;
    if (statusFilter === 'with-supervisors' && (!c.supervisors || c.supervisors.length === 0)) return false;
    if (statusFilter === 'no-supervisors' && c.supervisors && c.supervisors.length > 0) return false;

    return true;
  });

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto page-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Partner Companies</h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            {total} partner establishment{total !== 1 ? 's' : ''} registered across Colegio de Montalban OJT network
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              load(page);
              window.location.reload();
            }}
            title="Reload table and data"
            className="text-xs text-slate-700 hover:text-slate-900"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Refresh
          </Button>
          <Button size="sm" onClick={openCreate}>+ Add Company</Button>
        </div>
      </div>

      {successMessage && (
        <div className="mb-4">
          <Alert type="success" message={successMessage} />
        </div>
      )}

      {error && (
        <div className="mb-4">
          <Alert type="error" message={error} />
        </div>
      )}

      {/* Main Table Card */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden">
        {/* Global Table Controls Bar */}
        <div className="p-4 border-b border-slate-100 bg-slate-50/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Quick Search */}
          <div className="relative flex-1 max-w-sm">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search companies by name, contact, email..."
              className="w-full pl-9 pr-8 py-1.5 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-700/20 focus:border-emerald-700 transition-all text-slate-800 placeholder:text-slate-400 shadow-2xs"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs cursor-pointer p-0.5"
                title="Clear search"
              >
                ✕
              </button>
            )}
          </div>

          {/* Filter Dropdown & Row Counts */}
          <div className="flex items-center gap-2.5 justify-between sm:justify-end">
            <div className="flex items-center gap-1.5 bg-white px-2.5 py-1 border border-slate-200 rounded-xl shadow-2xs">
              <Filter className="w-3.5 h-3.5 text-slate-500" />
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value as any)}
                aria-label="Filter companies by status"
                className="text-xs bg-transparent text-slate-700 font-medium focus:outline-none cursor-pointer pr-1"
              >
                <option value="all">All Statuses ({total})</option>
                <option value="active">Active Only</option>
                <option value="inactive">Inactive Only</option>
                <option value="geofence">GPS Configured</option>
                <option value="with-supervisors">With Supervisors</option>
                <option value="no-supervisors">No Supervisors</option>
              </select>
            </div>

            <span className="text-xs text-slate-500 font-medium px-2 py-1 bg-slate-100/70 rounded-lg">
              Showing {filteredCompanies.length} of {total}
            </span>
          </div>
        </div>

        {/* Table Body */}
        {loading ? (
          <div className="flex items-center justify-center py-20 text-slate-400 text-sm">
            <RotateCcw className="w-5 h-5 animate-spin mr-2 text-emerald-700" />
            Loading partner companies...
          </div>
        ) : filteredCompanies.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400">
            <span className="text-4xl mb-3">🏢</span>
            <p className="text-sm font-medium text-slate-600">
              {searchQuery || statusFilter !== 'all' ? 'No companies match your filters.' : 'No companies registered yet.'}
            </p>
            {searchQuery || statusFilter !== 'all' ? (
              <button
                type="button"
                onClick={() => { setSearchQuery(''); setStatusFilter('all'); }}
                className="mt-3 text-xs text-emerald-700 hover:text-emerald-800 font-semibold underline cursor-pointer"
              >
                Clear search & filters
              </button>
            ) : (
              <Button size="sm" onClick={openCreate} className="mt-4">Add First Company</Button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/75">
                  <th className="text-left pl-5 pr-8 py-3.5 font-semibold text-slate-700 text-xs">
                    Company & Address
                  </th>
                  <th className="text-left px-4 py-3.5 font-semibold text-slate-700 text-xs">
                    Contact Details
                  </th>
                  <th className="text-left px-3.5 py-3.5 font-semibold text-slate-700 text-xs">
                    Workplace GPS
                  </th>
                  <th className="text-center px-3 py-3.5 font-semibold text-slate-700 text-xs">
                    Supervisors
                  </th>
                  <th className="text-center px-3 py-3.5 font-semibold text-slate-700 text-xs">
                    Status
                  </th>
                  <th className="text-right pr-5 pl-3 py-3.5 font-semibold text-slate-700 text-xs whitespace-nowrap min-w-[220px]">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredCompanies.map(c => (
                  <tr
                    key={c.company_id}
                    className="hover:bg-emerald-50/35 transition-colors duration-150"
                  >
                    {/* Company Column with generous right padding */}
                    <td className="pl-5 pr-8 py-3.5 max-w-[280px]">
                      <p className="font-semibold text-slate-900 text-sm leading-snug truncate" title={c.company_name}>
                        {c.company_name}
                      </p>
                      <p className="text-[11px] text-slate-500 mt-0.5 truncate" title={c.address}>
                        {c.address?.trim() ? c.address : <span className="text-slate-400 italic">No address provided</span>}
                      </p>
                    </td>

                    {/* Contact Person & Email with explicit placeholders */}
                    <td className="px-4 py-3.5 max-w-[220px]">
                      <p className="font-medium text-slate-800 text-xs leading-snug truncate" title={c.contact_person}>
                        {c.contact_person?.trim() ? (
                          c.contact_person
                        ) : (
                          <span className="text-slate-400 italic">Not Assigned</span>
                        )}
                      </p>
                      <p className="text-[11px] text-slate-500 mt-0.5 truncate" title={c.contact_email}>
                        {c.contact_email?.trim() ? (
                          c.contact_email
                        ) : (
                          <span className="text-slate-400 font-medium" title="No email provided">—</span>
                        )}
                      </p>
                    </td>

                    {/* Workplace GPS with fallback */}
                    <td className="px-3.5 py-3.5 whitespace-nowrap">
                      {c.geofence_enabled && c.latitude != null && c.longitude != null ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                          📍 {c.geofence_radius_meters ?? 50}m
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400 font-medium" title="GPS Location not configured">—</span>
                      )}
                    </td>

                    {/* Supervisors with explicit count or dash */}
                    <td className="px-3 py-3.5 text-center whitespace-nowrap">
                      {c.supervisors && c.supervisors.length > 0 ? (
                        <span className="inline-flex items-center justify-center px-2 py-0.5 text-xs font-semibold rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200/80">
                          {c.supervisors.length} assigned
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400 font-medium" title="No supervisors assigned">—</span>
                      )}
                    </td>

                    {/* Status badge */}
                    <td className="px-3 py-3.5 text-center whitespace-nowrap">
                      <Badge status={c.status} />
                    </td>

                    {/* Locked Right-Aligned Action Buttons */}
                    <td className="pr-5 pl-3 py-3.5 whitespace-nowrap text-right min-w-[220px]">
                      <div className="inline-flex items-center justify-end gap-1.5 w-full">
                        <button
                          type="button"
                          onClick={() => openEdit(c)}
                          className="w-[50px] text-center px-2 py-1 text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                          title={`Edit ${c.company_name}`}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => handleToggleStatus(c)}
                          className={`w-[84px] text-center px-2 py-1 text-xs font-medium rounded-lg transition-colors cursor-pointer ${
                            c.status === 'active'
                              ? 'text-amber-700 bg-amber-50 hover:bg-amber-100/70 border border-amber-200/50'
                              : 'text-emerald-700 bg-emerald-50 hover:bg-emerald-100/70 border border-emerald-200/50'
                          }`}
                          title={c.status === 'active' ? 'Deactivate Company' : 'Activate Company'}
                        >
                          {c.status === 'active' ? 'Deactivate' : 'Activate'}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setDeleteTarget(c);
                            setDeleteError('');
                            setSuccessMessage('');
                          }}
                          className="w-[74px] justify-center inline-flex items-center gap-1 px-2 py-1 text-xs font-semibold text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-lg border border-rose-200 transition-colors cursor-pointer shadow-2xs"
                          title={`Delete ${c.company_name}`}
                        >
                          <Trash2 className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Global Pagination Bar */}
        <div className="p-4 border-t border-slate-100 bg-slate-50/40 flex items-center justify-between text-xs text-slate-500">
          <span>
            Page <strong className="text-slate-700">{page}</strong> of <strong className="text-slate-700">{totalPages || 1}</strong> ({total} total companies)
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1 || loading}
              className="text-xs"
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(p => p + 1)}
              disabled={page >= totalPages || loading}
              className="text-xs"
            >
              Next
            </Button>
          </div>
        </div>
      </div>

      {/* Create / Edit Modal */}
      <Modal
        title={editing ? 'Edit Company' : 'Add Company'}
        open={modalOpen}
        onClose={() => setModalOpen(false)}
      >
        <div className="space-y-4">
          <Input label="Company Name" value={form.company_name} onChange={e => setForm(f => ({ ...f, company_name: e.target.value }))} required />
          <Input label="Address" value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} required />
          <Input label="Contact Person" value={form.contact_person} onChange={e => setForm(f => ({ ...f, contact_person: e.target.value }))} required />
          <Input label="Contact Email" type="email" value={form.contact_email} onChange={e => setForm(f => ({ ...f, contact_email: e.target.value }))} required />
          <Input label="Contact Number" value={form.contact_number} onChange={e => setForm(f => ({ ...f, contact_number: e.target.value }))} required />

          {/* Workplace GPS Verification Configuration */}
          <div className="pt-3 border-t border-slate-100">
            <label className="flex items-center gap-2 cursor-pointer mb-3">
              <input
                type="checkbox"
                checked={form.geofence_enabled || false}
                onChange={e => setForm(f => ({ ...f, geofence_enabled: e.target.checked }))}
                className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 w-4 h-4"
              />
              <span className="text-sm font-semibold text-slate-800">Enable Workplace GPS Verification for Trainee Attendance</span>
            </label>

            {form.geofence_enabled && (
              <div className="space-y-3">
                <LocationPickerMap
                  latitude={form.latitude}
                  longitude={form.longitude}
                  radiusMeters={form.geofence_radius_meters || 50}
                  initialSearchQuery={form.address}
                  onLocationChange={(lat, lng) => setForm(f => ({ ...f, latitude: lat, longitude: lng }))}
                  onRadiusChange={(radius) => setForm(f => ({ ...f, geofence_radius_meters: radius }))}
                />

                {/* Optional manual coordinate fine-tuning */}
                <details className="text-xs text-slate-500 bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                  <summary className="cursor-pointer font-medium text-slate-600 hover:text-slate-900">
                    Manual Coordinate Override (Advanced)
                  </summary>
                  <div className="grid grid-cols-2 gap-2 mt-2 pt-2 border-t border-slate-200">
                    <Input
                      label="Latitude"
                      type="number"
                      step="any"
                      placeholder="e.g. 14.731234"
                      value={form.latitude != null ? String(form.latitude) : ''}
                      onChange={e => setForm(f => ({ ...f, latitude: e.target.value === '' ? null : parseFloat(e.target.value) }))}
                      required={form.geofence_enabled}
                    />
                    <Input
                      label="Longitude"
                      type="number"
                      step="any"
                      placeholder="e.g. 121.141234"
                      value={form.longitude != null ? String(form.longitude) : ''}
                      onChange={e => setForm(f => ({ ...f, longitude: e.target.value === '' ? null : parseFloat(e.target.value) }))}
                      required={form.geofence_enabled}
                    />
                  </div>
                </details>
              </div>
            )}
          </div>

          {formError && <Alert type="error" message={formError} />}
          <div className="flex gap-3 pt-3">
            <Button onClick={handleSave} loading={saving} className="flex-1">{editing ? 'Save Changes' : 'Add Company'}</Button>
            <Button variant="ghost" onClick={() => setModalOpen(false)} className="flex-1">Cancel</Button>
          </div>
        </div>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        title="Delete Partner Company"
        open={!!deleteTarget}
        onClose={() => { if (!deleting) setDeleteTarget(null); }}
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-3.5 bg-rose-50 border border-rose-100 rounded-xl text-rose-900">
            <div className="p-2 bg-rose-100 rounded-lg text-rose-600 shrink-0">
              <Trash2 className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-sm font-semibold">Confirm Establishment Deletion</h4>
              <p className="text-xs text-rose-700 mt-1 leading-relaxed">
                Are you sure you want to permanently delete <strong>{deleteTarget?.company_name}</strong>? This action cannot be undone.
              </p>
            </div>
          </div>

          {deleteError && <Alert type="error" message={deleteError} />}

          <div className="text-xs text-slate-600 bg-amber-50/70 p-3 rounded-xl border border-amber-200/80 flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-semibold text-amber-900">Student Practicum Integrity Safeguard</p>
              <p className="text-amber-800 leading-relaxed">
                Companies linked to past or ongoing student practicum assignments cannot be deleted to preserve academic audit trails. If the partner is simply no longer accepting interns, please use <strong>Deactivate</strong> instead.
              </p>
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <Button
              variant="destructive"
              onClick={handleDeleteCompany}
              loading={deleting}
              className="flex-1"
            >
              Permanently Delete
            </Button>
            <Button
              variant="ghost"
              onClick={() => setDeleteTarget(null)}
              disabled={deleting}
              className="flex-1"
            >
              Cancel
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

