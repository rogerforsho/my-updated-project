'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Bell } from '@/src/components/ui/Icons';
import { createClient } from '@/src/lib/supabase/client';

export default function StaffNotificationBell({ userId, role }: { userId: string; role: 'Coordinator' | 'Supervisor' }) {
  const [unread, setUnread] = useState(0);
  const [failed, setFailed] = useState(false);
  const href = role === 'Coordinator' ? '/coordinator/notifications' : '/supervisor/notifications';

  useEffect(() => {
    const supabase = createClient();
    const loadCount = async () => {
      const { count, error } = await supabase.from('notifications').select('notification_id', { count: 'exact', head: true })
        .eq('receiver_user_id', userId).eq('status', 'unread').abortSignal(AbortSignal.timeout(12000));
      setFailed(Boolean(error));
      if (!error) setUnread(count ?? 0);
    };
    void loadCount();
    const channel = supabase.channel(`notification-bell-${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `receiver_user_id=eq.${userId}` }, () => { void loadCount(); })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [userId]);

  return <Link href={href} aria-label={failed ? 'Notifications; unread count unavailable' : `Notifications${unread ? `, ${unread} unread` : ''}`} title={failed ? 'Unread count unavailable; open notifications to retry' : 'Notifications'}
    className="relative rounded-xl p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100">
    <Bell className="h-4 w-4" />
    {failed ? <span aria-hidden="true" className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold leading-4 text-white">!</span>
      : unread > 0 && <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-amber-500 px-1 text-center text-[10px] font-bold leading-4 text-white">{unread > 99 ? '99+' : unread}</span>}
  </Link>;
}
