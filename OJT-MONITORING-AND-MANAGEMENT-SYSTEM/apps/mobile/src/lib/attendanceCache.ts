import * as SecureStore from 'expo-secure-store';
import type { AuthUser } from '@ojt/shared';
import { supabase } from './supabase';

const IDENTITY_KEY = 'cdm_ojt_attendance_identity_v1';
let identityRevision = 0;
let identityWrites: Promise<void> = Promise.resolve();

export interface AttendanceIdentity {
  user: AuthUser;
  student_id: string;
}

function writeIdentity(identity: AttendanceIdentity | null): Promise<void> {
  const write = identityWrites.then(() => identity
    ? SecureStore.setItemAsync(IDENTITY_KEY, JSON.stringify(identity))
    : SecureStore.deleteItemAsync(IDENTITY_KEY));
  identityWrites = write.catch(() => {});
  return write;
}

// This cache authorizes local capture only. Synchronization must revalidate the
// signed-in user and use Supabase RLS before submitting any queued records.
export async function getCachedAttendanceIdentity(): Promise<AttendanceIdentity | null> {
  try {
    await identityWrites;
    const raw = await SecureStore.getItemAsync(IDENTITY_KEY);
    const identity = raw ? JSON.parse(raw) as AttendanceIdentity : null;
    return identity?.user?.user_id && identity.student_id &&
      identity.user.role === 'Student' && identity.user.account_status === 'active'
      ? identity : null;
  } catch {
    return null;
  }
}

export async function clearAttendanceIdentity(): Promise<void> {
  identityRevision++;
  await writeIdentity(null);
}

export async function rememberAttendanceIdentity(user: AuthUser): Promise<AttendanceIdentity | null> {
  const revision = identityRevision;
  if (user.role !== 'Student' || user.account_status !== 'active') {
    await clearAttendanceIdentity();
    return null;
  }
  const { data: student, error } = await supabase.from('students')
    .select('student_id').eq('user_id', user.user_id).single();
  if (revision !== identityRevision) return null;
  if (error || !student) {
    await clearAttendanceIdentity();
    return null;
  }
  const identity = { user, student_id: student.student_id };
  await writeIdentity(identity);
  return revision === identityRevision ? identity : null;
}

export async function getAttendanceIdentity(online: boolean): Promise<AttendanceIdentity | null> {
  if (!online) return getCachedAttendanceIdentity();
  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return null;
    const { data: profile, error } = await supabase.from('users')
      .select('user_id, full_name, email, role, account_status')
      .eq('user_id', user.id).single();
    if (error || !profile) return null;
    return await rememberAttendanceIdentity(profile as AuthUser);
  } catch {
    return null;
  }
}
