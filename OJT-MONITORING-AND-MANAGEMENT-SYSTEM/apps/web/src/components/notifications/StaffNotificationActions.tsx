'use client';

import { useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { createClient } from '@/src/lib/supabase/client';

// RLS ("users_update_own_notifications") limits these updates to the signed-in user's own rows.
export function MarkAllReadButton({ userId }: { userId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  async function markAll() {
    setBusy(true);
    const { error } = await createClient().from('notifications').update({ status: 'read' })
      .eq('receiver_user_id', userId).eq('status', 'unread');
    setBusy(false);
    setFailed(Boolean(error));
    if (!error) router.refresh();
  }
  return <div className="flex items-center gap-2">
    {failed && <span role="alert" className="text-xs text-red-700">Could not update. Try again.</span>}
    <button type="button" onClick={markAll} disabled={busy} className="rounded-lg px-3 py-1.5 text-sm font-medium text-teal-800 hover:bg-teal-50 focus:outline-none focus:ring-2 focus:ring-teal-600 disabled:opacity-60">Mark all as read</button>
  </div>;
}

export function MarkReadCard({ notificationId, children }: { notificationId: string; children: ReactNode }) {
  const router = useRouter();
  async function markRead() {
    const { error } = await createClient().from('notifications').update({ status: 'read' }).eq('notification_id', notificationId);
    if (!error) router.refresh();
  }
  return <button type="button" onClick={markRead} aria-label="Mark notification as read" className="block w-full rounded-xl text-left outline-none focus:ring-2 focus:ring-teal-600">{children}</button>;
}
