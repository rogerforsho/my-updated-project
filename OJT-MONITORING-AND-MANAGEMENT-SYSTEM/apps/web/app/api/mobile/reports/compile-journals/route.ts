import crypto from 'node:crypto';
import { mobileBffFailure, mobileBffPreamble } from '@/src/lib/mobile-bff';
import { getServiceClient } from '@/src/lib/supabase/service';
import { toPublicSupabaseUrl } from '@/src/lib/supabase/public-url';
import { recordAuditEvent } from '@/src/lib/audit';
import { mergePdfs, type MergeSource } from '@/src/lib/mergePdfs';
import { FINAL_REPORT_MAX_BYTES, WEEKLY_JOURNAL_TYPE } from '@ojt/shared';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * Builds a draft Final Report: every Weekly Journal the student uploaded, merged into one PDF.
 * Nothing is submitted. The student opens the draft, then submits it as the Final Report
 * (POST /api/mobile/reports) or uploads their own completed version instead.
 */
export async function POST(request: Request) {
  const pre = await mobileBffPreamble(request, {
    beforeLimit: async (actor) => {
      const { data: completion, error } = await actor.supabase.from('certificates')
        .select('certificate_id').eq('student_id', actor.studentId).maybeSingle();
      if (error) return mobileBffFailure({ status: 503, code: 'SERVER_FAILURE', message: 'Could not check OJT completion.' });
      if (completion) return mobileBffFailure({ status: 409, code: 'FORBIDDEN', message: 'Your OJT is completed. Academic records are read-only.' });
      return null;
    },
    limit: { action: 'report_submit', max: 10, windowSeconds: 3600 },
  });
  if (pre.response) return pre.response;
  const { actor } = pre;
  const db = getServiceClient();
  const fail = (status: number, code: string, message: string) => mobileBffFailure({ status, code, message });

  const { data: progress, error: progressError } = await db.from('internship_progress')
    .select('progress_status, completed_hours').eq('student_id', actor.studentId).maybeSingle();
  if (progressError) return fail(503, 'SERVER_FAILURE', 'Could not check your progress.');
  if (progress?.progress_status !== 'completed')
    return fail(409, 'FORBIDDEN', 'You can build your Final Report after you complete your Required Hours.');

  // Every journal counts, approved or not: some students miss Supervisor approvals. Pre-rename rows are covered too.
  const { data: journals, error: journalsError } = await db.from('reports')
    .select('file_path, submission_date, supervisor_decision').eq('student_id', actor.studentId)
    .in('report_type', [WEEKLY_JOURNAL_TYPE, 'Weekly Progress'])
    .order('submission_date', { ascending: true });
  if (journalsError) return fail(503, 'SERVER_FAILURE', 'Could not load your journals.');
  if (!journals?.length) return fail(400, 'VALIDATION_FAILURE', 'You have no Weekly Journals to build your Final Report from yet.');

  const sources: MergeSource[] = [];
  const notIncluded: string[] = [];
  let totalBytes = 0;
  for (const [index, journal] of journals.entries()) {
    const status = journal.supervisor_decision === 'approved' ? 'approved'
      : journal.supervisor_decision === 'returned' ? 'returned' : 'waiting for Supervisor';
    const name = `Journal ${index + 1} (submitted ${String(journal.submission_date).slice(0, 10)}, ${status})`;
    // Older rows may hold a link or a DOCX/photo; only stored PDFs can be merged.
    if (!/\.pdf$/i.test(journal.file_path) || /^https?:/i.test(journal.file_path)) { notIncluded.push(name); continue; }
    const { data: file, error } = await db.storage.from('private-documents').download(journal.file_path);
    if (error || !file) { notIncluded.push(name); continue; }
    totalBytes += file.size;
    if (totalBytes > FINAL_REPORT_MAX_BYTES)
      return fail(413, 'VALIDATION_FAILURE', 'Your journals are too large to merge into one file. Ask your OJT Coordinator for help.');
    sources.push({ name, bytes: new Uint8Array(await file.arrayBuffer()) });
  }
  if (!sources.length) return fail(400, 'VALIDATION_FAILURE', 'None of your journals are PDF files, so nothing could be merged.');

  const [{ data: student }, { data: assignment }] = await Promise.all([
    db.from('students').select('course, users(full_name)').eq('student_id', actor.studentId).maybeSingle(),
    db.from('student_assignments').select('start_date, end_date, companies(company_name)')
      .eq('student_id', actor.studentId).order('start_date', { ascending: false }).limit(1).maybeSingle(),
  ]);
  const studentRow = student as { course?: string; users?: { full_name?: string } | null } | null;
  const assignmentRow = assignment as { start_date?: string; end_date?: string | null; companies?: { company_name?: string } | null } | null;

  const merged = await mergePdfs({
    title: 'Final Report: Compiled Weekly Journals',
    details: [
      `Student: ${studentRow?.users?.full_name ?? 'Unknown'}`,
      `Program: ${studentRow?.course ?? 'Unknown'}`,
      `Host Training Establishment: ${assignmentRow?.companies?.company_name ?? 'Unknown'}`,
      `Training dates: ${assignmentRow?.start_date ?? '?'} to ${assignmentRow?.end_date ?? '?'}`,
      `Credited hours: ${progress.completed_hours ?? '?'}`,
      `Compiled on: ${new Date().toISOString().slice(0, 10)}`,
    ],
  }, sources);
  if (!merged.included.length) return fail(400, 'VALIDATION_FAILURE', 'None of your journals could be read. They may be password protected.');
  const allSkipped = [...notIncluded, ...merged.skipped];

  // shortcut: a draft the student never submits stays in storage; add a cleanup job if storage grows.
  const filePath = `${actor.user.id}/reports/${crypto.randomUUID()}.pdf`;
  const { error: uploadError } = await db.storage.from('private-documents')
    .upload(filePath, merged.bytes, { contentType: 'application/pdf', upsert: false });
  if (uploadError) return fail(503, 'SERVER_FAILURE', 'Could not store the draft PDF.');

  const { data: signed } = await db.storage.from('private-documents').createSignedUrl(filePath, 300);
  await recordAuditEvent({
    actor_user_id: actor.user.id,
    action: 'REPORT_FINAL_DRAFT_BUILT',
    entity_type: 'student',
    entity_id: actor.studentId,
    details: { included: merged.included.length, skipped: allSkipped.length, pages: merged.pageCount, client: 'mobile' },
  });
  return Response.json({
    data: {
      file_path: filePath,
      signedUrl: signed?.signedUrl ? toPublicSupabaseUrl(signed.signedUrl) : null,
      included: merged.included.length,
      notIncluded: allSkipped,
    },
    error: null,
  }, { status: 200, headers: { 'Cache-Control': 'no-store' } });
}
