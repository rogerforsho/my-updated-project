import { getTrustedActor } from '@/src/lib/trusted-actor';
import { getServiceClient } from '@/src/lib/supabase/service';
import { readLimitedJson } from '@/src/lib/read-limited-json';
import { recordAuditEvent } from '@/src/lib/audit';
import { toCsv } from '@/src/lib/csv';
import { zipStore, type ZipEntry } from '@/src/lib/zip';
import { authActionLimit } from '@/src/services/auth/internal';

export const runtime = 'nodejs';

const MAX_TRAINEES = 25;
const MAX_FILES = 400;
const MAX_BYTES = 100 * 1024 * 1024;
const MAX_RANGE_DAYS = 366;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const json = (status: number, message: string) =>
  Response.json({ error: message }, { status, headers: { 'Cache-Control': 'no-store' } });
const safe = (v: string) => v.replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'file';
const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? v[0] : v) ?? null;

/**
 * One ZIP for a Supervisor: for each selected trainee, their submitted report files and an attendance CSV
 * for the chosen dates. Only the Supervisor's own assigned trainees can be packed.
 */
export async function POST(request: Request) {
  // Cookie-authenticated POST: refuse requests that come from another site.
  const origin = request.headers.get('origin');
  if (origin && new URL(origin).host !== request.headers.get('host')) return json(403, 'Access denied.');

  const { supabase, user, profile } = await getTrustedActor();
  if (!user || profile?.role !== 'Supervisor') return json(403, 'Access denied.');

  const limited = await authActionLimit('report_upload', user.id, 10, 3600, 'user');
  if (limited) return json(limited.code === 'RATE_LIMITED' ? 429 : 503, limited.message);

  const parsed = await readLimitedJson(request, 8 * 1024);
  const body = parsed.data as { student_ids?: unknown; from?: unknown; to?: unknown } | null;
  if (parsed.error || !body || typeof body !== 'object') return json(400, 'The request could not be read.');
  const { student_ids, from, to } = body;
  if (!Array.isArray(student_ids) || student_ids.length < 1 || student_ids.length > MAX_TRAINEES || !student_ids.every((i) => typeof i === 'string' && UUID.test(i)))
    return json(400, `Select 1 to ${MAX_TRAINEES} trainees.`);
  if (typeof from !== 'string' || typeof to !== 'string' || !DATE.test(from) || !DATE.test(to) || from > to ||
      (Date.parse(to) - Date.parse(from)) / 86_400_000 > MAX_RANGE_DAYS)
    return json(400, 'Choose a date range of up to one year.');
  const ids = [...new Set(student_ids as string[])];

  const { data: supervisorId } = await supabase.rpc('get_my_supervisor_id');
  if (!supervisorId) return json(403, 'Access denied.');
  const db = getServiceClient();

  const { data: owned } = await db.from('student_assignments').select('student_id').eq('supervisor_id', supervisorId).in('student_id', ids);
  if (new Set((owned ?? []).map((o) => o.student_id)).size !== ids.length) return json(403, 'Some selected trainees are not assigned to you.');

  const { data: students } = await db.from('students').select('student_id, user_id, student_number, users(full_name)').in('student_id', ids);
  // Reports through the Supervisor's own session so row security decides which report types they may see.
  const { data: reports, error: reportError } = await supabase.from('reports')
    .select('student_id, report_type, file_path, status, submission_date')
    .in('student_id', ids).gte('submission_date', `${from}T00:00:00`).lte('submission_date', `${to}T23:59:59.999`)
    .order('submission_date').limit(2000);
  const { data: attendance, error: attendanceError } = await db.from('attendance')
    .select('student_id, attendance_date, time_in, time_out, credited_hours, late_status, verification_status, time_in_location_status, time_out_location_status')
    .in('student_id', ids).gte('attendance_date', from).lte('attendance_date', to).order('attendance_date').limit(20000);
  if (reportError || attendanceError || !students) return json(500, 'Could not collect the records.');

  const entries: ZipEntry[] = [];
  const notes: string[] = [];
  let bytes = 0;
  let files = 0;
  const enc = new TextEncoder();
  const add = (name: string, data: Uint8Array) => { entries.push({ name, data }); bytes += data.length; };

  for (const s of students) {
    const folder = `${safe(s.student_number)}_${safe(one(one(s.users as { full_name: string } | { full_name: string }[] | null))?.full_name ?? 'student')}`;
    const rows = (attendance ?? []).filter((a) => a.student_id === s.student_id);
    add(`${folder}/attendance_${from}_to_${to}.csv`, enc.encode(toCsv(
      ['Date', 'Time in', 'Time out', 'Credited hours', 'Late status', 'Verification', 'Time-in location', 'Time-out location'],
      rows.map((r) => [r.attendance_date, r.time_in, r.time_out, r.credited_hours, r.late_status, r.verification_status, r.time_in_location_status, r.time_out_location_status]),
    )));

    let n = 0;
    for (const r of (reports ?? []).filter((x) => x.student_id === s.student_id)) {
      n++;
      // Same ownership rule as getSignedDocumentUrl: the file must sit under this student's own folder.
      if (!(r.file_path.startsWith(`${s.user_id}/`) || r.file_path.startsWith(`${s.student_id}/`))) { notes.push(`${folder}: skipped a file outside the student's folder`); continue; }
      if (++files > MAX_FILES) return json(413, `Too many files for one pack. Select fewer trainees or a shorter date range.`);
      const { data: blob, error } = await db.storage.from('private-documents').download(r.file_path);
      if (error || !blob) { notes.push(`${folder}: ${r.report_type} of ${String(r.submission_date).slice(0, 10)} could not be read`); continue; }
      const data = new Uint8Array(await blob.arrayBuffer());
      if (bytes + data.length > MAX_BYTES) return json(413, 'The pack is too large. Select fewer trainees or a shorter date range.');
      const ext = r.file_path.match(/\.[A-Za-z0-9]{1,5}$/)?.[0] ?? '';
      add(`${folder}/reports/${String(r.submission_date).slice(0, 10)}_${safe(r.report_type)}_${n}${ext}`, data);
    }
  }
  if (notes.length) add('NOTES.txt', enc.encode(`Some items were left out:\r\n${notes.join('\r\n')}\r\n`));

  await recordAuditEvent({ actor_user_id: user.id, action: 'SUPERVISOR_PACK_DOWNLOADED', entity_type: 'student', details: { trainees: ids.length, files: files, from, to } });
  const zip = zipStore(entries);
  return new Response(zip as unknown as BodyInit, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="trainee-pack_${from}_to_${to}.zip"`,
      'Content-Length': String(zip.length),
      'Cache-Control': 'no-store',
    },
  });
}
