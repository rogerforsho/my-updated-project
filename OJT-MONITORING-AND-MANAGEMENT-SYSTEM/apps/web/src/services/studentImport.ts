'use server';

import { getCoordinator } from '@/src/lib/actor';
import { getServiceClient } from '@/src/lib/supabase/service';
import { getDepartmentByCourse } from '@/src/lib/departments';
import { defaultStudentPassword } from '@/src/lib/default-password';
import { provisionAccount, rollbackIdentities, supabaseAuthAdapter } from '@/src/lib/account-provisioning';
import { parseCsv } from '@/src/lib/csv';
import { recordAuditEvent } from '@/src/lib/audit';
import { authActionLimit } from '@/src/services/auth/internal';
import { isStudentRegistrationCourse } from '@ojt/shared';
import type { AppResult } from '@ojt/shared';

const MAX_ROWS = 500;
const MAX_CSV_CHARS = 1_000_000;
const EXPECTED_HEADER = ['full_name', 'email', 'student_number', 'course'];

export interface ImportPreviewRow {
  line: number;
  full_name: string;
  email: string;
  student_number: string;
  course: string;
  errors: string[];
}

export interface ImportPreview {
  rows: ImportPreviewRow[];
  errorCount: number;
}

async function assertCoordinator() {
  const { user, scope, authorized } = await getCoordinator();
  return authorized && user ? { user, departments: scope.departments } : null;
}

const forbidden = { code: 'FORBIDDEN' as const, message: 'Access denied.' };

async function buildPreview(csvText: string, departments: string[]): Promise<AppResult<ImportPreview>> {
  if (typeof csvText !== 'string' || !csvText.trim())
    return { data: null, error: { code: 'VALIDATION_FAILURE', message: 'The file is empty.' } };
  if (csvText.length > MAX_CSV_CHARS)
    return { data: null, error: { code: 'VALIDATION_FAILURE', message: 'The file is too large (1 MB maximum).' } };

  const [header, ...body] = parseCsv(csvText);
  if (!header || header.map(cell => cell.trim().toLowerCase()).join(',') !== EXPECTED_HEADER.join(','))
    return { data: null, error: { code: 'VALIDATION_FAILURE', message: `The first row must be: ${EXPECTED_HEADER.join(',')}` } };
  if (!body.length) return { data: null, error: { code: 'VALIDATION_FAILURE', message: 'The file has no student rows.' } };
  if (body.length > MAX_ROWS)
    return { data: null, error: { code: 'VALIDATION_FAILURE', message: `Import at most ${MAX_ROWS} students at a time.` } };

  const rows: ImportPreviewRow[] = body.map((cells, index) => {
    const [full_name = '', email = '', student_number = '', course = ''] = cells.map(cell => cell.trim());
    const errors: string[] = [];
    if (!full_name || full_name.length > 150) errors.push('Full name is required (150 characters maximum).');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) errors.push('Email is not valid.');
    if (!student_number || student_number.length > 50) errors.push('Student number is required (50 characters maximum).');
    const normalizedCourse = course.toUpperCase();
    if (!isStudentRegistrationCourse(normalizedCourse)) errors.push('Course must be BSIT, BS-CPE, BSBA-HRM or BSENTREP.');
    else if (!departments.includes(getDepartmentByCourse(normalizedCourse))) errors.push('Course is outside your department.');
    return { line: index + 2, full_name, email: email.toLowerCase(), student_number, course: normalizedCourse, errors };
  });

  const seenEmails = new Set<string>();
  const seenNumbers = new Set<string>();
  for (const row of rows) {
    if (seenEmails.has(row.email)) row.errors.push('Email appears more than once in the file.');
    if (seenNumbers.has(row.student_number.toLowerCase())) row.errors.push('Student number appears more than once in the file.');
    seenEmails.add(row.email);
    seenNumbers.add(row.student_number.toLowerCase());
  }

  const service = getServiceClient();
  const [{ data: usedEmails, error: emailError }, { data: usedNumbers, error: numberError }] = await Promise.all([
    service.from('users').select('email').in('email', rows.map(row => row.email)),
    service.from('students').select('student_number').in('student_number', rows.map(row => row.student_number)),
  ]);
  if (emailError || numberError)
    return { data: null, error: { code: 'SERVER_FAILURE', message: 'Could not check the file against existing accounts.' } };
  const takenEmails = new Set((usedEmails ?? []).map(row => String(row.email).toLowerCase()));
  const takenNumbers = new Set((usedNumbers ?? []).map(row => String(row.student_number).toLowerCase()));
  for (const row of rows) {
    if (takenEmails.has(row.email)) row.errors.push('An account with this email already exists.');
    if (takenNumbers.has(row.student_number.toLowerCase())) row.errors.push('This student number already has an account.');
  }

  return { data: { rows, errorCount: rows.filter(row => row.errors.length).length }, error: null };
}

