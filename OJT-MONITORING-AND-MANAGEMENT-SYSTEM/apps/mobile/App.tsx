import { clearAttendanceIdentity } from './src/lib/attendanceCache';
import { useEffect, useState } from 'react';
import { View, ActivityIndicator, StyleSheet, AppState } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { supabase } from './src/lib/supabase';
import AuthNavigator from './src/navigation/AuthNavigator';
import StudentNavigator from './src/navigation/StudentNavigator';
import ForcePasswordChangeScreen from './src/screens/auth/ForcePasswordChangeScreen';
import { getAuthUser } from './src/services/auth';
import { signOut } from './src/services/auth';
import { getPin, isUnlocked, setUnlocked } from './src/lib/pinAuth';
import PinScreen from './src/screens/auth/PinScreen';
import type { AuthUser } from '@ojt/shared';
import { useFonts } from 'expo-font';
import { Outfit_800ExtraBold } from '@expo-google-fonts/outfit';
import { PlusJakartaSans_500Medium, PlusJakartaSans_700Bold } from '@expo-google-fonts/plus-jakarta-sans';

const LOCK_AFTER_MS = 15_000;

export default function App() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [gate, setGate] = useState<'setup' | 'unlock' | 'open'>('open');
  const [fontsLoaded, fontError] = useFonts({ Outfit_800ExtraBold, PlusJakartaSans_500Medium, PlusJakartaSans_700Bold });

  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let bootstrapping = true;
    const refreshUser = async (initial = false) => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const profile = session ? await getAuthUser() : null;
        if (session && profile && session.user.id !== profile.user_id) throw new Error('Stored student does not match the session.');
        if (initial && profile?.role === 'Student' && profile.account_status === 'active' && !profile.must_change_password && !await getPin(profile.user_id)) {
          await signOut();
          if (!cancelled) { setUser(null); setGate('open'); }
          return;
        }
        if (!cancelled) {
          setUser(profile);
          if (profile?.role === 'Student' && profile.account_status === 'active') {
            // No PIN yet: create it once. PIN exists: ask for it unless the student just proved who they are.
            const hasPin = !!await getPin(profile.user_id);
            setGate(profile.must_change_password ? 'open' : !hasPin ? 'setup' : isUnlocked() ? 'open' : 'unlock');
          } else setGate('open');
        }
      } catch {
        if (!cancelled) setUser(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    // Only the first launch signs out a session that has no PIN; after a forced password change the student goes straight to creating one.
    void refreshUser(reloadKey === 0).finally(() => { bootstrapping = false; });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        setUnlocked(false);
        setUser(null);
        setGate('open');
        void clearAttendanceIdentity();
      } else if (event === 'SIGNED_IN' && !bootstrapping) {
        // Supabase calls listeners under its auth lock. Query after it releases.
        setTimeout(() => { if (!cancelled) void refreshUser(); }, 0);
      }
    });

    // Ask for the PIN again when the student comes back after being away. The grace period keeps system
    // permission dialogs (camera, location) and quick app switches from interrupting a time-in.
    let leftAt: number | null = null;
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'background') { leftAt = Date.now(); return; }
      if (state !== 'active' || leftAt === null) return;
      const away = Date.now() - leftAt;
      leftAt = null;
      if (away < LOCK_AFTER_MS) return;
      void (async () => {
        const { data: { session } } = await supabase.auth.getSession();
        if (session && await getPin(session.user.id) && !cancelled) { setUnlocked(false); setGate('unlock'); }
      })().catch(() => {});
    });

    return () => { cancelled = true; subscription.unsubscribe(); appState.remove(); };
  }, [reloadKey]);

  return (
    <SafeAreaProvider>
      {loading || !(fontsLoaded || fontError) ? (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color="#0A3824" />
        </View>
      ) : (
        <NavigationContainer>
          {user && user.account_status === 'active' && user.role === 'Student' && !user.must_change_password && gate !== 'open'
            ? <PinScreen userId={user.user_id} mode={gate} name={user.full_name} email={user.email} onExit={async () => { await signOut({ forgetDevice: true }); }} onUnlock={async () => {
              setUnlocked(true);
              try {
                const { error } = await supabase.auth.refreshSession();
                if (error) {
                  // Offline: the PIN already proved who this is, so open with the stored session; it refreshes once online.
                  if (error.name === 'AuthRetryableFetchError') { setGate('open'); return; }
                  await signOut(); return;
                }
                const profile = await getAuthUser();
                if (!profile || profile.user_id !== user.user_id || profile.role !== 'Student' || profile.account_status !== 'active') {
                  await signOut(); return;
                }
                setUser(profile); setGate('open');
              } catch (error) {
                setUnlocked(false);
                throw error;
              }
            }} />
            : user && user.account_status === 'active' && user.role === 'Student' && user.must_change_password
            ? <ForcePasswordChangeScreen onDone={() => setReloadKey((k) => k + 1)} />
            : user && user.account_status === 'active' && user.role === 'Student'
            ? <StudentNavigator />
            : <AuthNavigator initialRouteName={
              user?.role === 'Student' && user.account_status === 'rejected' ? 'Resubmit'
                : user?.role === 'Student' && user.account_status === 'pending' ? 'Pending'
                  : 'SignIn'
            } />
          }
        </NavigationContainer>
      )}
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, backgroundColor: '#F4F6F2', alignItems: 'center', justifyContent: 'center' },
});
