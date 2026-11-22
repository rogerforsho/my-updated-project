import { useEffect, useRef, useState } from 'react';
import { Switch, Text, View } from 'react-native';
import PinPad, { PinPadLink } from '../../components/PinPad';
import { colors, fonts } from '../../theme';
import { authenticateBiometrics, biometricsAvailable, getPin, setBiometrics, setPin, validPin, verifyPin } from '../../lib/pinAuth';

const MAX_TRIES = 5;

// setup: create the PIN once after the first sign-in. unlock: ask for it when the student returns to the app.
export default function PinScreen({ userId, mode, name, email, onUnlock, onExit }: {
  userId: string; mode: 'setup' | 'unlock'; name?: string; email?: string;
  onUnlock: () => Promise<void>;
  onExit: () => Promise<void>; // Forgot PIN / Not you? / too many wrong PINs: full sign-out
}) {
  const [first, setFirst] = useState('');
  const [error, setError] = useState('');
  const [canUseBio, setCanUseBio] = useState(false);
  const [bioEnabled, setBioEnabled] = useState(false);
  const [enableBio, setEnableBio] = useState(false);
  const bioRunning = useRef(false);

  async function biometricUnlock() {
    if (bioRunning.current) return;
    bioRunning.current = true;
    try {
      if (await authenticateBiometrics()) await onUnlock();
    } catch { setError('Fingerprint unlock unavailable. Use your PIN.'); }
    finally { bioRunning.current = false; }
  }

  useEffect(() => {
    let alive = true;
    (async () => {
      const available = await biometricsAvailable().catch(() => false);
      const record = mode === 'unlock' ? await getPin(userId) : null;
      if (!alive) return;
      setCanUseBio(available);
      setBioEnabled(!!record?.biometrics);
      if (mode === 'unlock' && available && record?.biometrics) void biometricUnlock(); // like GCash, ask right away
    })().catch(() => {});
    return () => { alive = false; };
  }, []);

  async function handleComplete(pin: string): Promise<'error' | void> {
    setError('');
    if (mode === 'setup') {
      if (!first) {
        if (!validPin(pin)) { setError('Choose a less predictable PIN. Not 1234 or 1111.'); return 'error'; }
        setFirst(pin);
        return;
      }
      if (pin !== first) { setFirst(''); setError('PINs did not match. Start again.'); return 'error'; }
      try {
        await setPin(userId, pin);
        if (canUseBio && enableBio) await setBiometrics(userId, true);
        await onUnlock();
      } catch { setError('Could not save your PIN. Check your connection and try again.'); return 'error'; }
      return;
    }
    try {
      const result = await verifyPin(userId, pin);
      if (result === 'locked') { await onExit(); return; }
      if (result === 'wrong') {
        const left = MAX_TRIES - ((await getPin(userId))?.failures ?? 0);
        setError(`Incorrect PIN. ${left} ${left === 1 ? 'try' : 'tries'} left.`);
        return 'error';
      }
      await onUnlock();
    } catch { setError('Could not unlock. Check your connection and try again.'); return 'error'; }
  }

  const setup = mode === 'setup';
  return (
    <PinPad
      title={setup ? (first ? 'Confirm your PIN' : 'Create your PIN') : 'Enter your PIN'}
      subtitle={setup ? 'Four digits that unlock your account on this phone.' : undefined}
      error={error}
      account={!setup && name ? { name, email, onSwitch: () => void onExit() } : undefined}
      onBiometric={!setup && canUseBio && bioEnabled ? () => void biometricUnlock() : undefined}
      onComplete={handleComplete}
      extra={setup && canUseBio ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <Text style={{ fontFamily: fonts.bold, fontSize: 14, color: '#FFFFFF' }}>Use fingerprint or face unlock</Text>
          <Switch
            value={enableBio}
            onValueChange={setEnableBio}
            trackColor={{ true: colors.sand, false: 'rgba(255,255,255,0.25)' }}
            thumbColor="#FFFFFF"
            accessibilityLabel="Use fingerprint or face unlock"
          />
        </View>
      ) : undefined}
      footer={!setup ? <PinPadLink label="Forgot PIN?" onPress={() => void onExit()} /> : undefined}
    />
  );
}
