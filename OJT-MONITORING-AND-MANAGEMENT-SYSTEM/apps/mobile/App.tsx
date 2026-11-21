import { clearAttendanceIdentity } from './src/lib/attendanceCache';
import { useEffect, useRef, useState } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { supabase } from './src/lib/supabase';
import AuthNavigator from './src/navigation/AuthNavigator';
import StudentNavigator from './src/navigation/StudentNavigator';
import ForcePasswordChangeScreen from './src/screens/auth/ForcePasswordChangeScreen';
import { getAuthUser } from './src/services/auth';
import { signOut } from './src/services/auth';
import { getPin } from './src/lib/pinAuth';
import PinScreen from './src/screens/auth/PinScreen';
import type { AuthUser } from '@ojt/shared';

export default function App() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [gate, setGate] = useState<'setup' | 'unlock' | 'open'>('open');
  const unlocked = useRef(false);

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
          if (profile?.role === 'Student' && profile.account_status === 'active')
            setGate(profile.must_change_password || unlocked.current ? 'open' : await getPin(profile.user_id) ? 'unlock' : 'setup');
          else setGate('open');
        }
      } catch {
        if (!cancelled) setUser(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void refreshUser(true).finally(() => { bootstrapping = false; });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        unlocked.current = false;
        setUser(null);
        setGate('open');
        void clearAttendanceIdentity();
      } else if (event === 'SIGNED_IN' && !bootstrapping) {
        // Supabase calls listeners under its auth lock. Query after it releases.
        setTimeout(() => { if (!cancelled) void refreshUser(); }, 0);
      }
    });

    return () => { cancelled = true; subscription.unsubscribe(); };
  }, [reloadKey]);

  return (
    <SafeAreaProvider>
      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color="#0A3824" />
        </View>
      ) : (
        <NavigationContainer>
          {user && user.account_status === 'active' && user.role === 'Student' && !user.must_change_password && gate !== 'open'
            ? <PinScreen userId={user.user_id} mode={gate} onExit={async () => { await signOut(); }} onUnlock={async () => {
              unlocked.current = true;
              try {
                const { error } = await supabase.auth.refreshSession();
                if (error) {
                  if (error.name === 'AuthRetryableFetchError') throw error;
                  await signOut(); return;
                }
                const profile = await getAuthUser();
                if (!profile || profile.user_id !== user.user_id || profile.role !== 'Student' || profile.account_status !== 'active') {
                  await signOut(); return;
                }
                setUser(profile); setGate('open');
              } catch (error) {
                unlocked.current = false;
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
