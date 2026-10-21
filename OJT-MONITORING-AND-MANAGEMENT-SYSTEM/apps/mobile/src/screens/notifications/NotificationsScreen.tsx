import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, FlatList, RefreshControl,
  ActivityIndicator, ScrollView, StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { listStudentFeed, markNotificationRead, type MobileFeedItem } from '../../services/notifications';

export default function NotificationsScreen() {
  const insets = useSafeAreaInsets();
  const [feed, setFeed] = useState<MobileFeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<'all' | 'announcements' | 'alerts'>('all');

  const load = useCallback(async () => {
    setError('');
    const res = await listStudentFeed();
    if (res.error) {
      setError(res.error.message);
    } else {
      setFeed(res.data || []);
    }
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = () => {
    setRefreshing(true);
    load();
  };

  const handleItemPress = async (item: MobileFeedItem) => {
    if (item.type === 'notification' && item.status === 'unread') {
      await markNotificationRead(item.id);
      setFeed(prev => prev.map(f => f.id === item.id ? { ...f, status: 'read' } : f));
    }
  };

  const handleMarkAllRead = async () => {
    const unreadAlerts = feed.filter(f => f.type === 'notification' && f.status === 'unread');
    for (const item of unreadAlerts) {
      await markNotificationRead(item.id);
    }
    setFeed(prev => prev.map(f => ({ ...f, status: 'read' })));
  };

  const filteredFeed = feed.filter(item => {
    if (filter === 'announcements') return item.type === 'announcement';
    if (filter === 'alerts') return item.type === 'notification';
    return true;
  });

  const unreadCount = feed.filter(f => f.type === 'notification' && f.status === 'unread').length;

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator size="large" color="#0A3824" />
      </View>
    );
  }

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={s.header}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View>
            <Text style={s.headerKicker}>Colegio de Montalban OJT</Text>
            <Text style={s.title}>Notices & Alerts</Text>
          </View>
          {unreadCount > 0 && (
            <TouchableOpacity onPress={handleMarkAllRead} style={s.markAllBtn} activeOpacity={0.8}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Ionicons name="checkmark-done" size={14} color="#0A3824" />
                <Text style={s.markAllText}>Mark all read</Text>
              </View>
            </TouchableOpacity>
          )}
        </View>
        <Text style={s.subtitle}>OJT Coordinator Announcements & Verification Updates</Text>

        {/* Filter Pills */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 14 }} contentContainerStyle={s.filterRow}>
          <TouchableOpacity
            onPress={() => setFilter('all')}
            style={[s.filterPill, filter === 'all' && s.filterPillActive]}
            activeOpacity={0.8}
          >
            <Text style={[s.filterText, filter === 'all' && s.filterTextActive]}>
              All ({feed.length})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setFilter('announcements')}
            style={[s.filterPill, filter === 'announcements' && s.filterPillActive]}
            activeOpacity={0.8}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Ionicons
                name="megaphone-outline"
                size={13}
                color={filter === 'announcements' ? '#E4DBC4' : '#37483C'}
              />
              <Text style={[s.filterText, filter === 'announcements' && s.filterTextActive]}>
                Announcements
              </Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setFilter('alerts')}
            style={[s.filterPill, filter === 'alerts' && s.filterPillActive]}
            activeOpacity={0.8}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Ionicons
                name="notifications-outline"
                size={13}
                color={filter === 'alerts' ? '#E4DBC4' : '#37483C'}
              />
              <Text style={[s.filterText, filter === 'alerts' && s.filterTextActive]}>
                Alerts {unreadCount > 0 ? `(${unreadCount})` : ''}
              </Text>
            </View>
          </TouchableOpacity>
        </ScrollView>
      </View>

      {!!error && (
        <View style={s.alertError}>
          <Ionicons name="alert-circle" size={18} color="#991b1b" />
          <Text style={s.alertErrorText}>{error}</Text>
          <TouchableOpacity
            onPress={() => setError('')}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel="Dismiss error"
          >
            <Ionicons name="close" size={16} color="#7f1d1d" />
          </TouchableOpacity>
        </View>
      )}

      {/* Feed List */}
      <FlatList
        data={filteredFeed}
        keyExtractor={(item) => item.id}
        contentContainerStyle={s.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#0A3824']} />}
        ListEmptyComponent={
          <View style={s.emptyBox}>
            <Ionicons name="notifications-off-outline" size={44} color="#879687" style={{ marginBottom: 8 }} />
            <Text style={s.emptyTitle}>No notifications yet</Text>
            <Text style={s.emptySub}>
              You are all caught up with your OJT coordinator and supervisor updates.
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const isAnnouncement = item.type === 'announcement';
          const isUnread = item.status === 'unread';

          return (
            <TouchableOpacity
              onPress={() => handleItemPress(item)}
              activeOpacity={0.85}
              style={[s.feedCard, isUnread && s.feedCardUnread]}
            >
              <View style={s.cardTop}>
                <View style={s.tagRow}>
                  <Ionicons
                    name={isAnnouncement ? 'megaphone' : 'notifications'}
                    size={14}
                    color="#0A3824"
                  />
                  <Text style={s.tagText}>
                    {isAnnouncement ? 'ANNOUNCEMENT' : 'DIRECT NOTICE'}
                  </Text>
                  {isUnread && <View style={s.unreadDot} />}
                </View>
                <Text style={s.dateText}>
                  {new Date(item.date).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}
                </Text>
              </View>

              <Text style={s.feedTitle}>{item.title}</Text>
              <Text style={s.feedMessage}>{item.message}</Text>
            </TouchableOpacity>
          );
        }}
      />
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F4F6F2' },
  center: { flex: 1, backgroundColor: '#F4F6F2', alignItems: 'center', justifyContent: 'center' },
  header: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 14 },
  headerKicker: { fontSize: 11, fontWeight: '800', color: '#0A3824', textTransform: 'uppercase', letterSpacing: 0.5 },
  title: { fontSize: 24, fontWeight: '900', color: '#092E1D' },
  subtitle: { fontSize: 12, color: '#526257', marginTop: 2 },
  markAllBtn: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12, backgroundColor: 'rgba(10,56,36,0.08)' },
  markAllText: { fontSize: 11, fontWeight: '700', color: '#0A3824' },
  filterRow: { flexDirection: 'row', gap: 8 },
  filterPill: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, backgroundColor: '#ffffff', borderWidth: 1.5, borderColor: '#DCE5DB' },
  filterPillActive: { backgroundColor: '#0A3824', borderColor: '#0A3824' },
  filterText: { fontSize: 12, fontWeight: '700', color: '#37483C' },
  filterTextActive: { color: '#E4DBC4' },
  alertError: { marginHorizontal: 20, backgroundColor: '#fbf2f2', borderWidth: 1, borderColor: '#f1cdcd', borderRadius: 12, padding: 12, marginBottom: 12, flexDirection: 'row', alignItems: 'center', gap: 8 },
  alertErrorText: { color: '#7f1d1d', fontSize: 13, fontWeight: '600', flex: 1 },
  listContent: { paddingHorizontal: 20, paddingBottom: 32, gap: 12 },
  feedCard: { backgroundColor: '#ffffff', borderRadius: 18, borderWidth: 1, borderColor: '#DCE5DB', padding: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 6, elevation: 1 },
  feedCardUnread: { backgroundColor: 'rgba(10,56,36,0.04)', borderColor: '#0A3824' },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  tagRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tagText: { fontSize: 11, fontWeight: '800', color: '#0A3824', letterSpacing: 0.5 },
  unreadDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#E4DBC4' },
  dateText: { fontSize: 11, color: '#879687' },
  feedTitle: { fontSize: 15, fontWeight: '800', color: '#092E1D', marginBottom: 4 },
  feedMessage: { fontSize: 13, color: '#37483C', lineHeight: 18 },
  emptyBox: { alignItems: 'center', paddingVertical: 48 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: '#37483C' },
  emptySub: { fontSize: 13, color: '#879687', textAlign: 'center', marginTop: 4, paddingHorizontal: 20 },
});
