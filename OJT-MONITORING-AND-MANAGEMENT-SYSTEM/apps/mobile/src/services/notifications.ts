import { supabase } from '../lib/supabase';
import { postWebBff } from '../lib/webBff';
import type { AppResult, DbAnnouncement, DbNotification } from '@ojt/shared';

export interface MobileFeedItem {
  id: string;
  type: 'announcement' | 'notification';
  title: string;
  message: string;
  date: string;
  status?: string;
}

export async function listStudentFeed(): Promise<AppResult<MobileFeedItem[]>> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { data: null, error: { code: 'UNAUTHORIZED', message: 'Not authenticated.' } };
  }

  // 1. Fetch announcements
  const { data: announcements, error: annErr } = await supabase
    .from('announcements')
    .select('announcement_id, title, content, created_at')
    .order('created_at', { ascending: false })
    .limit(20);

  // 2. Fetch personal notifications
  const { data: notifications, error: notifErr } = await supabase
    .from('notifications')
    .select('notification_id, message, notification_date, status')
    .eq('receiver_user_id', user.id)
    .order('notification_date', { ascending: false })
    .limit(20);

  if (annErr && notifErr) {
    return { data: null, error: { code: 'SERVER_FAILURE', message: 'Failed to load notifications.' } };
  }

  const feed: MobileFeedItem[] = [];

  (announcements ?? []).forEach((a) => {
    feed.push({
      id: a.announcement_id,
      type: 'announcement',
      title: a.title,
      message: a.content,
      date: a.created_at,
    });
  });

  (notifications ?? []).forEach((n) => {
    const isAlert = n.message.startsWith('🚨') || n.message.includes('[Alert]');
    const isAnnc = n.message.startsWith('📢') || n.message.includes('[Announcement]');
    feed.push({
      id: n.notification_id,
      type: isAnnc ? 'announcement' : 'notification',
      title: isAlert ? '🚨 Urgent Alert' : isAnnc ? '📢 Announcement' : 'Personal Notification',
      message: n.message,
      date: n.notification_date,
      status: n.status as 'unread' | 'read',
    });
  });

  // Sort combined feed descending by date
  feed.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return { data: feed, error: null };
}

export async function markNotificationRead(notification_id: string): Promise<AppResult<null>> {
  return postWebBff<null>('/api/mobile/notifications', { notification_id });
}
