import { timingSafeEqual } from 'node:crypto';
import * as Sentry from '@sentry/nextjs';
import { getServiceClient } from '@/src/lib/supabase/service';
import { sendAccountStatusEmail, sendSupervisorWelcomeEmail } from '@/src/lib/email/send-account-status';

export const runtime = 'nodejs';
export const maxDuration = 60;

interface AccountStatusEmailPayload {
  type: 'account_status';
  to: string;
  fullName: string;
  status: 'active' | 'rejected';
  reason?: string | null;
}

interface SupervisorWelcomeEmailPayload {
  type: 'supervisor_welcome';
  to: string;
  fullName: string;
  companyName: string;
  position: string;
  employeeNumber: string;
}

type TransactionalEmailPayload = AccountStatusEmailPayload | SupervisorWelcomeEmailPayload;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isEmail(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 320 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isTransactionalEmailPayload(value: unknown): value is TransactionalEmailPayload {
  if (!isRecord(value) || !isEmail(value.to) || typeof value.fullName !== 'string' || value.fullName.length > 200)
    return false;
  if (value.type === 'account_status') {
    return (value.status === 'active' || value.status === 'rejected') &&
      (value.reason === undefined || value.reason === null || (typeof value.reason === 'string' && value.reason.length <= 1000));
  }
  if (value.type === 'supervisor_welcome') {
    return typeof value.companyName === 'string' && value.companyName.length <= 200 &&
      typeof value.position === 'string' && value.position.length <= 120 &&
      typeof value.employeeNumber === 'string' && value.employeeNumber.length <= 50;
  }
  return false;
}

function containsPasswordResetCode(value: unknown): boolean {
  return isRecord(value) && ('otp' in value || value.type === 'password_reset');
}

function sameSecret(provided: string, expected: string): boolean {
  const left = Buffer.from(provided);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

function reportWorkerIssue(message: string) {
  console.error(`[transactional-email-worker] ${message}`);
  Sentry.captureMessage(`[transactional-email-worker] ${message}`, 'error');
}

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return Response.json({ error: 'Worker is not configured.' }, { status: 503 });
  if (!sameSecret(request.headers.get('authorization') || '', `Bearer ${secret}`))
    return Response.json({ error: 'Unauthorized.' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });

  const service = getServiceClient();
  const { data: messages, error } = await service.rpc('read_transactional_email_queue', { p_batch_size: 3 });
  if (error) {
    reportWorkerIssue('queue read failed');
    return Response.json({ error: 'Queue is temporarily unavailable.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }

  let sent = 0;
  let retried = 0;
  let archived = 0;
  let discarded = 0;
  for (const entry of messages ?? []) {
    const messageId = Number(entry.msg_id);
    if (!Number.isSafeInteger(messageId) || messageId <= 0) {
      reportWorkerIssue('received an invalid queue message id');
      continue;
    }

    const payload: unknown = entry.message;
    const deleteMessage = async () => service.rpc('delete_transactional_email', { p_msg_id: messageId });
    if (Number(entry.read_ct) > 5) {
      if (containsPasswordResetCode(payload)) {
        const { error: deleteError } = await deleteMessage();
        if (deleteError) {
          retried++;
          reportWorkerIssue('exhausted reset message could not be discarded');
        } else discarded++;
      } else {
        const { error: archiveError } = await service.rpc('archive_transactional_email', { p_msg_id: messageId });
        if (archiveError) {
          retried++;
          reportWorkerIssue('exhausted message could not be archived');
        } else archived++;
      }
      continue;
    }

    if (!isTransactionalEmailPayload(payload)) {
      const { error: deleteError } = await deleteMessage();
      if (deleteError) {
        retried++;
        reportWorkerIssue('invalid message could not be discarded');
      } else discarded++;
      continue;
    }

    const idempotencyKey = `transactional-email/${messageId}`;
    const delivery = payload.type === 'account_status'
      ? await sendAccountStatusEmail({
          to: payload.to,
          fullName: payload.fullName,
          status: payload.status,
          reason: payload.reason || undefined,
          idempotencyKey,
        })
      : await sendSupervisorWelcomeEmail({ ...payload, idempotencyKey });
    if (!delivery.success) {
      retried++;
      continue;
    }

    const { error: deleteError } = await deleteMessage();
    if (deleteError) {
      // A provider retry with the same idempotency key is safe after an ack timeout.
      retried++;
      reportWorkerIssue('sent message acknowledgement failed');
      continue;
    }
    sent++;
  }

  return Response.json({ sent, retried, archived, discarded }, { status: 200, headers: { 'Cache-Control': 'no-store' } });
}