export async function previewStudentImport(csvText: string): Promise<AppResult<ImportPreview>> {
  const actor = await assertCoordinator();
  if (!actor) return { data: null, error: forbidden };
  return buildPreview(csvText, actor.departments);
}

export async function commitStudentImport(csvText: string): Promise<AppResult<{ imported: number }>> {
  const actor = await assertCoordinator();
  if (!actor) return { data: null, error: forbidden };
  const limited = await authActionLimit('student_import', actor.user.id, 10, 3600, 'user');
  if (limited) return { data: null, error: limited };

  const built = await buildPreview(csvText, actor.departments);
  if (built.error || !built.data) return { data: null, error: built.error ?? { code: 'SERVER_FAILURE', message: 'Could not read the file.' } };
  const preview = built.data;
  if (preview.errorCount)
    return { data: null, error: { code: 'VALIDATION_FAILURE', message: 'Fix the rows with errors before importing. Nothing was imported.' } };

  const service = getServiceClient();
  const adapter = supabaseAuthAdapter(service);
  const createdIds: string[] = [];
  let failure: string | null = null;
  let leftovers = 0;
  for (const row of preview.rows) {
    // The student_import invite tells the student trigger to skip only the ID-card check.
    const result = await provisionAccount(adapter, {
      email: row.email, role: 'Student', full_name: row.full_name, inviteKind: 'student_import',
      password: defaultStudentPassword(row.student_number),
      user_metadata: { student_number: row.student_number, course: row.course, year_level: 4 },
      setup: async userId => (await service.from('users')
        .update({ account_status: 'active', must_change_password: true, full_name: row.full_name })
        .eq('user_id', userId)).error,
    });
    if (result.ok) { createdIds.push(result.userId); continue; }
    if (result.kind === 'cleanup_needed') leftovers++; // this row's own rollback failed
    failure = result.kind === 'invite_unavailable' ? `Line ${row.line}: import is not available right now.`
      : result.kind === 'setup_failed' || result.kind === 'cleanup_needed' ? `Line ${row.line}: the account could not be activated.`
      : `Line ${row.line}: the account could not be created.`;
    break;
  }

  if (failure) {
    // Auth users cannot join a database transaction, so undo the run by deleting every account it created.
    const undoFailed = await rollbackIdentities(adapter, createdIds);
    leftovers += undoFailed;
    await recordAuditEvent({
      actor_user_id: actor.user.id,
      action: 'STUDENT_IMPORT_FAILED',
      entity_type: 'user',
      details: { rows: preview.rows.length, rolled_back: createdIds.length - undoFailed, needs_cleanup: leftovers },
    });
    return { data: null, error: { code: 'SERVER_FAILURE', message: leftovers
      ? `${failure} Nothing was kept except ${leftovers} account(s) that need administrator cleanup.`
      : `${failure} Nothing was imported.` } };
  }

  await recordAuditEvent({
    actor_user_id: actor.user.id,
    action: 'STUDENT_IMPORTED',
    entity_type: 'user',
    details: { count: createdIds.length },
  });
  return { data: { imported: createdIds.length }, error: null };
}
