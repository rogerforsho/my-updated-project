import { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
  Image,
  Alert,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { signOut, changeUserPassword } from '../../services/auth';

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);

  // In-App Password Change State
  const [showSecurity, setShowSecurity] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [pwdLoading, setPwdLoading] = useState(false);
  const [pwdMsg, setPwdMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    fetchProfile();
  }, []);

  async function fetchProfile() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: student } = await supabase
        .from('students')
        .select('*, users(full_name, email)')
        .eq('user_id', user.id)
        .maybeSingle();

      let assignment = null;
      if (student?.student_id) {
        const { data: assignData } = await supabase
          .from('student_assignments')
          .select(`
            *,
            companies ( company_name ),
            supervisors ( users ( full_name ) )
          `)
          .eq('student_id', student.student_id)
          .eq('assignment_status', 'active')
          .maybeSingle();
        assignment = assignData;
      }

      setProfile({ user, student, assignment });
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  const getStrength = (pwd: string) => {
    if (!pwd) return 0;
    let score = 0;
    if (pwd.length >= 8) score += 25;
    if (pwd.length >= 12) score += 25;
    if (/[A-Z]/.test(pwd) && /[a-z]/.test(pwd)) score += 25;
    if (/[0-9]/.test(pwd) || /[^A-Za-z0-9]/.test(pwd)) score += 25;
    return score;
  };

  const strength = getStrength(newPassword);

  async function handlePasswordChange() {
    setPwdMsg(null);
    if (!newPassword || newPassword.length < 8) {
      setPwdMsg({ type: 'error', text: 'New password must be at least 8 characters long.' });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwdMsg({ type: 'error', text: 'New passwords do not match.' });
      return;
    }

    setPwdLoading(true);
    const result = await changeUserPassword(currentPassword, newPassword);
    setPwdLoading(false);

    if (result.error) {
      setPwdMsg({ type: 'error', text: result.error.message });
    } else {
      setPwdMsg({ type: 'success', text: 'Password successfully updated!' });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => setShowSecurity(false), 2000);
    }
  }

  function handleSignOut() {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out of your Colegio de Montalban OJT account?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            setLoggingOut(true);
            await signOut();
          },
        },
      ]
    );
  }

  if (loading) {
    return (
      <View style={[s.center, { backgroundColor: '#092E1D' }]}>
        <ActivityIndicator color="#E4DBC4" size="large" />
      </View>
    );
  }

  const course = (profile?.student?.course || '').toUpperCase();
  const isICS = course.includes('BSIT') || course.includes('BSCS') || course.includes('BS-CPE') || course.includes('BSCPE') || course.includes('INFORMATION TECHNOLOGY') || course.includes('COMPUTER SCIENCE') || course.includes('COMPUTER ENGINEERING');
  const departmentName = isICS ? 'Institute of Computing Studies (ICS)' : 'Institute of Business and Entrepreneurship (IBE)';

  const supervisorUser = (profile?.assignment?.supervisors as any)?.users;
  const supervisorName = Array.isArray(supervisorUser)
    ? supervisorUser[0]?.full_name
    : supervisorUser?.full_name || 'Designated by Host';

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <ScrollView contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Profile Header */}
        <View style={s.header}>
          <View style={s.logoContainer}>
            <Image
              source={require('../../../assets/logo.png')}
              style={s.logo}
              resizeMode="contain"
            />
          </View>
          <Text style={s.name}>{profile?.student?.users?.full_name || profile?.user?.email || 'Student Trainee'}</Text>
          <Text style={s.email}>{profile?.user?.email}</Text>
          <View style={s.badge}>
            <Text style={s.badgeText}>{profile?.student?.course || 'BSIT'} • 4th Year Intern</Text>
          </View>
        </View>

        {/* Academic Details Card */}
        <View style={s.card}>
          <Text style={s.cardTitle}>Academic Standing</Text>
          <View style={s.row}>
            <Text style={s.label}>Student Number</Text>
            <Text style={s.value}>{profile?.student?.student_number || 'N/A'}</Text>
          </View>
          <View style={s.divider} />
          <View style={s.row}>
            <Text style={s.label}>Institution</Text>
            <Text style={s.value}>Colegio de Montalban</Text>
          </View>
          <View style={s.divider} />
          <View style={s.row}>
            <Text style={s.label}>Department</Text>
            <Text style={s.value}>{departmentName}</Text>
          </View>
          <View style={s.divider} />
          <View style={s.row}>
            <Text style={s.label}>Required Practicum</Text>
            <Text style={s.valueBold}>486.0 Hours</Text>
          </View>
        </View>

        {/* Host Training Establishment Card */}
        <View style={s.card}>
          <Text style={s.cardTitle}>Host Training Placement</Text>
          <View style={s.row}>
            <Text style={s.label}>Company</Text>
            <Text style={s.value}>{profile?.assignment?.companies?.company_name || 'Assignment Pending'}</Text>
          </View>
          <View style={s.divider} />
          <View style={s.row}>
            <Text style={s.label}>Supervisor</Text>
            <Text style={s.value}>{supervisorName}</Text>
          </View>
        </View>

        {/* Account Security & Password Card */}
        <View style={s.card}>
          <TouchableOpacity
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
            onPress={() => setShowSecurity(!showSecurity)}
            activeOpacity={0.7}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Ionicons name="key-outline" size={16} color="#0A3824" />
              <Text style={s.cardTitleNoMargin}>Account Security & Password</Text>
            </View>
            <Ionicons name={showSecurity ? 'chevron-up' : 'chevron-down'} size={18} color="#526257" />
          </TouchableOpacity>

          {showSecurity && (
            <View style={{ marginTop: 14 }}>
              <Text style={s.label}>Current Password</Text>
              <View style={s.passwordContainer}>
                <TextInput
                  style={s.passwordInput}
                  value={currentPassword}
                  onChangeText={setCurrentPassword}
                  placeholder="Enter current password..."
                  placeholderTextColor="#879687"
                  secureTextEntry={!showCurrent}
                />
                <TouchableOpacity onPress={() => setShowCurrent(!showCurrent)} style={s.eyeButton}>
                  <Ionicons name={showCurrent ? 'eye-off-outline' : 'eye-outline'} size={16} color="#526257" />
                </TouchableOpacity>
              </View>

              <Text style={s.label}>New Password</Text>
              <View style={s.passwordContainer}>
                <TextInput
                  style={s.passwordInput}
                  value={newPassword}
                  onChangeText={setNewPassword}
                  placeholder="Min. 8 characters..."
                  placeholderTextColor="#879687"
                  secureTextEntry={!showNew}
                />
                <TouchableOpacity onPress={() => setShowNew(!showNew)} style={s.eyeButton}>
                  <Ionicons name={showNew ? 'eye-off-outline' : 'eye-outline'} size={16} color="#526257" />
                </TouchableOpacity>
              </View>

              {newPassword.length > 0 && (
                <View style={{ marginBottom: 12 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                    <Text style={{ fontSize: 10, color: '#526257' }}>Strength:</Text>
                    <Text style={{ fontSize: 10, fontWeight: '700', color: strength <= 25 ? '#e11d48' : strength <= 50 ? '#d97706' : strength <= 75 ? '#2563eb' : '#059669' }}>
                      {strength <= 25 ? 'Weak' : strength <= 50 ? 'Fair' : strength <= 75 ? 'Good' : 'Strong'}
                    </Text>
                  </View>
                  <View style={{ height: 4, backgroundColor: '#F4F6F2', borderRadius: 2, overflow: 'hidden' }}>
                    <View
                      style={{
                        height: '100%',
                        width: `${strength}%`,
                        backgroundColor: strength <= 25 ? '#e11d48' : strength <= 50 ? '#d97706' : strength <= 75 ? '#2563eb' : '#059669',
                      }}
                    />
                  </View>
                </View>
              )}

              <Text style={s.label}>Confirm New Password</Text>
              <View style={s.passwordContainer}>
                <TextInput
                  style={s.passwordInput}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  placeholder="Confirm new password..."
                  placeholderTextColor="#879687"
                  secureTextEntry={!showConfirm}
                />
                <TouchableOpacity onPress={() => setShowConfirm(!showConfirm)} style={s.eyeButton}>
                  <Ionicons name={showConfirm ? 'eye-off-outline' : 'eye-outline'} size={16} color="#526257" />
                </TouchableOpacity>
              </View>

              {!!pwdMsg && (
                <View style={pwdMsg.type === 'success' ? s.alertSuccess : s.alertError}>
                  <Text style={pwdMsg.type === 'success' ? s.alertSuccessText : s.alertErrorText}>
                    {pwdMsg.text}
                  </Text>
                </View>
              )}

              <TouchableOpacity
                style={s.savePwdBtn}
                onPress={handlePasswordChange}
                disabled={pwdLoading}
                activeOpacity={0.85}
              >
                {pwdLoading ? (
                  <ActivityIndicator color="#E4DBC4" size="small" />
                ) : (
                  <Text style={s.savePwdBtnText}>Update Password</Text>
                )}
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* System Status Notice */}
        <View style={s.infoCard}>
          <Ionicons name="shield-checkmark-outline" size={16} color="#0A3824" />
          <Text style={s.infoText}>Colegio de Montalban OJT Practicum Platform</Text>
        </View>

        {/* Single Dedicated Sign Out Button */}
        <TouchableOpacity style={s.signOutBtn} onPress={handleSignOut} disabled={loggingOut} activeOpacity={0.85}>
          {loggingOut ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons name="log-out-outline" size={18} color="#ffffff" />
              <Text style={s.signOutBtnText}>Sign Out</Text>
            </View>
          )}
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F4F6F2' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scrollContent: { padding: 20, paddingBottom: 40 },
  header: {
    backgroundColor: '#092E1D',
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(228,219,196,0.3)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
  },
  logoContainer: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#ffffff',
    padding: 3,
    borderWidth: 2.5,
    borderColor: '#E4DBC4',
    marginBottom: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: { width: '100%', height: '100%', borderRadius: 32 },
  name: { fontSize: 18, fontWeight: '800', color: '#ffffff', textAlign: 'center', marginBottom: 2 },
  email: { fontSize: 12, color: '#879687', textAlign: 'center', marginBottom: 12 },
  badge: {
    backgroundColor: 'rgba(228,219,196,0.15)',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(228,219,196,0.4)',
  },
  badgeText: { fontSize: 11, fontWeight: '800', color: '#E4DBC4', textTransform: 'uppercase', letterSpacing: 0.5 },
  card: {
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
  cardTitle: { fontSize: 11, fontWeight: '800', color: '#0A3824', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 14 },
  cardTitleNoMargin: { fontSize: 11, fontWeight: '800', color: '#0A3824', textTransform: 'uppercase', letterSpacing: 0.5 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  label: { fontSize: 12, color: '#526257', fontWeight: '600', marginBottom: 4 },
  value: { fontSize: 13, fontWeight: '700', color: '#26372D', flex: 1, textAlign: 'right' },
  valueBold: { fontSize: 14, fontWeight: '900', color: '#0A3824' },
  divider: { height: 1, backgroundColor: '#F4F6F2', marginVertical: 10 },
  passwordContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#DCE5DB',
    borderRadius: 12,
    backgroundColor: '#F7F9F5',
    marginBottom: 12,
    paddingRight: 8,
  },
  passwordInput: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 13,
    color: '#18271D',
  },
  eyeButton: { padding: 4 },
  savePwdBtn: {
    backgroundColor: '#0A3824',
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: 'center',
    marginTop: 4,
  },
  savePwdBtnText: { color: '#E4DBC4', fontWeight: '800', fontSize: 13 },
  alertError: {
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
    borderRadius: 8,
    padding: 10,
    marginBottom: 10,
  },
  alertErrorText: { fontSize: 11, color: '#dc2626', fontWeight: '600' },
  alertSuccess: {
    backgroundColor: '#ecfdf5',
    borderWidth: 1,
    borderColor: '#a7f3d0',
    borderRadius: 8,
    padding: 10,
    marginBottom: 10,
  },
  alertSuccessText: { fontSize: 11, color: '#047857', fontWeight: '700' },
  infoCard: {
    backgroundColor: 'rgba(10,56,36,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(10,56,36,0.15)',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  infoText: { fontSize: 11, color: '#0A3824', fontWeight: '700', textAlign: 'center' },
  signOutBtn: {
    backgroundColor: '#e11d48',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#e11d48',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 3,
  },
  signOutBtnText: { color: '#ffffff', fontSize: 14, fontWeight: '800' },
});
