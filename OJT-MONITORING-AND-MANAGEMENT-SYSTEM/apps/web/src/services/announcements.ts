'use server';

import { getTrustedActor } from '@/src/lib/trusted-actor';

import { getServiceClient } from '@/src/lib/supabase/service';
import type { AppResult, DbAnnouncement } from '@ojt/shared';
import { isICSCourse, isIBECourse } from '@/src/lib/departments';
import { departmentScope } from '@/src/lib/department-scope';

const serviceClient = getServiceClient;



export interface AnnouncementInput {
  title: string;
  content: string;
  target_role?: string;
  target_department?: string;
  delivery_type?: 'announcement' | 'alert';
  dispatch_alert?: boolean;
}

export async function listAnnouncements(): Promise<AppResult<DbAnnouncement[]>> {
  const { supabase, user, profile } = await getTrustedActor();
  if (!user || profile?.account_status !== 'active')
    return { data: null, error: { code: 'FORBIDDEN', message: 'Access denied.' } };

  const { data, error } = await supabase
    .from('announcements')
    .select('announcement_id, author_user_id, title, content, target_role, target_department, created_at')
    .order('created_at', { ascending: false });

  if (error)
    return { data: null, error: { code: 'SERVER_FAILURE', message: 'Failed to load announcements.' } };

  return { data: (data ?? []) as DbAnnouncement[], error: null };
}

export async function createAnnouncement(input: AnnouncementInput): Promise<AppResult<DbAnnouncement>> {
  if (!input.title?.trim())
    return { data: null, error: { code: 'VALIDATION_FAILURE', message: 'Title is required.' } };
  if (!input.content?.trim())
    return { data: null, error: { code: 'VALIDATION_FAILURE', message: 'Content is required.' } };

  const { supabase, user, profile } = await getTrustedActor();
  if (!user || !['Coordinator', 'Admin'].includes(profile?.role ?? '') || profile?.account_status !== 'active')
    return { data: null, error: { code: 'FORBIDDEN', message: 'Access denied.' } };

  const targetRole = input.target_role?.trim() || 'All';
  let targetDept = input.target_department?.trim() || 'All';
  if (profile.role === 'Coordinator') {
    const scope = await departmentScope(supabase, user.id, profile.role);
    if (scope.error || (targetDept !== 'All' && !scope.departments.includes(targetDept)))
      return { data: null, error: { code: 'FORBIDDEN', message: 'Announcement is outside your department.' } };
    if (targetDept === 'All' && !scope.department)
      return { data: null, error: { code: 'VALIDATION_FAILURE', message: 'Select a department for this announcement.' } };
    targetDept = targetDept === 'All' ? scope.department! : targetDept;
  }

  // Writes use the service role (table write grant removed in migration 033); role, MFA and department were checked above.
  const service = serviceClient();
  const { data, error } = await service
    .from('announcements')
    .insert({
      author_user_id: user.id,
      title: input.title.trim(),
      content: input.content.trim(),
      target_role: targetRole,
      target_department: targetDept,
    })
    .select()
    .single();

  if (error)
    return { data: null, error: { code: 'SERVER_FAILURE', message: 'Failed to publish announcement.' } };

  // Fan out notification alerts to active recipients with the selected symbol/mode
  try {
    const isUrgent = input.delivery_type === 'alert' || input.dispatch_alert === true;
    const prefix = isUrgent ? '🚨 [Alert]' : '📢 [Announcement]';

    let usersQuery = service.from('users').select('user_id, role').eq('account_status', 'active');
    if (targetRole !== 'All') {
      usersQuery = usersQuery.eq('role', targetRole);
    }
    const { data: targetUsers, error: usersErr } = await usersQuery;
    if (usersErr) {
      console.error('[createAnnouncement] Error fetching target users:', usersErr);
    }

    if (targetUsers && targetUsers.length > 0) {
      let recipientUserIds: string[] = [];

      if (targetDept === 'All') {
        recipientUserIds = targetUsers.map((u) => u.user_id);
      } else {
        const [{ data: students }, { data: staffGrants }] = await Promise.all([
          service.from('students').select('user_id, course'),
          service.from('staff_capability_grants').select('user_id, department_scope')
            .eq('capability', 'academic_workflows').is('revoked_at', null),
        ]);

        const deptUserIds = new Set<string>();
        (students ?? []).forEach((s) => {
          if (targetDept === 'ICS' && isICSCourse(s.course)) deptUserIds.add(s.user_id);
          if (targetDept === 'IBE' && isIBECourse(s.course)) deptUserIds.add(s.user_id);
        });
        (staffGrants ?? []).forEach((grant) => {
          if (grant.department_scope === targetDept) deptUserIds.add(grant.user_id);
        });

        recipientUserIds = targetUsers
          .filter((u) => u.role === 'Admin' || deptUserIds.has(u.user_id))
          .map((u) => u.user_id);
      }

      if (recipientUserIds.length > 0) {
        const notifPayload = recipientUserIds.map((uid) => ({
          receiver_user_id: uid,
          message: `${prefix} ${input.title.trim()}: ${input.content.trim().slice(0, 100)}${input.content.length > 100 ? '...' : ''}`,
          notification_date: new Date().toISOString(),
          status: 'unread',
        }));
        const { error: notifErr } = await service.from('notifications').insert(notifPayload);
        if (notifErr) {
          console.error('[createAnnouncement] Error inserting notifications:', notifErr);
        }
      }
    }
  } catch (dispatchError) {
    console.error('[createAnnouncement] Exception during notification dispatch:', dispatchError);
  }

  return { data: data as DbAnnouncement, error: null };
}

export async function deleteAnnouncement(announcement_id: string): Promise<AppResult<null>> {
  if (!announcement_id)
    return { data: null, error: { code: 'VALIDATION_FAILURE', message: 'Announcement ID is required.' } };

  const { supabase, user, profile } = await getTrustedActor();
  if (!user || !['Coordinator', 'Admin'].includes(profile?.role ?? '') || profile?.account_status !== 'active')
    return { data: null, error: { code: 'FORBIDDEN', message: 'Access denied.' } };

  const service = serviceClient();
  if (profile.role === 'Coordinator') {
    const { data: target } = await service.from('announcements').select('target_department').eq('announcement_id', announcement_id).maybeSingle();
    const scope = await departmentScope(supabase, user.id, profile.role);
    if (!target || scope.error || !scope.departments.includes(target.target_department))
      return { data: null, error: { code: 'FORBIDDEN', message: 'Announcement is outside your department.' } };
  }
  const { error } = await service
    .from('announcements')
    .delete()
    .eq('announcement_id', announcement_id);

  if (error)
    return { data: null, error: { code: 'SERVER_FAILURE', message: 'Failed to delete announcement.' } };

  return { data: null, error: null };
}
