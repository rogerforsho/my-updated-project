'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import Button from '@/src/components/ui/Button';
import Alert from '@/src/components/ui/Alert';
import Modal from '@/src/components/ui/Modal';
import {
  listStudentReports, submitReport
} from '@/src/services/reports';
import { STANDARD_REPORT_TYPES } from '@/src/lib/constants';
import { createPrivateDocumentUploadUrl } from '@/src/services/storage';
import { createClient } from '@/src/lib/supabase/client';
import type { DbReport } from '@ojt/shared';

const PAGE_SIZE = 20;
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

export default function StudentReportsPage() {
  const [reports, setReports] = useState<DbReport[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modalOpen, setModalOpen] = useState(false);

  // Form State
  const [reportType, setReportType] = useState('weekly_journal');
  const [remarks, setRemarks] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async (p: number) => {
    setLoading(true);
    setError('');
    const result = await listStudentReports(p, PAGE_SIZE);
    setLoading(false);
    if (result.error) { setError(result.error.message); return; }
    setReports(result.data!.reports);
    setTotal(result.data!.total);
  }, []);

  useEffect(() => {
    load(page);
  }, [page, load]);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    setFormError('');
    const file = e.target.files?.[0];
    if (!file) {
      setSelectedFile(null);
      return;
    }

    // 1. File Size Checker
    if (file.size > MAX_FILE_SIZE) {
      const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
      setFormError(`File size (${sizeMB} MB) exceeds the 10 MB limit. Please choose a smaller file.`);
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    // 2. File Format Whitelist Checker
    const validExts = ['.pdf', '.docx', '.doc', '.jpg', '.jpeg', '.png'];
    const name = file.name.toLowerCase();
    const isValid = validExts.some(ext => name.endsWith(ext));

    if (!isValid) {
      setFormError(`Invalid file format ("${file.name}"). Only PDF, Word Documents (.docx), and Images (JPG/PNG) are accepted.`);
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setSelectedFile(file);
  }

  async function handleSave() {
    setFormError('');
    if (!selectedFile) {
      setFormError('Please select an official document file to upload.');
      return;
    }

    setSaving(true);

    // Get a short-lived upload token, then send the bytes directly to Storage.
    const uploadRes = await createPrivateDocumentUploadUrl({
      file_name: selectedFile.name,
      file_size: selectedFile.size,
    });
    if (uploadRes.error || !uploadRes.data) {
      setSaving(false);
      setFormError(uploadRes.error?.message || 'Could not prepare secure document upload.');
      return;
    }

    const supabase = createClient();
    const { error: uploadError } = await supabase.storage
      .from('private-documents')
      .uploadToSignedUrl(uploadRes.data.filePath, uploadRes.data.token, selectedFile, {
        contentType: selectedFile.type || 'application/octet-stream',
        cacheControl: '3600',
      });
    if (uploadError) {
      setSaving(false);
      setFormError('Failed to upload document to secure storage. Please try again.');
      return;
    }

    // 2. Record report submission in database
    const submitRes = await submitReport({
      report_type: reportType,
      file_path: uploadRes.data.filePath,
      remarks: remarks.trim() || undefined,
    });

    setSaving(false);
    if (submitRes.error) {
      setFormError(submitRes.error.message);
      return;
    }

    setModalOpen(false);
    setSelectedFile(null);
    setRemarks('');
    setReportType('weekly_journal');
    if (fileInputRef.current) fileInputRef.current.value = '';
    load(page);
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const approvedCount = reports.filter(r => r.status === 'approved').length;

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 page-fade-in max-w-6xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Practicum Document Clearance</h1>
          <p className="text-sm text-slate-500 mt-0.5">Submit required institutional reports, journals, and clearance documents.</p>
        </div>
        <Button
          onClick={() => { setFormError(''); setSelectedFile(null); setRemarks(''); setModalOpen(true); }}
          className="bg-[#0A3824] hover:bg-[#092E1D] text-[var(--cdm-sand)] font-bold"
        >
          + Upload Requirement
        </Button>
      </div>

      {/* Document Clearance Summary Card */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-xs">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Approved Documents</p>
          <h3 className="text-2xl font-bold text-emerald-700 mt-1">{approvedCount}</h3>
          <p className="text-xs text-slate-400 mt-0.5">Officially signed off by OJT Coordinator</p>
        </div>
        <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-xs">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Total Submissions</p>
          <h3 className="text-2xl font-bold text-slate-900 mt-1">{total}</h3>
          <p className="text-xs text-slate-400 mt-0.5">Includes revisions and journals</p>
        </div>
        <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-xs">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Required Checklist</p>
          <h3 className="text-2xl font-bold text-[#0A3824] mt-1">6 Items</h3>
          <p className="text-xs text-slate-400 mt-0.5">Standard CDM practicum checklist</p>
        </div>
      </div>

      {error && <div className="mb-4"><Alert type="error" message={error} /></div>}

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20 text-slate-400 text-sm">Loading submissions...</div>
        ) : reports.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400">
            <span className="text-4xl mb-3">📄</span>
            <p className="text-sm font-semibold text-slate-600">No reports submitted yet.</p>
            <p className="text-xs text-slate-400 mt-1">Click &ldquo;+ Upload Requirement&rdquo; above to submit your first practicum document.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/50">
                <th className="text-left px-5 py-3.5 font-medium text-slate-500">Document Type</th>
                <th className="text-left px-5 py-3.5 font-medium text-slate-500">Review Status</th>
                <th className="text-left px-5 py-3.5 font-medium text-slate-500">Faculty Feedback / Remarks</th>
                <th className="text-left px-5 py-3.5 font-medium text-slate-500">Submitted Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {reports.map(r => (
                <tr key={r.report_id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-5 py-4 font-semibold text-slate-800 capitalize">
                    {r.report_type.replace(/_/g, ' ')}
                  </td>
                  <td className="px-5 py-4">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                      r.status === 'approved' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                      r.status === 'rejected' ? 'bg-rose-50 text-rose-700 border border-rose-200' :
                      'bg-amber-50 text-amber-700 border border-amber-200'
                    }`}>
                      {r.status.toUpperCase()}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-slate-600 text-xs">
                    {r.remarks ? (
                      <span className="bg-slate-50 p-1.5 rounded border border-slate-100 block max-w-sm">{r.remarks}</span>
                    ) : (
                      <span className="text-slate-400 italic">No remarks yet</span>
                    )}
                  </td>
                  <td className="px-5 py-4 text-slate-500 text-xs">
                    {new Date(r.submission_date).toLocaleDateString()}
                  </td>
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

      {/* Upload Requirement Modal with File Validation */}
      <Modal title="Submit Practicum Requirement" open={modalOpen} onClose={() => setModalOpen(false)}>
        <div className="space-y-4">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-slate-700">Official Requirement Category</label>
            <select
              value={reportType}
              onChange={e => setReportType(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-[#0A3824]"
            >
              {STANDARD_REPORT_TYPES.map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>

          {/* Secure File Picker with Format and Size Checks */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700">Document File (Max 10 MB)</label>
            <div className="border-2 border-dashed border-slate-300 rounded-xl p-4 text-center hover:border-[#0A3824] transition-colors bg-slate-50/50">
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.docx,.doc,.jpg,.jpeg,.png"
                onChange={handleFileChange}
                className="hidden"
                id="doc-file-upload"
              />
              <label htmlFor="doc-file-upload" className="cursor-pointer block space-y-1">
                <span className="text-2xl block">📁</span>
                <span className="text-xs font-bold text-[#0A3824] hover:underline block">
                  {selectedFile ? 'Change Selected File' : 'Click to Browse File'}
                </span>
                <span className="text-[11px] text-slate-400 block">
                  Accepted: PDF, Word (DOCX), Scans (JPG, PNG) • Up to 10 MB
                </span>
              </label>

              {selectedFile && (
                <div className="mt-3 p-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-center justify-between">
                  <span className="font-semibold truncate max-w-xs">📎 {selectedFile.name}</span>
                  <span className="font-mono font-bold">{(selectedFile.size / (1024 * 1024)).toFixed(2)} MB</span>
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-slate-700">Submission Notes / Remarks (Optional)</label>
            <textarea
              className="rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-[#0A3824] min-h-[70px]"
              placeholder="Add any notes for your OJT Coordinator regarding this submission..."
              value={remarks}
              onChange={e => setRemarks(e.target.value)}
            />
          </div>

          {formError && <Alert type="error" message={formError} />}

          <div className="flex gap-3 pt-2">
            <Button variant="ghost" onClick={() => setModalOpen(false)} className="flex-1">Cancel</Button>
            <Button onClick={handleSave} loading={saving} disabled={!selectedFile} className="flex-1 bg-[#0A3824] hover:bg-[#092E1D] text-[var(--cdm-sand)] font-bold">
              Upload & Submit
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
