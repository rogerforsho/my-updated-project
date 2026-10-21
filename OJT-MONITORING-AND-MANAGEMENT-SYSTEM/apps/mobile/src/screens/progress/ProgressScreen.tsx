import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  ActivityIndicator, RefreshControl, TouchableOpacity,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { getOwnStudentProgress } from '../../services/progress';
import type { StudentProgressDetail } from '../../services/progress';

export default function ProgressScreen() {
  const insets = useSafeAreaInsets();
  const [progress, setProgress] = useState<StudentProgressDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    const res = await getOwnStudentProgress();
    if (res.data) setProgress(res.data);
    else if (res.error) setError(res.error.message || 'Failed to load progress data.');
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator size="large" color="#0A3824" />
      </View>
    );
  }

  const percentage = progress?.percentage || 0;
  const status = progress?.progress_status || 'not_started';

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <ScrollView
        contentContainerStyle={s.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#0A3824']} />}
      >
        <View style={s.header}>
          <Text style={s.headerKicker}>Colegio de Montalban OJT</Text>
          <Text style={s.title}>Practicum Progress</Text>
          <Text style={s.subtitle}>Rendered Hours & Completion Breakdown</Text>
        </View>

        {!!error && (
          <View style={s.alertError}>
            <Text style={s.alertErrorText}>{error}</Text>
            <TouchableOpacity onPress={load} style={{ marginTop: 6 }}>
              <Text style={s.retryText}>TAP TO RETRY</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Main Emerald Progress Card */}
        <View style={s.progressCard}>
          <View style={s.cardTopRow}>
            <Text style={s.cardTopLabel}>OVERALL COMPLETION</Text>
            <View style={s.statusPill}>
              <Text style={s.statusPillText}>{status.replace('_', ' ')}</Text>
            </View>
          </View>

          <View style={s.percentRow}>
            <Text style={s.percentNum}>{percentage}%</Text>
            <Text style={s.percentLabel}>completed</Text>
          </View>

          {/* Progress Bar Track */}
          <View style={s.progressBarTrack}>
            <View
              style={[s.progressBarFill, { width: `${Math.max(4, Math.min(100, percentage))}%` }]}
            />
          </View>

          {/* Hours Stat Grid */}
          <View style={s.hoursGrid}>
            <View>
              <Text style={s.statLabel}>Completed</Text>
              <Text style={s.statVal}>{progress?.completed_hours || 0} hrs</Text>
            </View>
            <View>
              <Text style={s.statLabel}>Remaining</Text>
              <Text style={s.statVal}>{progress?.remaining_hours || 0} hrs</Text>
            </View>
            <View>
              <Text style={s.statLabel}>Target</Text>
              <Text style={s.statVal}>{progress?.required_hours || 486} hrs</Text>
            </View>
          </View>
        </View>

        {/* Assignment Profile Details */}
        <View style={s.profileCard}>
          <Text style={s.profileHeading}>TRAINEE & HOST COMPANY</Text>

          <View style={s.profileList}>
            <View style={s.profileRow}>
              <Text style={s.pLabel}>Student Name</Text>
              <Text style={s.pVal}>{progress?.full_name || '—'}</Text>
            </View>
            <View style={s.divider} />
            <View style={s.profileRow}>
              <Text style={s.pLabel}>Student Number</Text>
              <Text style={s.pVal}>{progress?.student_number || '—'}</Text>
            </View>
            <View style={s.divider} />
            <View style={s.profileRow}>
              <Text style={s.pLabel}>Program</Text>
              <Text style={s.pVal}>{progress?.course || '—'} (4th Year Intern)</Text>
            </View>
            <View style={s.divider} />
            <View style={s.profileRow}>
              <Text style={s.pLabel}>Host Company</Text>
              <Text style={[s.pVal, s.pValGreen]}>{progress?.company_name || 'Not yet assigned'}</Text>
            </View>
            <View style={s.divider} />
            <View style={s.profileRow}>
              <Text style={s.pLabel}>Verified Sessions</Text>
              <Text style={s.pVal}>{progress?.verified_sessions_count || 0} days</Text>
            </View>
          </View>
        </View>

        {/* Info banner */}
        <View style={s.infoBanner}>
          <Ionicons name="school-outline" size={26} color="#0A3824" />
          <View style={{ flex: 1 }}>
            <Text style={s.infoBannerTitle}>486.0 Hours Target</Text>
            <Text style={s.infoBannerSub}>
              Ensure all daily time records are signed off by your company supervisor to count toward final clearance.
            </Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F4F6F2' },
  center: { flex: 1, backgroundColor: '#F4F6F2', alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 40 },
  header: { marginBottom: 18 },
  headerKicker: { fontSize: 11, fontWeight: '800', color: '#0A3824', textTransform: 'uppercase', letterSpacing: 0.5 },
  title: { fontSize: 24, fontWeight: '900', color: '#092E1D' },
  subtitle: { fontSize: 12, color: '#526257', marginTop: 2 },
  alertError: { backgroundColor: '#fbf2f2', borderWidth: 1, borderColor: '#f1cdcd', borderRadius: 12, padding: 12, marginBottom: 16 },
  alertErrorText: { color: '#7f1d1d', fontSize: 13, fontWeight: '600' },
  retryText: { color: '#991b1b', fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
  progressCard: {
    backgroundColor: '#0A3824',
    borderRadius: 24,
    padding: 22,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
    elevation: 4,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(228,219,196,0.3)',
  },
  cardTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  cardTopLabel: { fontSize: 10, fontWeight: '800', color: '#a7f3d0', letterSpacing: 0.8 },
  statusPill: {
    backgroundColor: 'rgba(228,219,196,0.2)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(228,219,196,0.4)',
  },
  statusPillText: { fontSize: 10, fontWeight: '800', color: '#E4DBC4', textTransform: 'uppercase' },
  percentRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6, marginBottom: 16 },
  percentNum: { fontSize: 44, fontWeight: '900', color: '#E4DBC4' },
  percentLabel: { fontSize: 14, fontWeight: '700', color: '#DCE5DB' },
  progressBarTrack: { height: 10, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 5, overflow: 'hidden', marginBottom: 18 },
  progressBarFill: { height: '100%', backgroundColor: '#E4DBC4', borderRadius: 5 },
  hoursGrid: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.12)', paddingTop: 14 },
  statLabel: { fontSize: 11, color: '#879687', fontWeight: '600' },
  statVal: { fontSize: 16, fontWeight: '800', color: '#ffffff', marginTop: 2 },
  profileCard: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: '#DCE5DB',
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
  profileHeading: { fontSize: 10, fontWeight: '800', color: '#879687', letterSpacing: 0.8, marginBottom: 12 },
  profileList: { gap: 10 },
  profileRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  pLabel: { fontSize: 13, color: '#526257', fontWeight: '500' },
  pVal: { fontSize: 13, fontWeight: '700', color: '#26372D', flex: 1, textAlign: 'right' },
  pValGreen: { color: '#0A3824' },
  divider: { height: 1, backgroundColor: '#F4F6F2' },
  infoBanner: {
    backgroundColor: '#F7F9F5',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#DCE5DB',
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  infoBannerTitle: { fontSize: 13, fontWeight: '800', color: '#0A3824' },
  infoBannerSub: { fontSize: 11, color: '#526257', marginTop: 2, lineHeight: 16 },
});