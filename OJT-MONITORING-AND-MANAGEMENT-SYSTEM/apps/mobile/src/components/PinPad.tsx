import { useRef, useState, type ReactNode } from 'react';
import { Animated, Image, Pressable, ScrollView, StyleSheet, Text, Vibration, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts } from '../theme';

const PIN_LENGTH = 4;
const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

// GCash-style PIN entry: four dots and our own number pad, so the phone keyboard never covers the screen.
// onComplete gets the 4 digits; return 'error' to shake the dots, anything else to just clear them.
export default function PinPad({ title, subtitle, error, extra, footer, account, onBiometric, onClose, onComplete }: {
  title: string;
  subtitle?: string;
  error?: string;
  extra?: ReactNode;
  footer?: ReactNode;
  account?: { name: string; email?: string; onSwitch: () => void };
  onBiometric?: () => void;
  onClose?: () => void;
  onComplete: (pin: string) => Promise<'error' | void>;
}) {
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [digits, setDigits] = useState('');
  const [busy, setBusy] = useState(false);
  const shake = useRef(new Animated.Value(0)).current;
  const size = Math.max(54, Math.min(76, Math.floor((height - 430) / 4)));

  function wrong() {
    try { Vibration.vibrate(120); } catch { /* vibration is a nicety only */ }
    shake.setValue(0);
    Animated.sequence([-10, 10, -8, 8, 0].map(to => Animated.timing(shake, { toValue: to, duration: 55, useNativeDriver: true }))).start();
  }

  async function press(digit: string) {
    if (busy || digits.length >= PIN_LENGTH) return;
    const next = digits + digit;
    setDigits(next);
    if (next.length < PIN_LENGTH) return;
    setBusy(true);
    const result = await onComplete(next).catch((): 'error' => 'error');
    setBusy(false);
    setDigits('');
    if (result === 'error') wrong();
  }

  const key = (children: ReactNode, onPress: () => void, label: string, disabled = false) => (
    <Pressable
      onPress={onPress}
      disabled={disabled || busy}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [p.key, { width: size, height: size, borderRadius: size / 2 }, pressed && p.keyPressed]}
    >{children}</Pressable>
  );
  const spacer = <View style={{ width: size, height: size }} />;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.deep }}
      contentContainerStyle={[p.content, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 16 }]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {onClose && (
        <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" style={p.close}>
          <Ionicons name="close" size={26} color="#FFFFFF" />
        </Pressable>
      )}
      <View style={p.brand}>
        <View style={p.seal}><Image source={require('../../assets/logo.png')} style={{ width: '100%', height: '100%' }} resizeMode="contain" accessible={false} /></View>
        <Text style={p.brandName}>Colegio de Montalban</Text>
      </View>

      {account && (
        <View style={p.account}>
          <View style={{ flex: 1 }}>
            <Text style={p.accountName} numberOfLines={1}>{account.name}</Text>
            {!!account.email && <Text style={p.accountEmail} numberOfLines={1}>{account.email}</Text>}
          </View>
          <Pressable onPress={account.onSwitch} accessibilityRole="button" accessibilityLabel="Not you? Switch account" style={p.switch}>
            <Text style={p.switchText}>Not you?</Text>
          </Pressable>
        </View>
      )}

      <Text style={p.title} accessibilityRole="header">{title}</Text>
      {!!subtitle && <Text style={p.subtitle}>{subtitle}</Text>}

      <Animated.View
        style={[p.dots, { transform: [{ translateX: shake }] }]}
        accessible
        accessibilityLabel={`${digits.length} of ${PIN_LENGTH} digits entered`}
        accessibilityLiveRegion="polite"
      >
        {Array.from({ length: PIN_LENGTH }, (_, i) => <View key={i} style={[p.dot, i < digits.length && p.dotFilled]} />)}
      </Animated.View>
      <Text style={p.error} accessibilityRole="alert" accessibilityLiveRegion="polite">{error || ' '}</Text>

      {extra}

      <View style={p.pad}>
        {[0, 3, 6].map(row => (
          <View key={row} style={p.row}>
            {KEYS.slice(row, row + 3).map(d => <View key={d}>{key(<Text style={[p.digit, { fontSize: size * 0.4 }]}>{d}</Text>, () => void press(d), d)}</View>)}
          </View>
        ))}
        <View style={p.row}>
          {onBiometric
            ? key(<Ionicons name="finger-print" size={size * 0.46} color="#FFFFFF" />, onBiometric, 'Unlock with fingerprint or face')
            : spacer}
          {key(<Text style={[p.digit, { fontSize: size * 0.4 }]}>0</Text>, () => void press('0'), '0')}
          {key(<Ionicons name="backspace-outline" size={size * 0.42} color="#FFFFFF" />, () => setDigits(d => d.slice(0, -1)), 'Delete last digit', digits.length === 0)}
        </View>
      </View>

      {footer}
    </ScrollView>
  );
}

export function PinPadLink({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={p.link}>
      <Text style={p.linkText}>{label}</Text>
    </Pressable>
  );
}

const p = StyleSheet.create({
  content: { flexGrow: 1, alignItems: 'center', paddingHorizontal: 24 },
  close: { position: 'absolute', left: 12, top: 12, width: 44, height: 44, alignItems: 'center', justifyContent: 'center', zIndex: 2 },
  brand: { alignItems: 'center', gap: 10, marginTop: 8 },
  seal: { width: 52, height: 52, borderRadius: 16, backgroundColor: '#FFFFFF', padding: 5 },
  brandName: { fontFamily: fonts.display, fontSize: 20, color: '#FFFFFF' },
  account: { flexDirection: 'row', alignItems: 'center', alignSelf: 'stretch', gap: 8, marginTop: 18, paddingLeft: 16, paddingRight: 6, minHeight: 56, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.12)' },
  accountName: { fontFamily: fonts.bold, fontSize: 15, color: '#FFFFFF' },
  accountEmail: { fontFamily: fonts.body, fontSize: 12, color: 'rgba(255,255,255,0.7)' },
  switch: { minHeight: 44, paddingHorizontal: 14, justifyContent: 'center' },
  switchText: { fontFamily: fonts.bold, fontSize: 13, color: colors.sand },
  title: { fontFamily: fonts.display, fontSize: 24, color: '#FFFFFF', marginTop: 24 },
  subtitle: { fontFamily: fonts.body, fontSize: 14, color: 'rgba(255,255,255,0.7)', marginTop: 4, textAlign: 'center' },
  dots: { flexDirection: 'row', gap: 20, marginTop: 22, height: 20, alignItems: 'center' },
  dot: { width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: 'rgba(255,255,255,0.75)' },
  dotFilled: { backgroundColor: '#FFFFFF', borderColor: '#FFFFFF' },
  error: { fontFamily: fonts.bold, fontSize: 13, color: '#FCA5A5', marginTop: 10, minHeight: 18, textAlign: 'center' },
  pad: { marginTop: 14, gap: 14 },
  row: { flexDirection: 'row', justifyContent: 'center', gap: 22 },
  key: { alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.12)' },
  keyPressed: { backgroundColor: 'rgba(255,255,255,0.28)', transform: [{ scale: 0.95 }] },
  digit: { fontFamily: fonts.display, color: '#FFFFFF' },
  link: { minHeight: 48, paddingHorizontal: 16, justifyContent: 'center', marginTop: 10 },
  linkText: { fontFamily: fonts.bold, fontSize: 14, color: colors.sand },
});
