import * as Network from 'expo-network';
import * as SecureStore from 'expo-secure-store';
import { getCachedAttendanceIdentity } from '../../lib/attendanceCache';
import { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, ActivityIndicator,
  ScrollView, StyleSheet, FlatList, RefreshControl, TextInput, Modal, useWindowDimensions,
} from 'react-native';
import { FaceCamera, useCameraPermissions, useFaceCamera, useFaceValidation, type FaceRequirements } from '@rbayuokt/expo-face-vision';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import {
  recordTimeIn,
  recordTimeOut,
  getTodayAttendance,
  fetchOwnAttendance,
  getActiveAssignment,
  type LocationPayload,
  type CachedCompanyAssignment,
} from '../../services/attendance';
import { listStudentReports } from '../../services/reports';
import { getCurrentCoordinates } from '../../services/location';
import { syncPendingOfflineAttendance, isNetworkAvailable } from '../../lib/syncEngine';
import { getOfflineQueue } from '../../lib/offlineQueue';
import { optimizeSelfie } from '../../lib/imageOptimizer';
import { isWithinGeofence } from '@ojt/shared';
import NetworkToast from '../../components/NetworkToast';
import ScheduleProposalModal from '../../components/ScheduleProposalModal';
import { fetchStudentScheduleProposal } from '../../services/schedule';
import type { DbAttendance, DbPracticumSchedule } from '@ojt/shared';
import type { StudentTabParamList } from '../../navigation/types';

type Step = 'idle' | 'selfie' | 'submitting';
type SubTab = 'check_in' | 'history';

const SELFIE_REQUIREMENTS: FaceRequirements = {
  singleFace: true,
  guide: { width: 0.56, height: 0.36, centerY: 0.5 },
};

// Tell the student exactly what the face check is waiting for, not one generic hint.
const FACE_HINTS: Record<string, string> = {
  NO_FACE: 'No face found. Look straight at the front camera.',
  MULTIPLE_FACES: 'Only one face may be in the frame.',
  FACE_TOO_SMALL: 'Move closer to the camera.',
  MOVE_CLOSER: 'Move closer to the camera.',
  FACE_TOO_LARGE: 'Move farther from the camera.',
  MOVE_FARTHER: 'Move farther from the camera.',
  MOVE_LEFT: 'Move a little to the left.',
  MOVE_RIGHT: 'Move a little to the right.',
  MOVE_UP: 'Move the phone up a little.',
  MOVE_DOWN: 'Move the phone down a little.',
  LOOK_FORWARD: 'Look straight at the camera.',
  LOOK_LEFT: 'Look straight at the camera.',
  LOOK_RIGHT: 'Look straight at the camera.',
  OPEN_EYES: 'Open your eyes.',
  TOO_DARK: 'Too dark. Move to a brighter spot.',
  TOO_BRIGHT: 'Too bright. Avoid strong light behind you.',
  TOO_BLURRY: 'Image is blurry. Hold the phone steady.',
  HOLD_STILL: 'Hold still for a moment...',
};

