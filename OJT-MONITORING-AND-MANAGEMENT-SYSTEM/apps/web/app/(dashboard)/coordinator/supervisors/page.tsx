'use client';

import { useEffect, useState, useCallback } from 'react';
import Button from '@/src/components/ui/Button';
import Input from '@/src/components/ui/Input';
import Alert from '@/src/components/ui/Alert';
import Modal from '@/src/components/ui/Modal';
import { createSupervisor, listSupervisors, type SupervisorInput } from '@/src/services/supervisors';
import { SupervisorInvitesPanel } from '@/src/components/SupervisorInvitesPanel';
import { CompanyPicker } from '@/src/components/ui/CompanyPicker';

const PAGE_SIZE = 20;

const EMPTY_FORM: SupervisorInput = {
  full_name: '',
  email: '',
  company_id: '',
  position: '',
};

export default function SupervisorsPage() {
  const [supervisors, setSupervisors] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<SupervisorInput>(EMPTY_FORM);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [search, setSearch] = useState('');

  const load = useCallback(async (p: number) => {
    setLoading(true);
    setError('');
    const result = await listSupervisors(p, PAGE_SIZE, search);
    setLoading(false);
    if (result.error) { setError(result.error.message); return; }
    setSupervisors(result.data!.supervisors);
    setTotal(result.data!.total);
  }, [search]);

  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchText.trim()); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [searchText]);

  useEffect(() => {
    let mounted = true;
    const fetchData = async () => {
      if (!mounted) return;
      await load(page);
    };
    fetchData();
    return () => { mounted = false; };
  }, [page, load]);

  async function handleSave() {
    setFormError('');
    setSaving(true);
    const result = await createSupervisor(form);
    setSaving(false);
    if (result.error) { setFormError(result.error.message); return; }
    setModalOpen(false);
    setForm(EMPTY_FORM);
    load(page);
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto page-fade-in">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Supervisors</h1>
          <p className="text-sm text-slate-500 mt-0.5">Create supervisor accounts and link them to companies.</p>
        </div>
        <Button onClick={() => setModalOpen(true)}>+ Add Supervisor</Button>
      </div>

      <input
        type="search"
        aria-label="Search supervisors"
        value={searchText}
        onChange={e => setSearchText(e.target.value)}
        placeholder="Search by name or email..."
        className="mb-4 w-full sm:w-80 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-teal-500"
      />

      {error && <div className="mb-4"><Alert type="error" message={error} /></div>}

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20 text-slate-400 text-sm">Loading supervisors...</div>
        ) : supervisors.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400">
            <span className="text-4xl mb-3">👩‍🏫</span>
            <p className="text-sm">{search ? 'No supervisors match your search.' : 'No supervisors yet.'}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/50">
                <th className="text-left px-5 py-3.5 font-medium text-slate-500">Name</th>
                <th className="text-left px-5 py-3.5 font-medium text-slate-500">Email</th>
                <th className="text-left px-5 py-3.5 font-medium text-slate-500">Company</th>
                <th className="text-left px-5 py-3.5 font-medium text-slate-500">Position</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {supervisors.map(s => (
                <tr key={s.supervisor_id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-5 py-4 font-medium text-slate-900">{s.users?.full_name}</td>
                  <td className="px-5 py-4 text-slate-700">{s.users?.email}</td>
                  <td className="px-5 py-4 text-slate-700">{s.companies?.company_name}</td>
                  <td className="px-5 py-4 text-slate-700">{s.position}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 text-sm text-slate-500">
          <span>Page {page} of {totalPages}</span>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>Previous</Button>
            <Button variant="ghost" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>Next</Button>
          </div>
        </div>
      )}

      <SupervisorInvitesPanel />

      <Modal title="Add Supervisor" open={modalOpen} onClose={() => setModalOpen(false)}>
        <Input label="Full Name" value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} required />
        <Input label="Email" type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} required />
        <CompanyPicker value={form.company_id} onChange={(company_id) => setForm(f => ({ ...f, company_id }))} />
        <Input label="Position" value={form.position} onChange={e => setForm(f => ({ ...f, position: e.target.value }))} required />
        {formError && <Alert type="error" message={formError} />}
        <div className="flex gap-3 pt-1">
          <Button onClick={handleSave} loading={saving} className="flex-1">Create Supervisor</Button>
          <Button variant="ghost" onClick={() => setModalOpen(false)} className="flex-1">Cancel</Button>
        </div>
      </Modal>
    </div>
  );
}
