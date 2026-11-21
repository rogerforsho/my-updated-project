import { useEffect, useState } from 'react';
import { ActivityIndicator, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { authenticateBiometrics, biometricsAvailable, getPin, setBiometrics, setPin, validPin, verifyPin } from '../../lib/pinAuth';

export default function PinScreen({ userId, mode, onUnlock, onExit }: {
  userId: string; mode: 'setup' | 'unlock'; onUnlock: () => Promise<void>; onExit: () => Promise<void>;
}) {
  const [pin, setValue] = useState('');
  const [first, setFirst] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [canUseBio, setCanUseBio] = useState(false);
  const [enableBio, setEnableBio] = useState(false);
  const [bioEnabled, setBioEnabled] = useState(false);
  useEffect(() => {
    let alive = true;
    void biometricsAvailable().then(value => { if (alive) setCanUseBio(value); }).catch(() => {});
    if (mode === 'unlock') void getPin(userId).then(record => { if (alive) setBioEnabled(!!record?.biometrics); });
    return () => { alive = false; };
  }, []);

  async function submit() {
    if (busy) return;
    setError('');
    if (!/^\d{4}$/.test(pin)) { setError('Enter exactly four digits.'); return; }
    if (mode === 'setup') {
      if (!first) {
        if (!validPin(pin)) { setError('Choose a less predictable PIN.'); return; }
        setFirst(pin); setValue(''); return;
      }
      if (pin !== first) { setFirst(''); setValue(''); setError('PINs did not match. Start again.'); return; }
    }
    setBusy(true);
    try {
      if (mode === 'setup') {
        await setPin(userId, pin);
        if (canUseBio && enableBio) await setBiometrics(userId, true);
        await onUnlock();
      } else {
        const result = await verifyPin(userId, pin);
        if (result === 'locked') { await onExit(); return; }
        if (result === 'wrong') { setError('Incorrect PIN. Five attempts require password sign-in.'); return; }
        await onUnlock();
      }
    } catch { setError('Could not unlock. Check your connection and try again.'); }
    finally { setValue(''); setBusy(false); }
  }

  async function biometricUnlock() {
    if (busy) return;
    setBusy(true);
    try {
      if (await authenticateBiometrics()) await onUnlock();
    } catch { setError('Biometric unlock unavailable. Use your PIN.'); }
    finally { setBusy(false); }
  }
  return <View style={{ flex: 1, justifyContent: 'center', padding: 28, backgroundColor: '#F4F6F2', gap: 18 }}>
    <Text style={{ fontSize: 24, fontWeight: '800', color: '#0A3824' }}>{mode === 'setup' ? first ? 'Confirm your PIN' : 'Create a quick-login PIN' : 'Enter 4-digit PIN'}</Text>
    <Text style={{ color: '#526257' }}>{mode === 'setup' ? 'This PIN unlocks your student account on this phone.' : 'Unlock your account to access attendance.'}</Text>
    <TextInput value={pin} onChangeText={value => setValue(value.replace(/\D/g, '').slice(0, 4))} keyboardType="number-pad" secureTextEntry maxLength={4} autoFocus accessibilityLabel="Four-digit PIN" style={{ backgroundColor: 'white', padding: 16, borderRadius: 12, fontSize: 22, letterSpacing: 12, color: '#0A3824' }} />
    {!!error && <Text accessibilityRole="alert" style={{ color: '#b91c1c' }}>{error}</Text>}
    <TouchableOpacity onPress={() => void submit()} disabled={busy} accessibilityRole="button" style={{ backgroundColor: '#0A3824', padding: 16, borderRadius: 12, alignItems: 'center' }}><Text style={{ color: 'white', fontWeight: '700' }}>{busy ? <ActivityIndicator color="white" /> : mode === 'setup' ? first ? 'Save PIN' : 'Continue' : 'Unlock'}</Text></TouchableOpacity>
    {mode === 'setup' && canUseBio && <TouchableOpacity onPress={() => setEnableBio(value => !value)} accessibilityRole="checkbox" accessibilityState={{ checked: enableBio }}><Text style={{ color: '#0A3824' }}>{enableBio ? '☑' : '□'} Enable biometric unlock</Text></TouchableOpacity>}
    {mode === 'unlock' && canUseBio && bioEnabled && <TouchableOpacity onPress={() => void biometricUnlock()} disabled={busy} accessibilityRole="button"><Text style={{ textAlign: 'center', color: '#0A3824' }}>Unlock with biometrics</Text></TouchableOpacity>}
    <TouchableOpacity onPress={() => void onExit()} disabled={busy} accessibilityRole="button"><Text style={{ textAlign: 'center', color: '#526257' }}>Forgot PIN / Switch Account</Text></TouchableOpacity>
  </View>;
}