export default function AttendanceScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<BottomTabNavigationProp<StudentTabParamList>>();
  const [activeTab, setActiveTab] = useState<SubTab>('check_in');
  const [permission, requestPermission] = useCameraPermissions();
  const [step, setStep] = useState<Step>('idle');
  const camera = useFaceCamera();
  const { validation, status: faceStatus } = useFaceValidation(SELFIE_REQUIREMENTS, { camera });
  const faceReady = validation?.valid === true;
  const [todayRecord, setTodayRecord] = useState<DbAttendance | null>(null);
  const [historyRecords, setHistoryRecords] = useState<DbAttendance[]>([]);
  const [loading, setLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [offlineCount, setOfflineCount] = useState(0);
  const [isOffline, setIsOffline] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [mode, setMode] = useState<'time_in' | 'time_out'>('time_in');
  const [activeAssignment, setActiveAssignment] = useState<CachedCompanyAssignment | null>(null);
  const [gatewayDocs, setGatewayDocs] = useState<{ id: string; title: string; submitted: boolean; status?: string }[]>([]);
  const [isGatewayCleared, setIsGatewayCleared] = useState(false);
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
  const [scheduleProposal, setScheduleProposal] = useState<DbPracticumSchedule | null>(null);
  const capturingSelfie = useRef(false);

  const { width: winW, height: winH } = useWindowDimensions();
  const [cameraSlow, setCameraSlow] = useState(false);
  useEffect(() => {
    // Offer extra tips if the face check has not passed after a while.
    if (step !== 'selfie') { setCameraSlow(false); return; }
    const timer = setTimeout(() => setCameraSlow(true), 8000);
    return () => clearTimeout(timer);
  }, [step]);

  // GPS verification state
  const [locationNotice, setLocationNotice] = useState<{ tone: 'info' | 'ok' | 'warn'; text: string } | null>(null);
  const [checkingLocation, setCheckingLocation] = useState(false);
  const [pendingLocationData, setPendingLocationData] = useState<LocationPayload | null>(null);
  const [outOfBoundsModal, setOutOfBoundsModal] = useState(false);
  const [flagReasonInput, setFlagReasonInput] = useState('');
  const [tempLocationData, setTempLocationData] = useState<{
    coords: { latitude: number; longitude: number };
    distanceMeters: number;
    companyName: string;
    radiusMeters: number;
    satelliteTimestamp?: string;
  } | null>(null);

  useEffect(() => {
    void loadState();
    void checkOfflineStatus();
    const subscription = Network.addNetworkStateListener(state => {
      const online = Boolean(state.isConnected && state.isInternetReachable !== false);
      setIsOffline(!online);
      if (online) void handleSync();
    });
    return () => subscription.remove();
  }, []);

  async function checkOfflineStatus() {
    const online = await isNetworkAvailable();
    setIsOffline(!online);
    const queue = await getOfflineQueue();
    const queueIdentity = await getCachedAttendanceIdentity();
    setOfflineCount(queue.filter(item => item.student_id === queueIdentity?.student_id).length);

    if (online && queue.length > 0) {
      await handleSync();
    }
  }

  async function loadState() {
    setLoading(true);
    const assign = await getActiveAssignment();
    setActiveAssignment(assign);

    const identity = await getCachedAttendanceIdentity();
    const eligibilityKey = identity ? `cdm_ojt_attendance_eligibility_${identity.user.user_id}` : null;
    const online = await isNetworkAvailable();
    // Cache only the existing attendance prerequisites, scoped to this account.
    if (!online) {
      setIsGatewayCleared(false);
      setGatewayDocs([]);
      setScheduleProposal(null);
      try {
        const raw = eligibilityKey ? await SecureStore.getItemAsync(eligibilityKey) : null;
        if (raw) {
          const cached = JSON.parse(raw);
          setIsGatewayCleared(cached.cleared === true);
          setGatewayDocs(cached.progress || []);
          setScheduleProposal(cached.schedule || null);
        }
      } catch { /* Remain blocked until prerequisites can be checked online. */ }
    } else try {
      const repRes = await listStudentReports(1, 50);
      const reports = repRes.data?.reports || [];
      const GATEWAY_SPECS = [
        { id: 'orientation', title: 'Pre-OJT Orientation Certificate' },
        { id: 'endorsement', title: 'Endorsement Letter' },
      ];

      const progress = GATEWAY_SPECS.map(spec => {
        const found = reports.find(r => {
          const a = (r.report_type || '').toLowerCase();
          const b = spec.title.toLowerCase();
          return a.includes(b) || b.includes(a) ||
            (spec.id === 'orientation' && a.includes('orientation')) ||
            (spec.id === 'endorsement' && (a.includes('endorsement') || a.includes('acceptance') || a.includes('moa')));
        });
        return {
          id: spec.id,
          title: spec.title,
          submitted: Boolean(found),
          status: found ? found.status : 'missing',
        };
      });
      setGatewayDocs(progress);
      const cleared = progress.length === 2 && progress.every(p => p.status === 'approved');
      setIsGatewayCleared(cleared);

      let cachedSchedule: DbPracticumSchedule | null = null;
      setScheduleProposal(null);
      if (cleared) {
        try {
          const schedRes = await fetchStudentScheduleProposal();
          if (schedRes.data) {
            setScheduleProposal(schedRes.data);
            cachedSchedule = schedRes.data;
          }
        } catch {
          // Ignore if offline
        }
      }
      if (eligibilityKey) {
        await SecureStore.setItemAsync(eligibilityKey, JSON.stringify({ cleared, progress, schedule: cachedSchedule }));
      }
    } catch {
      setIsGatewayCleared(false);
    }

    const record = await getTodayAttendance();
    setTodayRecord(record);
    const queue = await getOfflineQueue();
    const queueIdentity = await getCachedAttendanceIdentity();
    setOfflineCount(queue.filter(item => item.student_id === queueIdentity?.student_id).length);
    setLoading(false);
  }

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    const result = await fetchOwnAttendance(1, 50);
    if (result.data?.records) {
      setHistoryRecords(result.data.records);
    }
    setHistoryLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    if (activeTab === 'history') {
      loadHistory();
    }
  }, [activeTab, loadHistory]);

  const onRefresh = async () => {
    setRefreshing(true);
    if (activeTab === 'check_in') {
      await loadState();
      setRefreshing(false);
    } else {
      await loadHistory();
    }
  };

  async function handleSync() {
    setSyncing(true);
    setError('');
    const res = await syncPendingOfflineAttendance();
    setSyncing(false);
    if (res.syncedCount > 0) {
      setSuccess(`Successfully synchronized ${res.syncedCount} offline attendance record(s) with CdM servers.`);
      await loadState();
      if (activeTab === 'history') await loadHistory();
    }
    if (res.errors.length > 0) setError(res.errors[0]);
  }

  async function startAttendance(targetMode: 'time_in' | 'time_out') {
    setError('');
    setSuccess('');
    setCheckingLocation(true);
    setMode(targetMode);
    setLocationNotice({ tone: 'info', text: 'Step 1 of 2: checking your location. This can take up to 12 seconds.' });

    try {
      const assignment = await getActiveAssignment();
      const locRes = await getCurrentCoordinates();

      if (locRes.status === 'services_disabled') {
        setError('Device GPS is turned off. Please turn on Location services in your device settings to clock in.');
        setCheckingLocation(false);
        return;
      }

      if (locRes.status === 'permission_denied') {
        setError('Location permission is required to verify workplace attendance. Please allow location access in your device settings.');
        setCheckingLocation(false);
        return;
      }

      if (locRes.status === 'unavailable' || !locRes.coords) {
        // Fallback: If indoors / satellite unavailable, allow user to proceed with a location note
        setTempLocationData({
          coords: { latitude: 0, longitude: 0 },
          distanceMeters: 0,
          companyName: assignment?.company_name || 'Designated Workplace',
          radiusMeters: assignment?.geofence_radius_meters || 150,
          satelliteTimestamp: new Date().toISOString(),
        });
        setFlagReasonInput('GPS fix unavailable indoors / basement');
        setOutOfBoundsModal(true);
        setCheckingLocation(false);
        return;
      }

      // Check geofence if company has coordinates configured & enabled (bypass for approved remote modality)
      const isRemoteWork = scheduleProposal?.work_modality === 'remote';
      let locationStatus: 'verified' | 'flagged_out_of_bounds' | 'location_unavailable' | 'not_applicable' = isRemoteWork ? 'not_applicable' : 'verified';
      let distanceMeters: number | null = null;

      if (
        !isRemoteWork &&
        assignment &&
        assignment.geofence_enabled &&
        assignment.latitude != null &&
        assignment.longitude != null
      ) {
        const check = isWithinGeofence(
          locRes.coords.latitude,
          locRes.coords.longitude,
          assignment.latitude,
          assignment.longitude,
          assignment.geofence_radius_meters || 150
        );
        distanceMeters = check.distanceMeters;

        if (!check.isWithin) {
          // Out of Bounds flag triggered
          setTempLocationData({
            coords: locRes.coords,
            distanceMeters: check.distanceMeters,
            companyName: assignment.company_name,
            radiusMeters: assignment.geofence_radius_meters || 150,
            satelliteTimestamp: locRes.satelliteTimestamp,
          });
          setFlagReasonInput('');
          setOutOfBoundsModal(true);
          setCheckingLocation(false);
          return;
        }
      }

      // Within perimeter or remote work or geofence not enabled
      const accuracy = locRes.coords.accuracy;
      const accuracyNote = accuracy != null && accuracy > 50
        ? ` GPS accuracy is low (about ${Math.round(accuracy)} m). Moving outdoors gives a better fix.`
        : accuracy != null ? ` GPS accuracy: about ${Math.round(accuracy)} m.` : '';
      setLocationNotice({
        tone: accuracy != null && accuracy > 50 ? 'warn' : 'ok',
        text: isRemoteWork
          ? 'Location accepted (remote schedule, no workplace check needed). Step 2 of 2: take your selfie.'
          : distanceMeters != null
          ? `Location accepted: you are ${Math.round(distanceMeters)} m from ${assignment?.company_name ?? 'your workplace'} (allowed ${assignment?.geofence_radius_meters || 150} m).${accuracyNote} Step 2 of 2: take your selfie.`
          : `Location accepted.${accuracyNote} Step 2 of 2: take your selfie.`,
      });
      setPendingLocationData({
        latitude: locRes.coords.latitude,
        longitude: locRes.coords.longitude,
        distanceMeters: isRemoteWork ? null : distanceMeters,
        locationStatus,
        satelliteTimestamp: locRes.satelliteTimestamp,
      });

      setStep('selfie');
    } catch (err: any) {
      setError(err?.message || 'Unable to acquire GPS location. Please ensure location services are enabled and try again.');
    } finally {
      setCheckingLocation(false);
      setLocationNotice((n) => (n?.tone === 'info' ? null : n));
    }
  }

  function handleConfirmOutOfBounds() {
    if (!tempLocationData) return;
    const isUnavail = tempLocationData.coords.latitude === 0 && tempLocationData.coords.longitude === 0;
    setPendingLocationData({
      latitude: isUnavail ? null : tempLocationData.coords.latitude,
      longitude: isUnavail ? null : tempLocationData.coords.longitude,
      distanceMeters: isUnavail ? null : tempLocationData.distanceMeters,
      locationStatus: isUnavail ? 'location_unavailable' : 'flagged_out_of_bounds',
      flagReason: flagReasonInput.trim() || (isUnavail ? 'GPS unavailable indoors' : 'Off-site / field assignment'),
      satelliteTimestamp: tempLocationData.satelliteTimestamp,
    });
    setOutOfBoundsModal(false);
    setLocationNotice({
      tone: 'warn',
      text: isUnavail
        ? 'No GPS fix. Your record will be flagged for review. Step 2 of 2: take your selfie.'
        : `You are outside the workplace area (${Math.round(tempLocationData.distanceMeters)} m away). Your record will be flagged for review. Step 2 of 2: take your selfie.`,
    });
    setStep('selfie');
  }

  async function captureSelfie() {
    if (!faceReady || capturingSelfie.current) return;
    capturingSelfie.current = true;
    try {
      const photo = await camera.takePhoto({ quality: 0.8 });
      const optimized = await optimizeSelfie(photo.uri, { includeBase64: true });
      await submitAttendance(optimized.uri || photo.uri);
    } catch (err) {
      console.warn('[captureSelfie] failed:', err);
      setError('Error processing selfie image. Please ensure your face is clearly visible within the frame and try again.');
      setStep('idle');
    } finally {
      capturingSelfie.current = false;
    }
  }

  async function submitAttendance(imagePayload: string) {
    setStep('submitting');
    setError('');

    let result;
    if (mode === 'time_in') {
      result = await recordTimeIn(imagePayload, pendingLocationData || undefined);
    } else {
      if (!todayRecord?.attendance_id) {
        setError('No Time In record found for today. Please record Time In first before clocking out.');
        setStep('idle');
        return;
      }
      result = await recordTimeOut(todayRecord.attendance_id, imagePayload, pendingLocationData || undefined);
    }

    if (result.error) {
      setError(result.error.message || 'Error processing attendance submission. Please try again.');
      setStep('idle');
      return;
    }

    if (result.data?.isOffline) {
      setSuccess(
        mode === 'time_in'
          ? 'Time In recorded offline. Photo and timestamp saved locally and will auto-sync when online.'
          : 'Time Out recorded offline. Photo and timestamp saved locally and will auto-sync when online.'
      );
    } else {
      setSuccess(
        mode === 'time_in'
          ? 'Time In recorded successfully with selfie evidence.'
          : 'Time Out recorded successfully with selfie evidence.'
      );
    }

    setStep('idle');
    await loadState();
    if (activeTab === 'history') await loadHistory();
  }

  // Camera Permission View
  if (step === 'selfie' && !permission?.granted) {
    return (
      <View style={[s.permissionContainer, { paddingTop: insets.top }]}>
        <Ionicons name="camera" size={48} color="#0A3824" style={{ marginBottom: 14 }} />
        <Text style={s.permissionTitle}>Camera Access Required</Text>
        <Text style={s.permissionText}>
          Colegio de Montalban OJT policies require real front-camera selfie evidence for daily attendance verification.
        </Text>
        <TouchableOpacity onPress={requestPermission} style={s.btnPrimary} activeOpacity={0.85}>
          <Text style={s.btnPrimaryText}>Grant Camera Permission</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setStep('idle')} style={s.btnCancel}>
          <Text style={s.btnCancelText}>Cancel</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Live Camera View with Face Oval Guide
  if (step === 'selfie') {
    return (
      <View style={s.cameraContainer}>
        <FaceCamera
          camera={camera}
          style={StyleSheet.absoluteFill}
          facing="front"
          inferenceFps={10}
          detection={{ performanceMode: 'fast' }}
          requirements={SELFIE_REQUIREMENTS}
          autoCapture={false}
          onCameraError={() => { setError('Camera unavailable. Please try again.'); setStep('idle'); }}
        />

        {/* Top Cancel Header */}
        <View style={[s.cameraTopBar, { top: insets.top + 16 }]}>
          <TouchableOpacity onPress={() => setStep('idle')} style={s.backBtn}>
            <Ionicons name="close" size={20} color="#ffffff" />
            <Text style={s.backBtnText}>Cancel</Text>
          </TouchableOpacity>
          <View style={s.cameraTag}>
            <Text style={s.cameraTagText}>{mode === 'time_in' ? 'TIME IN SELFIE' : 'TIME OUT SELFIE'}</Text>
          </View>
        </View>

        {/* Location result from step 1 */}
        {locationNotice && (
          <View style={[s.locationBanner, { top: insets.top + 64 }, locationNotice.tone === 'warn' ? s.locationBannerWarn : s.locationBannerOk]}>
            <Ionicons name={locationNotice.tone === 'warn' ? 'warning' : 'checkmark-circle'} size={16} color="#ffffff" />
            <Text style={s.locationBannerText}>{locationNotice.text}</Text>
          </View>
        )}

        {/* Face Oval Alignment Guide: same size and center as the region the face check validates */}
        <View style={s.faceGuideWrapper}>
          <View style={[s.faceOval, { width: winW * 0.56, height: winH * 0.36, borderRadius: winW * 0.28 },
            faceReady && { borderColor: '#4ADE80', borderStyle: 'solid' }]} />
        </View>
        <View style={[s.faceGuideTextWrap, { top: winH * 0.5 + winH * 0.18 + 14 }]}>
          <Text style={s.faceGuideText}>
            {faceReady
              ? 'Face detected. Press the button to capture.'
              : faceStatus == null
                ? 'Starting the camera... the first start can take a few seconds.'
                : FACE_HINTS[faceStatus] ?? 'Center your face inside the oval.'}
          </Text>
          {!faceReady && cameraSlow && (
            <Text style={s.faceGuideTip}>
              Still checking. Face a light source, remove cap, mask or glasses glare, and hold the phone at eye level.
            </Text>
          )}
        </View>

        {/* Shutter Button */}
        <View style={s.cameraOverlay}>
          <TouchableOpacity
            onPress={captureSelfie}
            disabled={!faceReady}
            accessibilityRole="button"
            accessibilityLabel="Capture attendance selfie"
            accessibilityState={{ disabled: !faceReady }}
            style={[s.shutterOuter, !faceReady && { opacity: 0.45 }]}
            activeOpacity={0.85}
          >
            <View style={s.shutterInner} />
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (step === 'submitting') {
    return (
      <View style={[s.center, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color="#0A3824" />
        <Text style={s.submittingText}>
          {mode === 'time_in' ? 'Recording Time In...' : 'Recording Time Out...'}
        </Text>
        <Text style={[s.submittingText, { fontSize: 12, fontWeight: '500', marginTop: 6, textAlign: 'center', paddingHorizontal: 32 }]}>
          {isOffline
            ? 'No internet: saving your selfie and location on this phone. It will sync automatically.'
            : 'Uploading your selfie and location. Please keep the app open.'}
        </Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={[s.center, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color="#0A3824" />
      </View>
    );
  }

  const todayFormatted = new Date().toLocaleDateString('en-PH', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={s.header}>
        <View style={s.headerTopRow}>
          <View style={s.headerTextCol}>
            <Text style={s.headerKicker}>Colegio de Montalban OJT</Text>
            <Text style={s.headerTitle}>Attendance Portal</Text>
            <Text style={s.headerDate}>{todayFormatted}</Text>
          </View>
          <TouchableOpacity
            style={s.settingsBtn}
            onPress={() => navigation.navigate('Profile')}
            accessibilityRole="button"
            accessibilityLabel="Open settings and profile"
            activeOpacity={0.75}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="settings-outline" size={20} color="#0A3824" />
          </TouchableOpacity>
        </View>

        {/* Segmented Top Tab Switcher */}
        <View style={s.segmentedContainer}>
          <TouchableOpacity
            style={[
              s.segmentBtn,
              activeTab === 'check_in' ? s.segmentBtnActive : s.segmentBtnInactive,
            ]}
            onPress={() => setActiveTab('check_in')}
            activeOpacity={0.8}
          >
            <Ionicons
              name={activeTab === 'check_in' ? 'camera' : 'camera-outline'}
              size={15}
              color={activeTab === 'check_in' ? '#0A3824' : '#37483C'}
            />
            <Text style={[s.segmentText, activeTab === 'check_in' && s.segmentTextActive]}>
              Live Check-In
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              s.segmentBtn,
              activeTab === 'history' ? s.segmentBtnActive : s.segmentBtnInactive,
            ]}
            onPress={() => setActiveTab('history')}
            activeOpacity={0.8}
          >
            <Ionicons
              name={activeTab === 'history' ? 'time' : 'time-outline'}
              size={15}
              color={activeTab === 'history' ? '#0A3824' : '#37483C'}
            />
            <Text style={[s.segmentText, activeTab === 'history' && s.segmentTextActive]}>
              History Logs
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* VIEW A: Check-In Tab */}
      {activeTab === 'check_in' && (
        <ScrollView
          contentContainerStyle={s.content}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#0A3824']} />}
        >
          {/* Offline Sync Banner */}
          {offlineCount > 0 && (
            <View style={s.offlineBanner}>
              <View style={s.offlineBannerTextCol}>
                <Text style={s.offlineBannerTitle}>
                  {offlineCount} Record{offlineCount > 1 ? 's' : ''} Queued Offline
                </Text>
                <Text style={s.offlineBannerSub}>
                  {isOffline ? 'Will auto-sync when connected' : 'Ready to synchronize with CdM servers'}
                </Text>
              </View>
              {!isOffline && (
                <TouchableOpacity onPress={handleSync} disabled={syncing} style={s.syncBtn} activeOpacity={0.85}>
                  {syncing ? (
                    <ActivityIndicator size="small" color="#092E1D" />
                  ) : (
                    <Text style={s.syncBtnText}>Sync Now</Text>
                  )}
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* Success / Error Alerts */}
          {!!success && (
            <View style={s.alertSuccess}>
              <Ionicons name="checkmark-circle" size={18} color="#0A3824" />
              <Text style={s.alertSuccessText}>{success}</Text>
              <TouchableOpacity
                onPress={() => setSuccess('')}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel="Dismiss success message"
              >
                <Ionicons name="close" size={16} color="#0A3824" />
              </TouchableOpacity>
            </View>
          )}
          {!!error && (
            <View style={s.alertError}>
              <Ionicons name="alert-circle" size={18} color="#991b1b" />
              <Text style={s.alertErrorText}>{error}</Text>
              <TouchableOpacity
                onPress={() => setError('')}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel="Dismiss error message"
              >
                <Ionicons name="close" size={16} color="#7f1d1d" />
              </TouchableOpacity>
            </View>
          )}

          {/* Pre-Deployment Gateway Notice or Normal Today Status */}
          {(!activeAssignment || !isGatewayCleared) ? (
            <View style={s.gatewayCard}>
              <View style={s.gatewayHeaderRow}>
                <View style={s.gatewayLockIcon}>
                  <Ionicons name="lock-closed" size={20} color="#b45309" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.gatewayTitle}>Attendance Locked</Text>
                  <Text style={s.gatewaySubtitle}>
                    {!isGatewayCleared
                      ? `Pre-Deployment Gateway Incomplete (${gatewayDocs.filter(d => d.status === 'approved').length}/2 Approved)`
                      : 'Gateway Cleared! Set Up Practicum Work Schedule'}
                  </Text>
                </View>
              </View>

              <Text style={s.gatewayDesc}>
                {!isGatewayCleared
                  ? 'Under Colegio de Montalban practicum rules, daily check-in is unlocked only after your 2 mandatory gateway documents are submitted and verified by your OJT Coordinator.'
                  : 'All mandatory credentials have been verified! Please submit your proposed Practicum Work Schedule so your OJT Coordinator can deploy you.'}
              </Text>

              {/* Progress Count */}
              <View style={s.gatewayProgressRow}>
                <Text style={s.gatewayProgressLabel}>Gateway Progress</Text>
                <Text style={s.gatewayProgressCount}>
                  {gatewayDocs.filter(d => d.submitted).length} of {gatewayDocs.length || 2} Submitted
                </Text>
              </View>

              {/* Checklist Items */}
              <View style={s.gatewayList}>
                {(gatewayDocs.length > 0 ? gatewayDocs : [
                  { id: '1', title: 'Pre-OJT Orientation Certificate', submitted: false },
                  { id: '2', title: 'Endorsement Letter', submitted: false },
                ]).map((doc) => (
                  <View key={doc.id} style={s.gatewayItem}>
                    <Ionicons
                      name={doc.submitted ? "checkmark-circle" : "ellipse-outline"}
                      size={17}
                      color={doc.submitted ? "#0A3824" : "#879687"}
                    />
                    <Text style={[s.gatewayItemText, doc.submitted && s.gatewayItemTextDone]}>
                      {doc.title}
                    </Text>
                    <View style={[
                      s.gatewayStatusBadge,
                      doc.submitted ? (doc.status === 'approved' ? s.badgeGreen : s.badgeAmber) : s.badgeGray
                    ]}>
                      <Text style={s.gatewayStatusBadgeText}>
                        {doc.submitted ? (doc.status === 'approved' ? 'Approved' : 'Submitted') : 'Required'}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>

              {isGatewayCleared ? (
                <View style={{ marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: '#F4F6F2' }}>
                  {scheduleProposal ? (
                    <View style={[s.scheduleStatusBox, scheduleProposal.status === 'rejected' && s.scheduleStatusBoxAlert]}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Ionicons
                          name={scheduleProposal.status === 'rejected' ? 'alert-circle' : 'time'}
                          size={18}
                          color={scheduleProposal.status === 'rejected' ? '#B42318' : '#0A3824'}
                        />
                        <Text style={[s.scheduleStatusTitle, scheduleProposal.status === 'rejected' && { color: '#B42318' }]}>
                          {scheduleProposal.status === 'approved' ? 'Practicum Schedule Approved'
                            : scheduleProposal.status === 'rejected' ? 'Schedule Rejected: Action Needed'
                            : scheduleProposal.status === 'modified' ? 'Coordinator Requested Changes'
                            : 'Schedule Proposal Submitted'}
                        </Text>
                      </View>
                      <Text style={s.scheduleStatusSub}>
                        {scheduleProposal.work_modality?.toUpperCase()} • {scheduleProposal.time_in?.substring(0, 5)} - {scheduleProposal.time_out?.substring(0, 5)} ({scheduleProposal.daily_hours}h/day)
                      </Text>
                      <Text style={s.scheduleStatusNote}>
                        {scheduleProposal.status === 'approved'
                          ? 'OJT Coordinator approved! Awaiting supervisor activation.'
                          : scheduleProposal.status === 'rejected' || scheduleProposal.status === 'modified'
                          ? `Coordinator feedback: ${scheduleProposal.coordinator_feedback?.trim() || 'No reason was given. Please revise your schedule and resubmit.'}`
                          : 'Under review by your OJT Coordinator for deployment.'}
                      </Text>

                      <TouchableOpacity
                        style={[s.scheduleModifyBtn, scheduleProposal.status === 'rejected' && s.scheduleModifyBtnAlert]}
                        onPress={() => setScheduleModalOpen(true)}
                        activeOpacity={0.85}
                      >
                        <Ionicons name="create-outline" size={16} color={scheduleProposal.status === 'rejected' ? '#FFFFFF' : '#0A3824'} />
                        <Text style={[s.scheduleModifyBtnText, scheduleProposal.status === 'rejected' && { color: '#FFFFFF' }]}>
                          {scheduleProposal.status === 'rejected' || scheduleProposal.status === 'modified'
                            ? 'Revise & Resubmit Schedule'
                            : 'View / Modify Schedule Proposal'}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <TouchableOpacity
                      style={s.scheduleActionBtn}
                      onPress={() => setScheduleModalOpen(true)}
                      activeOpacity={0.85}
                    >
                      <Ionicons name="calendar" size={18} color="#E4DBC4" />
                      <Text style={s.scheduleActionBtnText}>Set Up Practicum Work Schedule</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ) : (
                <TouchableOpacity
                  style={s.gatewayActionBtn}
                  onPress={() => navigation.navigate('Reports')}
                  activeOpacity={0.85}
                >
                  <Ionicons name="document-attach" size={17} color="#092E1D" />
                  <Text style={s.gatewayActionBtnText}>Go to Document Submissions</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : (
            <>
              {/* Today's Status Card */}
              <View style={s.card}>
                <View style={s.cardHeaderRow}>
                  <Text style={s.cardHeading}>TODAY&apos;S ATTENDANCE STATUS</Text>
                  {(todayRecord as any)?.offline_created && (
                    <View style={s.offlineTag}>
                      <Text style={s.offlineTagText}>Offline Log</Text>
                    </View>
                  )}
                </View>

                {todayRecord ? (
                  <View style={s.statusList}>
                    <View style={s.statusRow}>
                      <Text style={s.statusLabel}>Time In</Text>
                      <Text style={s.statusValue}>
                        {new Date(todayRecord.time_in).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </Text>
                    </View>
                    <View style={s.statusRow}>
                      <Text style={s.statusLabel}>Time Out</Text>
                      <Text style={[s.statusValue, !todayRecord.time_out && s.textMuted]}>
                        {todayRecord.time_out
                          ? new Date(todayRecord.time_out).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                          : 'Pending (On Duty)'}
                      </Text>
                    </View>
                    <View style={s.statusRow}>
                      <Text style={s.statusLabel}>Punctuality</Text>
                      <Text style={[
                        s.statusValue,
                        todayRecord.late_status === 'late' ? { color: '#dc2626' } : { color: '#0A3824' }
                      ]}>
                        {todayRecord.late_status.replace('_', ' ').toUpperCase()}
                      </Text>
                    </View>
                    <View style={s.statusRow}>
                      <Text style={s.statusLabel}>GPS Verification</Text>
                      <Text style={[
                        s.statusValue,
                        todayRecord.time_in_location_status === 'flagged_out_of_bounds'
                          ? { color: '#b45309' }
                          : { color: '#0A3824' }
                      ]}>
                        {todayRecord.time_in_location_status === 'not_applicable'
                          ? '💻 Remote Work'
                          : todayRecord.time_in_location_status === 'flagged_out_of_bounds'
                          ? `📍 Off-Site / Field (${todayRecord.time_in_distance_meters ?? '?'}m)`
                          : todayRecord.time_in_distance_meters != null
                          ? `📍 On-Site (${todayRecord.time_in_distance_meters}m)`
                          : 'Verified'}
                      </Text>
                    </View>
                    <View style={s.statusRow}>
                      <Text style={s.statusLabel}>Verification Status</Text>
                      <View style={[
                        s.badge,
                        todayRecord.verification_status === 'verified' ? s.badgeGreen :
                        todayRecord.verification_status === 'rejected' ? s.badgeRed : s.badgeAmber,
                      ]}>
                        <Text style={[
                          s.badgeText,
                          todayRecord.verification_status === 'verified' ? s.badgeTextGreen :
                          todayRecord.verification_status === 'rejected' ? s.badgeTextRed : s.badgeTextAmber,
                        ]}>
                          {todayRecord.verification_status}
                        </Text>
                      </View>
                    </View>
                  </View>
                ) : (
                  <View style={s.emptyBox}>
                    <Ionicons name="time-outline" size={36} color="#879687" style={{ marginBottom: 6 }} />
                    <Text style={s.emptyText}>No attendance recorded yet today.</Text>
                  </View>
                )}
              </View>

              {/* Action Buttons */}
              <View style={s.actionSection}>
                {!todayRecord && (
                  <TouchableOpacity
                    onPress={() => startAttendance('time_in')}
                    disabled={checkingLocation || !!error}
                    style={[
                      s.btnTimeIn,
                      (checkingLocation || !!error) && (error ? s.btnDisabled : { opacity: 0.7 }),
                    ]}
                    activeOpacity={0.85}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      {checkingLocation && mode === 'time_in' ? (
                        <ActivityIndicator size="small" color="#ffffff" />
                      ) : error ? (
                        <Ionicons name="alert-circle-outline" size={22} color="#ffffff" />
                      ) : (
                        <Ionicons name="location" size={22} color="#ffffff" />
                      )}
                      <Text style={[s.btnTimeInText, error ? s.btnDisabledText : null]}>
                        {checkingLocation && mode === 'time_in'
                          ? 'Acquiring GPS Fix...'
                          : error
                          ? 'Check-In Blocked'
                          : 'Time In'}
                      </Text>
                    </View>
                    <Text style={[s.btnSubtext, error ? s.btnDisabledSubtext : null]}>
                      {checkingLocation && mode === 'time_in'
                        ? 'Checking your location. This can take up to 12 seconds...'
                        : error
                        ? 'Resolve the error message above to enable Time In'
                        : isOffline
                        ? 'GPS lock & offline selfie verification'
                        : 'GPS location & front-camera selfie required'}
                    </Text>
                  </TouchableOpacity>
                )}

                {todayRecord && !todayRecord.time_out && (
                  <TouchableOpacity
                    onPress={() => startAttendance('time_out')}
                    disabled={checkingLocation || !!error}
                    style={[
                      s.btnTimeOut,
                      (checkingLocation || !!error) && (error ? s.btnDisabled : { opacity: 0.7 }),
                    ]}
                    activeOpacity={0.85}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      {checkingLocation && mode === 'time_out' ? (
                        <ActivityIndicator size="small" color="#0A3824" />
                      ) : error ? (
                        <Ionicons name="alert-circle-outline" size={22} color="#526257" />
                      ) : (
                        <Ionicons name="log-out-outline" size={22} color="#0A3824" />
                      )}
                      <Text style={[s.btnTimeOutText, error ? { color: '#526257' } : null]}>
                        {checkingLocation && mode === 'time_out'
                          ? 'Acquiring GPS Fix...'
                          : error
                          ? 'Check-Out Blocked'
                          : 'Time Out'}
                      </Text>
                    </View>
                    <Text style={s.btnSubtextMuted}>
                      {checkingLocation && mode === 'time_out'
                        ? 'Checking your location. This can take up to 12 seconds...'
                        : error
                        ? 'Resolve the error message above to enable Time Out'
                        : isOffline
                        ? 'GPS lock & offline selfie verification'
                        : 'GPS location & front-camera selfie required'}
                    </Text>
                  </TouchableOpacity>
                )}

                {todayRecord?.time_out && (
                  <View style={s.completeCard}>
                    <Ionicons name="checkmark-done-circle" size={28} color="#0A3824" style={{ marginBottom: 4 }} />
                    <Text style={s.completeTitle}>Attendance Complete for Today</Text>
                    <Text style={s.completeSub}>Both Time In and Time Out have been securely recorded.</Text>
                  </View>
                )}
              </View>
            </>
          )}
        </ScrollView>
      )}

      {/* VIEW B: History Logs Tab */}
      {activeTab === 'history' && (
        <FlatList
          data={historyRecords}
          keyExtractor={(item) => item.attendance_id}
          contentContainerStyle={s.historyListContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#0A3824']} />}
          ListEmptyComponent={
            historyLoading ? (
              <View style={s.center}>
                <ActivityIndicator size="large" color="#0A3824" />
              </View>
            ) : (
              <View style={s.emptyContainer}>
                <Ionicons name="calendar-outline" size={40} color="#879687" style={{ marginBottom: 8 }} />
                <Text style={s.emptyTitle}>No attendance records found</Text>
                <Text style={s.emptySub}>Your verified time in and out records will appear here.</Text>
              </View>
            )
          }
          renderItem={({ item }) => (
            <View style={s.historyCard}>
              <View style={s.cardTop}>
                <Text style={s.dateText}>
                  {new Date(item.attendance_date).toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  {item.time_in_location_status === 'flagged_out_of_bounds' ? (
                    <View style={[s.badge, { backgroundColor: '#fef3c7' }]}>
                      <Text style={[s.badgeText, { color: '#b45309', fontSize: 10 }]}>⚠️ Out-of-Bounds</Text>
                    </View>
                  ) : item.time_in_distance_meters != null ? (
                    <View style={[s.badge, { backgroundColor: '#ecfdf5' }]}>
                      <Text style={[s.badgeText, { color: '#047857', fontSize: 10 }]}>📍 {item.time_in_distance_meters}m</Text>
                    </View>
                  ) : null}
                  <View style={[
                    s.badge,
                    item.verification_status === 'verified' ? s.badgeGreen :
                    item.verification_status === 'rejected' ? s.badgeRed : s.badgeAmber
                  ]}>
                    <Text style={[
                      s.badgeText,
                      item.verification_status === 'verified' ? s.badgeTextGreen :
                      item.verification_status === 'rejected' ? s.badgeTextRed : s.badgeTextAmber
                    ]}>
                      {item.verification_status}
                    </Text>
                  </View>
                </View>
              </View>

              <View style={s.timeGrid}>
                <View style={s.timeCol}>
                  <Text style={s.timeLabel}>Time In</Text>
                  <Text style={s.timeValue}>
                    {new Date(item.time_in).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                </View>
                <View style={s.timeCol}>
                  <Text style={s.timeLabel}>Time Out</Text>
                  <Text style={[s.timeValue, !item.time_out && s.textMuted]}>
                    {item.time_out
                      ? new Date(item.time_out).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                      : 'Pending'}
                  </Text>
                </View>
                <View style={s.timeCol}>
                  <Text style={s.timeLabel}>Punctuality</Text>
                  <Text style={[s.timeValue, item.late_status === 'late' ? { color: '#dc2626' } : { color: '#0A3824' }]}>
                    {item.late_status.replace('_', ' ')}
                  </Text>
                </View>
              </View>
            </View>
          )}
        />
      )}

      {/* Out-of-Bounds Reason Modal */}
      <Modal
        visible={outOfBoundsModal}
        transparent
        animationType="fade"
        onRequestClose={() => setOutOfBoundsModal(false)}
      >
        <View style={s.modalOverlay}>
          <View style={s.modalCard}>
            <View style={s.modalHeaderRow}>
              <Ionicons
                name={tempLocationData?.coords.latitude === 0 ? "location-outline" : "navigate-outline"}
                size={26}
                color={tempLocationData?.coords.latitude === 0 ? "#0284c7" : "#0A3824"}
              />
              <Text style={s.modalTitle}>
                {tempLocationData?.coords.latitude === 0 ? 'Location Notice' : 'Off-Site / Field Work Notice'}
              </Text>
            </View>
            <Text style={s.modalDesc}>
              {tempLocationData?.coords.latitude === 0 ? (
                'Could not obtain an active satellite GPS lock. This is common indoors, inside concrete structures, or in basement facilities.'
              ) : (
                <>Your current location is approx. <Text style={{ fontWeight: 'bold', color: '#092E1D' }}>{tempLocationData?.distanceMeters}m</Text> from {tempLocationData?.companyName}.</>
              )}
            </Text>
            <Text style={s.modalPrompt}>
              {tempLocationData?.coords.latitude === 0 ? (
                'Please provide a brief note explaining your current workplace location to proceed with your selfie:'
              ) : (
                'If you are on an official field task, client errand, working remotely, or experiencing indoor GPS drift, provide a brief note for your supervisor:'
              )}
            </Text>
            <TextInput
              style={s.modalInput}
              placeholder={tempLocationData?.coords.latitude === 0 ? "e.g. Inside basement / Office 3rd floor" : "e.g. Client visit / IT site deployment / Errand / WFH"}
              placeholderTextColor="#879687"
              value={flagReasonInput}
              onChangeText={setFlagReasonInput}
              multiline
            />
            <View style={s.modalBtnRow}>
              <TouchableOpacity
                style={s.modalCancelBtn}
                onPress={() => setOutOfBoundsModal(false)}
                activeOpacity={0.8}
              >
                <Text style={s.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={s.modalConfirmBtn}
                onPress={handleConfirmOutOfBounds}
                activeOpacity={0.8}
              >
                <Text style={s.modalConfirmText}>Proceed to Selfie</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <ScheduleProposalModal
        visible={scheduleModalOpen}
        onClose={() => setScheduleModalOpen(false)}
        onSubmitted={loadState}
      />

      <NetworkToast isOffline={isOffline} />
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F4F6F2' },
  content: { padding: 20, paddingBottom: 40 },
  center: { flex: 1, backgroundColor: '#F4F6F2', alignItems: 'center', justifyContent: 'center', gap: 12, paddingVertical: 40 },
  header: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 10 },
  headerTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  headerTextCol: { flex: 1, paddingRight: 12 },
  headerKicker: { fontSize: 11, fontWeight: '800', color: '#0A3824', textTransform: 'uppercase', letterSpacing: 0.5 },
  headerTitle: { fontSize: 24, fontWeight: '900', color: '#092E1D' },
  headerDate: { fontSize: 12, color: '#526257', marginTop: 2 },
  settingsBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#DCE5DB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  segmentedContainer: {
    flexDirection: 'row',
    backgroundColor: '#DCE5DB',
    padding: 4,
    borderRadius: 14,
    marginTop: 4,
    gap: 4,
  },
  segmentBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    borderRadius: 11,
    gap: 6,
  },
  segmentBtnActive: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#C7D2C7',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  segmentBtnInactive: {
    backgroundColor: 'rgba(255, 255, 255, 0.45)',
    borderWidth: 1,
    borderColor: 'rgba(203, 213, 225, 0.7)',
  },
  segmentText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#37483C',
  },
  segmentTextActive: {
    color: '#0A3824',
    fontWeight: '800',
  },
  offlineBanner: {
    backgroundColor: '#fffbeb',
    borderWidth: 1,
    borderColor: '#fef3c7',
    borderRadius: 16,
    padding: 14,
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  offlineBannerTextCol: { flex: 1 },
  offlineBannerTitle: { fontSize: 13, fontWeight: '800', color: '#92400e' },
  offlineBannerSub: { fontSize: 11, color: '#b45309', marginTop: 2 },
  syncBtn: {
    backgroundColor: '#E4DBC4',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  syncBtnText: { color: '#092E1D', fontSize: 12, fontWeight: '800' },
  offlineTag: {
    backgroundColor: '#fef3c7',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#fde68a',
  },
  offlineTagText: { fontSize: 10, fontWeight: '800', color: '#b45309' },
  alertSuccess: {
    backgroundColor: 'rgba(10,56,36,0.08)',
    borderWidth: 1,
    borderColor: '#0A3824',
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  alertSuccessText: { color: '#0A3824', fontSize: 13, fontWeight: '700', flex: 1 },
  alertError: {
    backgroundColor: '#fbf2f2',
    borderWidth: 1,
    borderColor: '#f1cdcd',
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  alertErrorText: { color: '#7f1d1d', fontSize: 13, fontWeight: '600', flex: 1, lineHeight: 18 },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#DCE5DB',
    padding: 20,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  cardHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  cardHeading: { fontSize: 11, fontWeight: '800', color: '#0A3824', textTransform: 'uppercase', letterSpacing: 0.5 },
  statusList: { gap: 12 },
  statusRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  statusLabel: { fontSize: 13, color: '#37483C', fontWeight: '500' },
  statusValue: { fontSize: 14, fontWeight: '700', color: '#18271D' },
  textMuted: { color: '#f59e0b', fontWeight: '600' },
  badge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 12 },
  badgeGreen: { backgroundColor: 'rgba(10,56,36,0.1)' },
  badgeTextGreen: { color: '#0A3824', fontSize: 12, fontWeight: '800', textTransform: 'capitalize' },
  badgeRed: { backgroundColor: '#fee2e2' },
  badgeTextRed: { color: '#dc2626', fontSize: 12, fontWeight: '700', textTransform: 'capitalize' },
  badgeAmber: { backgroundColor: '#fef3c7' },
  badgeTextAmber: { color: '#d97706', fontSize: 12, fontWeight: '700', textTransform: 'capitalize' },
  badgeText: { fontSize: 12, fontWeight: '600' },
  emptyBox: { alignItems: 'center', paddingVertical: 16 },
  emptyText: { fontSize: 13, color: '#879687', fontWeight: '500' },
  actionSection: { gap: 12 },
  btnTimeIn: {
    backgroundColor: '#0A3824',
    borderRadius: 20,
    paddingVertical: 18,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#166534',
    shadowColor: '#0A3824',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  btnTimeInText: { color: '#ffffff', fontSize: 18, fontWeight: '900', letterSpacing: 0.5 },
  btnSubtext: { color: '#ffffff', fontSize: 11, fontWeight: '600', marginTop: 4 },
  btnDisabled: {
    backgroundColor: '#879687',
    borderColor: '#C7D2C7',
    shadowOpacity: 0,
    elevation: 0,
  },
  btnDisabledText: {
    color: '#ffffff',
  },
  btnDisabledSubtext: {
    color: 'rgba(255,255,255,0.9)',
  },
  btnTimeOut: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    paddingVertical: 18,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#0A3824',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
  btnTimeOutText: { color: '#0A3824', fontSize: 18, fontWeight: '900', letterSpacing: 0.5 },
  btnSubtextMuted: { color: '#526257', fontSize: 11, fontWeight: '600', marginTop: 4 },
  completeCard: {
    backgroundColor: 'rgba(10,56,36,0.06)',
    borderRadius: 20,
    padding: 18,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#0A3824',
  },
  completeTitle: { fontSize: 15, fontWeight: '800', color: '#0A3824' },
  completeSub: { fontSize: 12, color: '#37483C', marginTop: 3 },
  submittingText: { fontSize: 13, fontWeight: '700', color: '#0A3824', marginTop: 8 },
  permissionContainer: { flex: 1, backgroundColor: '#F4F6F2', alignItems: 'center', justifyContent: 'center', padding: 28 },
  permissionTitle: { fontSize: 20, fontWeight: '900', color: '#092E1D', marginBottom: 8, textAlign: 'center' },
  permissionText: { fontSize: 13, color: '#526257', textAlign: 'center', lineHeight: 20, marginBottom: 24 },
  btnPrimary: { backgroundColor: '#0A3824', borderRadius: 14, paddingVertical: 14, paddingHorizontal: 24, width: '100%', alignItems: 'center', marginBottom: 10 },
  btnPrimaryText: { color: '#E4DBC4', fontSize: 14, fontWeight: '800' },
  btnCancel: { paddingVertical: 10, alignItems: 'center' },
  btnCancelText: { color: '#526257', fontSize: 13, fontWeight: '600' },
  cameraContainer: { flex: 1, backgroundColor: '#000000' },
  cameraTopBar: {
    position: 'absolute',
    left: 20,
    right: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    zIndex: 10,
  },
  backBtn: {
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  backBtnText: { color: '#ffffff', fontSize: 12, fontWeight: '700' },
  cameraTag: {
    backgroundColor: 'rgba(10,56,36,0.8)',
    borderWidth: 1,
    borderColor: '#E4DBC4',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
  },
  cameraTagText: { color: '#E4DBC4', fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
  faceGuideWrapper: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    pointerEvents: 'none',
  },
  faceOval: {
    width: 220,
    height: 300,
    borderRadius: 110,
    borderWidth: 2,
    borderColor: '#E4DBC4',
    borderStyle: 'dashed',
    backgroundColor: 'rgba(0,0,0,0.08)',
  },
  faceGuideTextWrap: { position: 'absolute', left: 24, right: 24, alignItems: 'center', gap: 6 },
  faceGuideText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    overflow: 'hidden',
  },
  faceGuideTip: {
    color: '#ffffff',
    fontSize: 11,
    textAlign: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    overflow: 'hidden',
  },
  locationBanner: {
    position: 'absolute', left: 16, right: 16, flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12,
  },
  locationBannerOk: { backgroundColor: 'rgba(10,56,36,0.92)' },
  locationBannerWarn: { backgroundColor: 'rgba(180,83,9,0.94)' },
  locationBannerText: { flex: 1, color: '#ffffff', fontSize: 12, fontWeight: '600' },
  cameraOverlay: { position: 'absolute', bottom: 40, left: 0, right: 0, alignItems: 'center', gap: 20 },
  shutterOuter: { width: 76, height: 76, borderRadius: 38, borderWidth: 4, borderColor: '#ffffff', alignItems: 'center', justifyContent: 'center' },
  shutterInner: { width: 60, height: 60, borderRadius: 30, backgroundColor: '#E4DBC4' },
  historyListContent: { paddingHorizontal: 20, paddingBottom: 24, gap: 12 },
  historyCard: { backgroundColor: '#ffffff', borderRadius: 18, borderWidth: 1, borderColor: '#DCE5DB', padding: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 6, elevation: 1 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  dateText: { fontSize: 14, fontWeight: '800', color: '#092E1D' },
  timeGrid: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#F7F9F5', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#F4F6F2' },
  timeCol: { alignItems: 'flex-start' },
  timeLabel: { fontSize: 11, color: '#526257', marginBottom: 2, fontWeight: '500' },
  timeValue: { fontSize: 13, fontWeight: '800', color: '#18271D', textTransform: 'capitalize' },
  emptyContainer: { alignItems: 'center', paddingVertical: 48 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: '#37483C' },
  emptySub: { fontSize: 13, color: '#879687', textAlign: 'center', marginTop: 4, paddingHorizontal: 20 },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalCard: {
    backgroundColor: '#ffffff',
    borderRadius: 22,
    padding: 22,
    width: '100%',
    maxWidth: 400,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 14,
    elevation: 10,
  },
  modalHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#092E1D',
  },
  modalDesc: {
    fontSize: 14,
    color: '#37483C',
    lineHeight: 20,
    marginBottom: 8,
  },
  modalPrompt: {
    fontSize: 12,
    color: '#526257',
    lineHeight: 17,
    marginBottom: 12,
  },
  modalInput: {
    backgroundColor: '#F7F9F5',
    borderWidth: 1,
    borderColor: '#C7D2C7',
    borderRadius: 12,
    padding: 12,
    fontSize: 13,
    color: '#18271D',
    minHeight: 70,
    textAlignVertical: 'top',
    marginBottom: 16,
  },
  modalBtnRow: {
    flexDirection: 'row',
    gap: 12,
  },
  modalCancelBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 12,
    backgroundColor: '#F4F6F2',
    alignItems: 'center',
  },
  modalCancelText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#37483C',
  },
  modalConfirmBtn: {
    flex: 1.5,
    paddingVertical: 13,
    borderRadius: 12,
    backgroundColor: '#0A3824',
    alignItems: 'center',
  },
  modalConfirmText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#E4DBC4',
  },
  // â”€â”€â”€ Pre-Deployment Gateway Card â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  gatewayCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 18,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#fde68a',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  gatewayHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 10,
  },
  gatewayLockIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#fef3c7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  gatewayTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#92400e',
  },
  gatewaySubtitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#b45309',
    marginTop: 1,
  },
  gatewayDesc: {
    fontSize: 12,
    color: '#37483C',
    lineHeight: 18,
    marginBottom: 14,
  },
  gatewayProgressRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#F4F6F2',
    marginBottom: 12,
  },
  gatewayProgressLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#092E1D',
  },
  gatewayProgressCount: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0A3824',
  },
  gatewayList: {
    gap: 8,
    marginBottom: 16,
  },
  gatewayItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
  },
  gatewayItemText: {
    flex: 1,
    fontSize: 12,
    color: '#37483C',
    fontWeight: '500',
  },
  gatewayItemTextDone: {
    color: '#0A3824',
    fontWeight: '700',
  },
  gatewayStatusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  gatewayStatusBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  badgeGray: {
    backgroundColor: '#F4F6F2',
  },
  gatewayActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#E4DBC4',
    paddingVertical: 12,
    borderRadius: 12,
  },
  gatewayActionBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#092E1D',
  },
  scheduleStatusBox: {
    backgroundColor: '#F7F9F5',
    borderWidth: 1,
    borderColor: '#DCE5DB',
    borderRadius: 12,
    padding: 12,
    gap: 4,
  },
  scheduleStatusBoxAlert: {
    backgroundColor: '#FEF3F2',
    borderColor: '#F04438',
  },
  scheduleModifyBtnAlert: {
    backgroundColor: '#B42318',
  },
  scheduleStatusTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0A3824',
  },
  scheduleStatusSub: {
    fontSize: 11,
    fontWeight: '700',
    color: '#37483C',
  },
  scheduleStatusNote: {
    fontSize: 10,
    color: '#526257',
    fontStyle: 'italic',
  },
  scheduleModifyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(10,56,36,0.08)',
    marginTop: 6,
  },
  scheduleModifyBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0A3824',
  },
  scheduleActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#0A3824',
    paddingVertical: 12,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  scheduleActionBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#E4DBC4',
  },
});
