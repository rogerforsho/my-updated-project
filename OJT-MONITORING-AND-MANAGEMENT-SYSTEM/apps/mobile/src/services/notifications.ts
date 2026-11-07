import { supabase } from '../lib/supabase';
import { postWebBff } from '../lib/webBff';
import type { AppResult } from '@ojt/shared';

export interface MobileFeedItem {
  id: string;
  type: 'announcement' | 'notification';
  title: string;
  message: string;
  date: string;
  status?: string;
  /** True for rows in the user's own notifications table: they can be marked read and archived. Global announcements cannot. */
  personal?: boolean;
}

export const FEED_PAGE_SIZE = 20;

/**
 * One page of the feed. Page 0 also carries the latest global announcements; later pages add older personal notices only.
 * `hasMore` is true when the notifications page came back full.
 */
export async function listStudentFeed(page = 0): Promise<AppResult<{ items: MobileFeedItem[]; hasMore: boolean }>> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { data: null, error: { code: 'UNAUTHORIZED', message: 'Not authenticated.' } };
  }

  const from = page * FEED_PAGE_SIZE;
  const [announcementsRes, notificationsRes] = await Promise.all([
    page === 0
      ? supabase.from('announcements').select('announcement_id, title, content, created_at')
        .order('created_at', { ascending: false }).limit(FEED_PAGE_SIZE)
      : Promise.resolve({ data: [], error: null }),
    supabase.from('notifications').select('notification_id, message, notification_date, status')
      .eq('receiver_user_id', user.id).is('archived_at', null)
      .order('notification_date', { ascending: false }).range(from, from + FEED_PAGE_SIZE - 1),
  ]);
  const { data: announcements, error: annErr } = announcementsRes;
  const { data: notifications, error: notifErr } = notificationsRes;

  if (notifErr && (annErr || page > 0)) {
    return { data: null, error: { code: 'SERVER_FAILURE', message: 'Failed to load notifications.' } };
  }

  const items: MobileFeedItem[] = [];

  (announcements ?? []).forEach((a) => {
    items.push({
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
    items.push({
      id: n.notification_id,
      type: isAnnc ? 'announcement' : 'notification',
      title: isAlert ? '🚨 Urgent Alert' : isAnnc ? '📢 Announcement' : 'Personal Notification',
      message: n.message,
      date: n.notification_date,
      status: n.status as 'unread' | 'read',
      personal: true,
    });
  });

  items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return { data: { items, hasMore: (notifications ?? []).length === FEED_PAGE_SIZE }, error: null };
}

export async function markNotificationRead(notification_id: string): Promise<AppResult<null>> {
  return postWebBff<null>('/api/mobile/notifications', { notification_id });
}

export async function markAllNotificationsRead(): Promise<AppResult<null>> {
  return postWebBff<null>('/api/mobile/notifications', { all: true });
}

export async function archiveNotification(notification_id: string): Promise<AppResult<null>> {
  return postWebBff<null>('/api/mobile/notifications', { notification_id, archive: true });
}
