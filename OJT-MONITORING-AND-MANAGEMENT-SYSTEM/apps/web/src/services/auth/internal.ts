import 'server-only';
import { headers } from 'next/headers';
import { isIP } from 'node:net';
import crypto from 'crypto';
import { getServiceClient } from '@/src/lib/supabase/service';
import type { AppError } from '@ojt/shared';

let cachedServiceClient: ReturnType<typeof getServiceClient> | null = null;
export function serviceClient() {
  if (!cachedServiceClient) cachedServiceClient = getServiceClient();
  return cachedServiceClient;
}
export type AuthAction = 'login' | 'register' | 'password_reset_request' | 'password_reset_verify' | 'id_card_upload' |
  'report_upload' | 'report_submit' | 'attendance_submit' | 'selfie_upload';

export function auditSubjectHash(value: string): string | undefined {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) return undefined;
  return crypto.createHmac('sha256', secret).update(value.trim().toLowerCase()).digest('hex');
}

async function claimActionLimit(action: AuthAction, secret: string, subject: string, maxAttempts: number, windowSeconds: number): Promise<boolean | null> {
  const subjectHash = crypto.createHmac('sha256', secret).update(subject).digest('hex');
  const { data, error } = await serviceClient().rpc('claim_auth_rate_limit', {
    p_action: action, p_subject_hash: subjectHash, p_max_attempts: maxAttempts, p_window_seconds: windowSeconds,
  });
  if (error) return null;
  return data === true;
}

export async function authActionLimit(
  action: AuthAction,
  subject: string,
  maxAttempts: number,
  windowSeconds: number,
  subjectType: 'email' | 'user' = 'email'
): Promise<AppError | null> {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) return { code: 'SERVER_FAILURE', message: 'Authentication service is not configured.' };

  const normalizedSubject = subjectType === 'email' ? subject.trim().toLowerCase() : subject.trim();
  const subjectAllowed = await claimActionLimit(action, secret, `${subjectType}:${normalizedSubject}`, maxAttempts, windowSeconds);
  if (subjectAllowed === null) {
    console.error('[authActionLimit] subject limit unavailable');
    return { code: 'SERVER_FAILURE', message: 'Authentication service is temporarily unavailable.' };
  }
  if (!subjectAllowed) return { code: 'RATE_LIMITED', message: 'Too many attempts. Please wait before trying again.' };

  let clientIp: string | null = null;
  try {
    const forwardedFor = (await headers()).get('x-forwarded-for');
    const candidate = forwardedFor?.split(',')[0]?.trim();
    if (candidate && isIP(candidate)) clientIp = candidate;
  } catch { /* Unit tests and local non-request callers have no request headers. */ }
  if (!clientIp && process.env.NODE_ENV === 'production') {
    console.error('[authActionLimit] trusted client IP unavailable');
    return { code: 'SERVER_FAILURE', message: 'Authentication service is temporarily unavailable.' };
  }
  const ipBudgets: Record<AuthAction, { max: number; seconds: number }> = {
    login: { max: 100, seconds: 900 },
    register: { max: 100, seconds: 3600 },
    password_reset_request: { max: 40, seconds: 900 },
    password_reset_verify: { max: 100, seconds: 900 },
    id_card_upload: { max: 100, seconds: 3600 },
    report_upload: { max: 100, seconds: 3600 },
    report_submit: { max: 100, seconds: 3600 },
    attendance_submit: { max: 100, seconds: 3600 },
    selfie_upload: { max: 100, seconds: 3600 },
  };
  const budget = ipBudgets[action];
  const ipAllowed = await claimActionLimit(action, secret, 'ip:' + (clientIp || 'local-development'), budget.max, budget.seconds);
  if (ipAllowed === null) {
    console.error('[authActionLimit] network limit unavailable');
    return { code: 'SERVER_FAILURE', message: 'Authentication service is temporarily unavailable.' };
  }
  return ipAllowed ? null : { code: 'RATE_LIMITED', message: 'Too many attempts from this network. Please wait before trying again.' };
}
