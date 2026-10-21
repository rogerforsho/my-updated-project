import { Linking } from 'react-native';
import { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  StyleSheet,
  Image,
} from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { AuthStackParamList } from '../../navigation/types';
import { requestStudentPasswordReset, signIn, signOut } from '../../services/auth';
import { supabase } from '../../lib/supabase';
import { parseStudentPasswordRecoveryUrl } from '../../lib/authRecoveryLink';
import NetworkToast from '../../components/NetworkToast';

type Props = {
  navigation: NativeStackNavigationProp<AuthStackParamList, 'SignIn'>;
};

interface RememberedProfile {
  full_name: string;
  email: string;
  role: string;
}

const REMEMBERED_KEY = 'ojt_mobile_remembered_profile';

export default function SignInScreen({ navigation }: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isSlow, setIsSlow] = useState(false);
  const [error, setError] = useState('');

  // Quick Login / Remembered Profile State
  const [rememberedProfile, setRememberedProfile] = useState<RememberedProfile | null>(null);
  const [useAnotherAccount, setUseAnotherAccount] = useState(false);

  // Forgot Password / Account Recovery State
  const [showForgot, setShowForgot] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [resetMsg, setResetMsg] = useState('');
  const [recoveryLinkReady, setRecoveryLinkReady] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');

  useEffect(() => {
    let active = true;
    async function handleRecoveryUrl(url: string | null) {
      if (!url) return;
      try {
        const recovery = parseStudentPasswordRecoveryUrl(url);
        if (!recovery) return;
        if (recovery.error) throw new Error(recovery.error);
        if (recovery.code) {
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(recovery.code);
          if (exchangeError) throw exchangeError;
        } else {
          if (!recovery.accessToken || !recovery.refreshToken) return;
          const { error: sessionError } = await supabase.auth.setSession({ access_token: recovery.accessToken, refresh_token: recovery.refreshToken });
          if (sessionError) throw sessionError;
        }
        const { data: { session } } = await supabase.auth.getSession();
        if (!session || !active) throw new Error('This reset link is invalid or has expired. Request a new one.');
        setRecoveryLinkReady(true);
        setShowForgot(false);
        setResetMsg('');
      } catch (error) {
        if (active) setResetMsg(error instanceof Error ? error.message : 'This reset link is invalid or has expired. Request a new one.');
        setShowForgot(true);
      }
    }
    Linking.getInitialURL().then(handleRecoveryUrl).catch(() => {});
    const subscription = Linking.addEventListener('url', ({ url }) => { void handleRecoveryUrl(url); });
    return () => { active = false; subscription.remove(); };
  }, []);

  const slowTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Load remembered profile from secure storage on launch
    SecureStore.getItemAsync(REMEMBERED_KEY)
      .then((stored) => {
        if (stored) {
          try {
            const parsed = JSON.parse(stored);
            if (parsed && parsed.email) {
              setRememberedProfile(parsed);
              setEmail(parsed.email);
            }
          } catch (e) {
            console.error('Failed to parse remembered profile:', e);
          }
        }
      })
      .catch(() => {});
  }, []);

  async function handleSignIn() {
    setError('');
    setIsSlow(false);

    if (slowTimerRef.current) clearTimeout(slowTimerRef.current);
    slowTimerRef.current = setTimeout(() => {
      setIsSlow(true);
    }, 2000);

    setLoading(true);

    const targetEmail = rememberedProfile && !useAnotherAccount ? rememberedProfile.email : email;
    const result = await signIn({ email: targetEmail, password });

    if (slowTimerRef.current) clearTimeout(slowTimerRef.current);
    setLoading(false);
    setIsSlow(false);

    if (result.error) {
      setError(result.error.message);
    } else if (result.data) {
      if (result.data.account_status === 'rejected' && result.data.role === 'Student') {
        navigation.replace('Resubmit');
        return;
      }
      // Save profile for quick login next time
      const profileToSave: RememberedProfile = {
        full_name: result.data.full_name,
        email: result.data.email,
        role: result.data.role,
      };
      setRememberedProfile(profileToSave);
      SecureStore.setItemAsync(REMEMBERED_KEY, JSON.stringify(profileToSave)).catch(() => {});
    }
  }

  async function handleRemoveRememberedProfile() {
    await SecureStore.deleteItemAsync(REMEMBERED_KEY).catch(() => {});
    setRememberedProfile(null);
    setUseAnotherAccount(true);
    setEmail('');
    setPassword('');
  }

  async function handleReset() {
    setResetLoading(true);
    setResetMsg('');
    const result = await requestStudentPasswordReset(email);
    setResetLoading(false);
    setResetMsg(result.error?.message ?? result.data?.message ?? 'If an eligible student account uses that email, a one-time reset link will be sent.');
  }

  async function handleSaveRecoveredPassword() {
    setResetMsg('');
    if (newPassword.length < 12) { setResetMsg('Use at least 12 characters.'); return; }
    if (newPassword !== confirmNewPassword) { setResetMsg('Passwords do not match.'); return; }
    setResetLoading(true);
    const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
    if (updateError) {
      setResetLoading(false);
      setResetMsg('Password could not be updated. Request a new reset link and try again.');
      return;
    }
    await signOut();
    setResetLoading(false);
    setRecoveryLinkReady(false);
    setNewPassword('');
    setConfirmNewPassword('');
    setResetMsg('Password updated. Sign in with your new password.');
  }

  if (recoveryLinkReady) return (
    <View style={[s.root, { justifyContent: 'center', padding: 24 }]}>
      <View style={s.card}>
        <Text style={s.title}>Choose a new password</Text>
        <Text style={s.subtitle}>Use at least 12 characters. This password is for your student mobile account.</Text>
        <Text style={s.label}>New password</Text>
        <TextInput style={s.input} value={newPassword} onChangeText={setNewPassword} secureTextEntry autoCapitalize="none" autoComplete="new-password" />
        <Text style={s.label}>Confirm new password</Text>
        <TextInput style={s.input} value={confirmNewPassword} onChangeText={setConfirmNewPassword} secureTextEntry autoCapitalize="none" autoComplete="new-password" />
        {!!resetMsg && <Text style={s.alertErrorText}>{resetMsg}</Text>}
        <TouchableOpacity style={s.btn} onPress={handleSaveRecoveredPassword} disabled={resetLoading}>
          {resetLoading ? <ActivityIndicator color="#E4DBC4" /> : <Text style={s.btnText}>Save Password</Text>}
        </TouchableOpacity>
      </View>
    </View>
  );

  if (showForgot) return (
    <View style={[s.root, { justifyContent: 'center', padding: 24 }]}>
      <View style={s.card}>
        <Text style={s.title}>Reset your password</Text>
        <Text style={s.subtitle}>Request a one-time reset link using your registered student email. Your password will be changed inside this app.</Text>
        <Text style={s.label}>Registered student email</Text>
        <TextInput style={s.input} value={email} onChangeText={setEmail} placeholder="student@cdm.edu.ph" placeholderTextColor="#879687" keyboardType="email-address" autoCapitalize="none" />
        {!!resetMsg && <Text style={s.alertErrorText}>{resetMsg}</Text>}
        <TouchableOpacity style={s.btn} onPress={handleReset} disabled={resetLoading}>
          {resetLoading ? <ActivityIndicator color="#E4DBC4" /> : <Text style={s.btnText}>Send Reset Link</Text>}
        </TouchableOpacity>
        <TouchableOpacity style={s.linkContainer} onPress={() => { setShowForgot(false); setResetMsg(''); }}>
          <Text style={s.link}>Return to Sign In</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  // VIEW 2: Remembered Account Quick Login Card (Like Google / Facebook)
  if (rememberedProfile && !useAnotherAccount) {
    const firstName = rememberedProfile.full_name.split(' ')[0] || 'User';

    return (
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={s.root}>
        <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
          <View style={s.inner}>
            <View style={s.brand}>
              <View style={s.logoContainer}>
                <Image source={require('../../../assets/logo.png')} style={s.logo} resizeMode="contain" />
              </View>
              <Text style={s.brandTitle}>Colegio de Montalban</Text>
              <Text style={s.brandSub}>OJT Monitoring & Management System</Text>
              <View style={s.badge}>
                <Text style={s.badgeText}>ICS • IBE Trainee Portal</Text>
              </View>
            </View>

            <View style={s.card}>
              {/* Profile Avatar Card */}
              <View style={s.quickProfileContainer}>
                <View style={s.quickAvatar}>
                  <Text style={s.quickAvatarText}>
                    {firstName.charAt(0).toUpperCase()}
                  </Text>
                </View>
                <Text style={s.quickName}>{rememberedProfile.full_name}</Text>
                <Text style={s.quickEmail}>{rememberedProfile.email}</Text>
                <View style={s.quickBadge}>
                  <Text style={s.quickBadgeText}>{rememberedProfile.role}</Text>
                </View>
              </View>

              <Text style={s.label}>Password for {firstName}</Text>
              <View style={s.passwordContainer}>
                <TextInput
                  style={s.passwordInput}
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Enter password..."
                  placeholderTextColor="#879687"
                  secureTextEntry={!showPassword}
                  autoFocus={true}
                />
                <TouchableOpacity
                  onPress={() => setShowPassword(!showPassword)}
                  style={s.eyeButton}
                  activeOpacity={0.7}
                >
                  <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={18} color="#526257" />
                </TouchableOpacity>
              </View>

              {!!error && (
                <View style={s.alertError}><Text style={s.alertErrorText}>{error}</Text></View>
              )}

              <TouchableOpacity style={s.btn} onPress={handleSignIn} disabled={loading} activeOpacity={0.85}>
                {loading ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <ActivityIndicator size="small" color="#E4DBC4" />
                    <Text style={s.btnText}>
                      {isSlow ? 'Connecting to CdM servers...' : 'Authenticating...'}
                    </Text>
                  </View>
                ) : (
                  <Text style={s.btnText}>Continue as {firstName}</Text>
                )}
              </TouchableOpacity>

              <View style={s.row}>
                <TouchableOpacity onPress={() => setUseAnotherAccount(true)}>
                  <Text style={s.link}>Use Another Account</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleRemoveRememberedProfile}>
                  <Text style={s.linkMuted}>Remove Profile</Text>
                </TouchableOpacity>
              </View>
            </View>

            <Text style={s.footnote}>ISO/IEC 25010:2023 Evaluated • Version 1.0</Text>
          </View>
        </ScrollView>
        <NetworkToast isSlow={isSlow} />
      </KeyboardAvoidingView>
    );
  }

  // VIEW 3: Standard Clean Sign-In Form
  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={s.root}>
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
        <View style={s.inner}>
          {/* Institutional Brand Header */}
          <View style={s.brand}>
            <View style={s.logoContainer}>
              <Image source={require('../../../assets/logo.png')} style={s.logo} resizeMode="contain" />
            </View>
            <Text style={s.brandTitle}>Colegio de Montalban</Text>
            <Text style={s.brandSub}>OJT Monitoring & Management System</Text>
            <View style={s.badge}>
              <Text style={s.badgeText}>ICS • IBE Trainee Portal</Text>
            </View>
          </View>

          {/* Action Card */}
          <View style={s.card}>
            <Text style={s.title}>Sign In</Text>
            <Text style={s.subtitle}>Enter your institutional credentials to continue.</Text>

            <Text style={s.label}>Institutional Email</Text>
            <TextInput
              style={s.input}
              value={email}
              onChangeText={setEmail}
              placeholder="username@cdm.edu.ph"
              placeholderTextColor="#879687"
              keyboardType="email-address"
              autoCapitalize="none"
            />

            <Text style={s.label}>Password</Text>
            <View style={s.passwordContainer}>
              <TextInput
                style={s.passwordInput}
                value={password}
                onChangeText={setPassword}
                placeholder="••••••••"
                placeholderTextColor="#879687"
                secureTextEntry={!showPassword}
              />
              <TouchableOpacity
                onPress={() => setShowPassword(!showPassword)}
                style={s.eyeButton}
                activeOpacity={0.7}
              >
                <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={18} color="#526257" />
              </TouchableOpacity>
            </View>

            {!!error && (
              <View style={s.alertError}><Text style={s.alertErrorText}>{error}</Text></View>
            )}

            <TouchableOpacity style={s.btn} onPress={handleSignIn} disabled={loading} activeOpacity={0.85}>
              {loading ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <ActivityIndicator size="small" color="#E4DBC4" />
                  <Text style={s.btnText}>
                    {isSlow ? 'Connecting to CdM servers...' : 'Authenticating...'}
                  </Text>
                </View>
              ) : (
                <Text style={s.btnText}>Sign In</Text>
              )}
            </TouchableOpacity>

            <View style={s.row}>
              <TouchableOpacity onPress={() => navigation.navigate('Register')}>
                <Text style={s.link}>Student Registration</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setShowForgot(true)}>
                <Text style={s.linkMuted}>Forgot password?</Text>
              </TouchableOpacity>
            </View>

            {rememberedProfile && useAnotherAccount && (
              <TouchableOpacity
                onPress={() => setUseAnotherAccount(false)}
                style={{ marginTop: 14, alignItems: 'center' }}
              >
                <Text style={{ fontSize: 12, color: '#0A3824', fontWeight: '700' }}>
                  ← Back to {rememberedProfile.full_name.split(' ')[0]}'s Account
                </Text>
              </TouchableOpacity>
            )}
          </View>

          {/* System Evaluation Footnote */}
          <Text style={s.footnote}>ISO/IEC 25010:2023 Evaluated • Version 1.0</Text>
        </View>
      </ScrollView>
      <NetworkToast isSlow={isSlow} />
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#092E1D' },
  inner: { flex: 1, justifyContent: 'center', paddingHorizontal: 22, paddingVertical: 40 },
  brand: { alignItems: 'center', marginBottom: 24 },
  logoContainer: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: '#ffffff',
    padding: 3,
    borderWidth: 2.5,
    borderColor: '#E4DBC4',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 8,
  },
  logo: { width: '100%', height: '100%', borderRadius: 32 },
  brandTitle: { fontSize: 20, fontWeight: '900', color: '#E4DBC4', letterSpacing: 0.5 },
  brandSub: { fontSize: 13, fontWeight: '700', color: '#ffffff', marginTop: 2 },
  badge: {
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 3,
    borderRadius: 20,
    backgroundColor: 'rgba(6,36,21,0.8)',
    borderWidth: 1,
    borderColor: 'rgba(228,219,196,0.4)',
  },
  badgeText: { fontSize: 11, fontWeight: '700', color: '#E4DBC4' },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 22,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 10,
  },
  title: { fontSize: 22, fontWeight: '800', color: '#0A3824', marginBottom: 2 },
  subtitle: { fontSize: 12, color: '#526257', marginBottom: 18 },
  label: { fontSize: 12, fontWeight: '700', color: '#26372D', marginBottom: 4 },
  input: {
    borderWidth: 1.5,
    borderColor: '#DCE5DB',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: '#18271D',
    marginBottom: 14,
    backgroundColor: '#F7F9F5',
  },
  passwordContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#DCE5DB',
    borderRadius: 12,
    backgroundColor: '#F7F9F5',
    marginBottom: 14,
    paddingRight: 10,
  },
  passwordInput: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: '#18271D',
  },
  eyeButton: { padding: 4 },
  btn: {
    backgroundColor: '#0A3824',
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
    marginBottom: 14,
    borderWidth: 1,
    borderColor: 'rgba(228,219,196,0.3)',
    shadowColor: '#0A3824',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  btnText: { color: '#E4DBC4', fontWeight: '800', fontSize: 15, letterSpacing: 0.5 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
  link: { fontSize: 12, color: '#0A3824', fontWeight: '700' },
  linkMuted: { fontSize: 12, color: '#526257', fontWeight: '600' },
  linkContainer: { alignItems: 'center', marginTop: 8 },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#F4F6F2',
    borderRadius: 10,
    padding: 3,
    marginBottom: 14,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 8,
  },
  tabButtonActive: {
    backgroundColor: '#ffffff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  tabText: { fontSize: 12, fontWeight: '600', color: '#526257' },
  tabTextActive: { color: '#0A3824', fontWeight: '800' },
  infoNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#fefce8',
    borderWidth: 1,
    borderColor: '#fef08a',
    borderRadius: 10,
    padding: 10,
    gap: 8,
    marginBottom: 14,
  },
  infoNoticeText: { fontSize: 11, color: '#854d0e', flex: 1, lineHeight: 16 },
  quickProfileContainer: {
    alignItems: 'center',
    marginBottom: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderColor: '#F4F6F2',
  },
  quickAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#0A3824',
    borderWidth: 2,
    borderColor: '#E4DBC4',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  quickAvatarText: { color: '#E4DBC4', fontSize: 22, fontWeight: '900' },
  quickName: { fontSize: 17, fontWeight: '800', color: '#18271D' },
  quickEmail: { fontSize: 12, color: '#526257', marginTop: 1 },
  quickBadge: {
    marginTop: 6,
    backgroundColor: '#ecfdf5',
    borderWidth: 1,
    borderColor: '#a7f3d0',
    paddingHorizontal: 10,
    paddingVertical: 2,
    borderRadius: 12,
  },
  quickBadgeText: { fontSize: 10, fontWeight: '800', color: '#047857', textTransform: 'uppercase' },
  alertError: {
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 12,
  },
  alertErrorText: { fontSize: 12, color: '#dc2626', fontWeight: '600' },
  alertSuccess: {
    backgroundColor: 'rgba(10,56,36,0.1)',
    borderWidth: 1,
    borderColor: '#0A3824',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 12,
  },
  alertSuccessText: { fontSize: 12, color: '#0A3824', fontWeight: '700' },
  footnote: {
    textAlign: 'center',
    marginTop: 20,
    fontSize: 11,
    color: 'rgba(255,255,255,0.5)',
    fontWeight: '500',
  },
});
