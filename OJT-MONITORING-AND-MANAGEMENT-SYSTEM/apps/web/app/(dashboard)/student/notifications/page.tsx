import { redirect } from 'next/navigation';
import { createClient } from '@/src/lib/supabase/server';
import { listAnnouncements } from '@/src/services/announcements';
import { Card, CardHeader, CardTitle, CardContent } from '@/src/components/ui/Card';
import { Badge } from '@/src/components/ui/Badge';
import { Bell, Megaphone, Calendar, Info } from '@/src/components/ui/Icons';

export default async function StudentNotificationsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/auth/sign-in');

  // Fetch student notifications & announcements concurrently
  const [
    { data: notifications },
    { data: announcements },
  ] = await Promise.all([
    supabase
      .from('notifications')
      .select('notification_id, message, notification_date, status')
      .eq('receiver_user_id', user.id)
      .order('notification_date', { ascending: false }),
    listAnnouncements(),
  ]);

  const notifList = notifications ?? [];
  const anncList = announcements ?? [];

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-5xl mx-auto page-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Notifications & Announcements</h1>
        <p className="text-sm text-slate-500 mt-1">Stay updated with official OJT updates, coordinator feedback, and system notices.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Direct Activity Notifications */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-800 flex items-center gap-2">
              <Bell className="w-4 h-4 text-teal-600" /> Activity Notifications
            </h2>
            <Badge variant="outline" className="text-xs">{notifList.length} total</Badge>
          </div>

          {notifList.length === 0 ? (
            <Card className="border-dashed border-slate-200 bg-slate-50/50">
              <CardContent className="p-8 text-center text-slate-400 text-sm">
                <Bell className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                <p>No activity notifications yet.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {notifList.map((n: any) => (
                <Card key={n.notification_id} className={`border-slate-200/80 transition-all ${n.status === 'unread' ? 'border-l-4 border-l-teal-500 bg-teal-50/20' : ''}`}>
                  <CardContent className="p-4 flex items-start gap-3.5">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${n.status === 'unread' ? 'bg-teal-100 text-teal-700' : 'bg-slate-100 text-slate-500'}`}>
                      <Info className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-slate-800 leading-snug">{n.message}</p>
                      <div className="flex items-center gap-3 mt-1.5 text-xs text-slate-400">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {new Date(n.notification_date).toLocaleDateString(undefined, {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                        {n.status === 'unread' && (
                          <Badge className="bg-teal-50 text-teal-700 border-teal-200 text-[10px] py-0">New</Badge>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* Right Column: Campus & Department Announcements */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-800 flex items-center gap-2">
              <Megaphone className="w-4 h-4 text-amber-500" /> Announcements
            </h2>
            <Badge variant="outline" className="text-xs">{anncList.length} updates</Badge>
          </div>

          {anncList.length === 0 ? (
            <Card className="border-dashed border-slate-200 bg-slate-50/50">
              <CardContent className="p-8 text-center text-slate-400 text-sm">
                <Megaphone className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                <p>No active announcements posted.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {anncList.map((annc) => (
                <Card key={annc.announcement_id} className="border-slate-200/90 shadow-sm hover:shadow transition-all">
                  <CardHeader className="p-4 pb-2">
                    <div className="flex items-center justify-between gap-2">
                      <Badge className="bg-slate-100 text-slate-700 text-[10px] py-0 border-slate-200">
                        {annc.target_department === 'All' ? 'All Departments' : annc.target_department}
                      </Badge>
                      <span className="text-[11px] text-slate-400">
                        {new Date(annc.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                      </span>
                    </div>
                    <CardTitle className="text-sm font-semibold text-slate-900 mt-1">{annc.title}</CardTitle>
                  </CardHeader>
                  <CardContent className="p-4 pt-1 text-xs text-slate-600 leading-relaxed whitespace-pre-line">
                    {annc.content}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
