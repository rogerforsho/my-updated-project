'use client';

import { useState } from 'react';
import Alert from '@/src/components/ui/Alert';
import Button from '@/src/components/ui/Button';
import { previewStudentImport, commitStudentImport } from '@/src/services/studentImport';
import type { ImportPreview } from '@/src/services/studentImport';

const MAX_FILE_BYTES = 1_000_000;

export default function CoordinatorImportPage() {
  const [csvText, setCsvText] = useState('');
  const [fileName, setFileName] = useState('');
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  async function onFile(file: File | undefined) {
    setPreview(null);
    setError('');
    setSuccess('');
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) return setError('The file is too large (1 MB maximum).');
    const text = await file.text();
    setCsvText(text);
    setFileName(file.name);
    setBusy(true);
    try {
      const result = await previewStudentImport(text);
      if (result.error) setError(result.error.message);
      else setPreview(result.data);
    } catch {
      setError('Failed to check the file.');
    }
    setBusy(false);
  }

  async function onImport() {
    setBusy(true);
    setError('');
    try {
      const result = await commitStudentImport(csvText);
      if (result.error) setError(result.error.message);
      else {
        setSuccess(`Imported ${result.data?.imported ?? 0} students. They must choose a new password at first sign-in.`);
        setPreview(null);
        setCsvText('');
        setFileName('');
      }
    } catch {
      setError('Failed to import the students.');
    }
    setBusy(false);
  }

  const canImport = !!preview && preview.errorCount === 0 && preview.rows.length > 0 && !busy;

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto page-fade-in">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight">Import Students</h1>
        <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
          Upload a CSV with the columns <code>full_name,email,student_number,course</code>. Courses: BSIT, BS-CPE, BSBA-HRM, BSENTREP.
          Each student starts with their student number as the password (prefixed with &quot;cdm-&quot; if shorter than 8 characters)
          and must change it at first sign-in. If any row has an error, nothing is imported.
        </p>
      </div>

      {error && <Alert type="error" message={error} />}
      {success && <Alert type="success" message={success} />}

      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs p-5 space-y-4">
        <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
          CSV file
          <input
            type="file"
            accept=".csv,text/csv"
            disabled={busy}
            onChange={(e) => { void onFile(e.target.files?.[0]); e.target.value = ''; }}
            className="mt-1 block w-full text-sm"
          />
        </label>
        {fileName && <p className="text-xs text-slate-500 dark:text-slate-400">Selected: {fileName}</p>}
        {preview && (
          <p className="text-xs text-slate-600 dark:text-slate-300">
            {preview.rows.length} rows, {preview.errorCount} with errors.
          </p>
        )}
        <Button onClick={onImport} disabled={!canImport} loading={busy && !!preview}>
          {preview ? `Import ${preview.rows.length} students` : 'Import students'}
        </Button>
      </div>

      {preview && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs overflow-x-auto">
          <table className="w-full text-left text-xs sm:text-sm">
            <thead className="border-b border-slate-100 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/60 text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              <tr>
                <th className="px-4 py-3">Line</th>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Student no.</th>
                <th className="px-4 py-3">Course</th>
                <th className="px-4 py-3">Problems</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {preview.rows.map((row) => (
                <tr key={row.line} className={row.errors.length ? 'bg-red-50/60 dark:bg-red-950/20' : ''}>
                  <td className="px-4 py-3 text-slate-500">{row.line}</td>
                  <td className="px-4 py-3 text-slate-900 dark:text-white">{row.full_name}</td>
                  <td className="px-4 py-3 font-mono text-xs">{row.email}</td>
                  <td className="px-4 py-3 font-mono text-xs">{row.student_number}</td>
                  <td className="px-4 py-3">{row.course}</td>
                  <td className="px-4 py-3 text-red-700 dark:text-red-300">{row.errors.join(' ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
