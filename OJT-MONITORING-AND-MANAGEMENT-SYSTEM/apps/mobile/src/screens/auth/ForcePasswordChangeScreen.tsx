import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { completeForcedPasswordChange, signOut } from '../../services/auth';

export default function ForcePasswordChangeScreen({ onDone }: { onDone: () => void }) {
  const insets = useSafeAreaInsets();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit() {
    if (password.length < 8) return setError('Password must be at least 8 characters.');
    if (password !== confirm) return setError('Passwords do not match.');
    setBusy(true);
    setError('');
    const result = await completeForcedPasswordChange(password);
    setBusy(false);
    if (result.error) return setError(result.error.message);
    onDone();
  }

  return (
    <View style={[s.container, { paddingTop: insets.top + 32 }]}>
      <Text style={s.title}>Choose a new password</Text>
      <Text style={s.body}>
        Your password was set by your OJT Coordinator. Choose your own password to continue.
      </Text>
      <TextInput style={s.input} placeholder="New password" secureTextEntry autoCapitalize="none"
        value={password} onChangeText={setPassword} />
      <TextInput style={s.input} placeholder="Confirm new password" secureTextEntry autoCapitalize="none"
        value={confirm} onChangeText={setConfirm} />
      {!!error && <Text style={s.error}>{error}</Text>}
      <TouchableOpacity style={s.button} onPress={submit} disabled={busy}>
        {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.buttonText}>Update Password</Text>}
      </TouchableOpacity>
      <TouchableOpacity onPress={() => void signOut()} disabled={busy}>
        <Text style={s.link}>Sign out</Text>
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F6F2', paddingHorizontal: 24 },
  title: { fontSize: 22, fontWeight: '700', color: '#0A3824', marginBottom: 8 },
  body: { fontSize: 14, color: '#475569', marginBottom: 20 },
  input: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#CBD5E1', borderRadius: 12, padding: 14, marginBottom: 12, fontSize: 15 },
  error: { color: '#B91C1C', marginBottom: 12, fontSize: 13 },
  button: { backgroundColor: '#0A3824', borderRadius: 12, padding: 16, alignItems: 'center', marginBottom: 16 },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  link: { color: '#0A3824', textAlign: 'center', fontWeight: '600' },
});
