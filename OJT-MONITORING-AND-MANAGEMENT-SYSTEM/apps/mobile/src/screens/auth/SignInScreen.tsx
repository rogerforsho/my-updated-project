import { Linking, Pressable, Text } from 'react-native';
import { useState, useEffect, useRef } from 'react';
import * as SecureStore from 'expo-secure-store';
import { colors } from '../../theme';
import { setUnlocked } from '../../lib/pinAuth';
import AuthShell, { a, AuthAlert, AuthFootnote, AuthInput, PasswordInput, PrimaryButton, SecondaryButton } from './AuthShell';
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
  const [resetOk, setResetOk] = useState(false);
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
    // The password proves who this is, so the PIN is not asked right after it. Set before signing in because the
    // SIGNED_IN event reaches App.tsx before signIn returns.
    setUnlocked(true);
    const result = await signIn({ email: targetEmail, password });

    if (slowTimerRef.current) clearTimeout(slowTimerRef.current);
    setLoading(false);
    setIsSlow(false);

    if (result.error) {
      setUnlocked(false);
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
    setResetOk(!result.error);
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


  const firstName = rememberedProfile?.full_name.split(' ')[0] || 'User';
  const loadingLabel = isSlow ? 'Connecting to CdM servers...' : 'Authenticating...';

  if (recoveryLinkReady) return (
    <AuthShell headline="Choose a new password." subline="Use at least 12 characters. This password is for your student mobile account.">
      <PasswordInput label="New password" value={newPassword} onChangeText={setNewPassword} autoComplete="new-password" />
      <PasswordInput label="Confirm new password" value={confirmNewPassword} onChangeText={setConfirmNewPassword} autoComplete="new-password" />
      {!!resetMsg && <AuthAlert message={resetMsg} />}
      <PrimaryButton label="Save Password" onPress={handleSaveRecoveredPassword} loading={resetLoading} />
    </AuthShell>
  );

  if (showForgot) return (
    <AuthShell headline="Reset your password." subline="Request a one-time reset link using your registered student email. Your password will be changed inside this app.">
      <AuthInput label="Registered student email" value={email} onChangeText={setEmail} placeholder="student@cdm.edu.ph" keyboardType="email-address" autoCapitalize="none" autoComplete="email" />
      {!!resetMsg && <AuthAlert message={resetMsg} tone={resetOk ? 'info' : 'error'} />}
      <PrimaryButton label="Send Reset Link" onPress={handleReset} loading={resetLoading} />
      <SecondaryButton label="Return to Sign In" onPress={() => { setShowForgot(false); setResetMsg(''); }} />
    </AuthShell>
  );

  // Remembered account: quick login with the saved name, password only.
  if (rememberedProfile && !useAnotherAccount) return (
    <>
      <AuthShell headline={`Welcome back, ${firstName}.`} subline={rememberedProfile.email}>
        <PasswordInput label={`Password for ${firstName}`} value={password} onChangeText={setPassword} placeholder="Enter password" autoFocus />
        {!!error && <AuthAlert message={error} />}
        <PrimaryButton label={`Continue as ${firstName}`} onPress={handleSignIn} loading={loading} loadingLabel={loadingLabel} />
        <SecondaryButton label="Use another account" onPress={() => setUseAnotherAccount(true)} />
        <Pressable style={a.link} onPress={handleRemoveRememberedProfile} accessibilityRole="button">
          <Text style={[a.linkText, { color: colors.muted }]}>Remove profile</Text>
        </Pressable>
        <AuthFootnote>Version 1.1</AuthFootnote>
      </AuthShell>
      <NetworkToast isSlow={isSlow} />
    </>
  );

  return (
    <>
      <AuthShell headline="Welcome back." subline="Sign in with your institutional email to log attendance and track your hours.">
        <AuthInput label="Institutional email" value={email} onChangeText={setEmail} placeholder="username@cdm.edu.ph" keyboardType="email-address" autoCapitalize="none" autoComplete="email" />
        <PasswordInput label="Password" value={password} onChangeText={setPassword} placeholder="Your password" autoComplete="current-password" />
        {!!error && <AuthAlert message={error} />}
        <PrimaryButton label="Sign In" onPress={handleSignIn} loading={loading} loadingLabel={loadingLabel} />
        <Pressable style={a.link} onPress={() => setShowForgot(true)} accessibilityRole="button">
          <Text style={[a.linkText, { color: colors.muted }]}>Forgot password?</Text>
        </Pressable>
        <SecondaryButton label="New here? Register as a student" onPress={() => navigation.navigate('Register')} />
        {rememberedProfile && useAnotherAccount && (
          <Pressable style={a.link} onPress={() => setUseAnotherAccount(false)} accessibilityRole="button">
            <Text style={a.linkText}>← Back to {firstName}'s account</Text>
          </Pressable>
        )}
        <AuthFootnote>Version 1.1</AuthFootnote>
      </AuthShell>
      <NetworkToast isSlow={isSlow} />
    </>
  );
}
