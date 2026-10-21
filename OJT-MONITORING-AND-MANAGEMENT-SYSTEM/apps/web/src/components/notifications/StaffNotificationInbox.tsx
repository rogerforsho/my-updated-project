import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/src/lib/supabase/server';

const PAGE_SIZE = 50;

export default async function StaffNotificationInbox({ role, page = 1 }: { role: 'Coordinator' | 'Supervisor'; page?: number }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/auth/sign-in');
  const requestedPage = Number.isInteger(page) && page > 0 ? page : 1;
  const range = (value: number) => [(value - 1) * PAGE_SIZE, value * PAGE_SIZE - 1] as const;
  let [start, end] = range(requestedPage);
  let result = await supabase.from('notifications')
    .select('notification_id, message, notification_date, status, related_conversation_id', { count: 'exact' })
    .eq('receiver_user_id', user.id).order('notification_date', { ascending: false }).range(start, end)
    .abortSignal(AbortSignal.timeout(12000));
  if (result.error) return <section className="mx-auto w-full max-w-4xl rounded-2xl border border-red-200 bg-red-50 p-4 sm:p-6 lg:p-8" role="alert">
    <h1 className="text-lg font-semibold text-red-900">Notifications unavailable</h1>
    <p className="mt-1 text-sm text-red-800">We could not load your notifications. Refresh the page to try again.</p>
  </section>;
  const count = result.count ?? 0;
  const lastPage = Math.max(1, Math.ceil(count / PAGE_SIZE));
  const currentPage = Math.min(requestedPage, lastPage);
  if (currentPage !== requestedPage) {
    [start, end] = range(currentPage);
    result = await supabase.from('notifications')
      .select('notification_id, message, notification_date, status, related_conversation_id', { count: 'exact' })
      .eq('receiver_user_id', user.id).order('notification_date', { ascending: false }).range(start, end)
      .abortSignal(AbortSignal.timeout(12000));
  }
  if (result.error) return <section className="mx-auto w-full max-w-4xl rounded-2xl border border-red-200 bg-red-50 p-4 sm:p-6 lg:p-8" role="alert">
    <h1 className="text-lg font-semibold text-red-900">Notifications unavailable</h1>
    <p className="mt-1 text-sm text-red-800">We could not load your notifications. Refresh the page to try again.</p>
  </section>;
  const notifications = result.data ?? [];
  const chatPath = role === 'Coordinator' ? '/coordinator/messages' : '/supervisor/messages';

  return <section className="mx-auto w-full max-w-4xl p-4 sm:p-6 lg:p-8 space-y-5">
    <header><h1 className="text-2xl font-bold text-slate-900">Notifications</h1><p className="mt-1 text-sm text-slate-500">System updates for your account. Chat alerts open the related conversation.</p></header>
    {notifications.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">You have no notifications.</div> :
      <div className="space-y-3">{notifications.map((notification) => {
        const content = <div className={`rounded-xl border bg-white p-4 ${notification.status === 'unread' ? 'border-l-4 border-l-teal-600' : 'border-slate-200'}`}>
          <p className="text-sm text-slate-800">{notification.message}</p>
          <time className="mt-1 block text-xs text-slate-500" dateTime={notification.notification_date}>{new Date(notification.notification_date).toLocaleString()}</time>
          {notification.status === 'unread' && <span className="mt-2 inline-block rounded-full bg-teal-50 px-2 py-0.5 text-xs font-medium text-teal-800">Unread</span>}
        </div>;
        return notification.related_conversation_id ? <Link key={notification.notification_id} href={`${chatPath}?conversation=${notification.related_conversation_id}`} className="block rounded-xl outline-none focus:ring-2 focus:ring-teal-600">{content}</Link> : <div key={notification.notification_id}>{content}</div>;
      })}</div>}
    {count > PAGE_SIZE && <nav aria-label="Notification pages" className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3">
      {currentPage > 1 ? <Link className="text-sm font-medium text-teal-800 hover:underline" href={`?page=${currentPage - 1}`}>Previous</Link> : <span />}
      <span className="text-xs text-slate-500">Page {currentPage} of {lastPage} · {count} notifications</span>
      {currentPage < lastPage ? <Link className="text-sm font-medium text-teal-800 hover:underline" href={`?page=${currentPage + 1}`}>Next</Link> : <span />}
    </nav>}
  </section>;
}
