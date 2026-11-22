import { useRef, useState, type ReactNode } from 'react';
import { Animated, Image, Pressable, ScrollView, StyleSheet, Text, Vibration, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts } from '../theme';

const PIN_LENGTH = 4;
const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

// PIN entry in the same look as the web landing page: off-white ground, big green headline, white cards and keys.
// Our own keypad and four dots, so the phone keyboard never covers the screen.
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
  const size = Math.max(54, Math.min(72, Math.floor((height - 500) / 4)));

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
      style={({ pressed }) => [p.key, { width: size, height: size, borderRadius: size / 2 }, pressed && p.keyPressed, disabled && { opacity: 0.4 }]}
    >{children}</Pressable>
  );
  const spacer = <View style={{ width: size, height: size }} />;
  const digitText = [p.digit, { fontSize: size * 0.4 }];

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={[p.content, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 20 }]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <View style={p.top}>
        <View style={p.brand}>
          <View style={p.seal}><Image source={require('../../assets/logo.png')} style={{ width: '100%', height: '100%' }} resizeMode="contain" accessible={false} /></View>
          <Text style={p.brandName}>Colegio de Montalban</Text>
        </View>
        {onClose && (
          <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" style={p.close}>
            <Ionicons name="close" size={22} color={colors.ink} />
          </Pressable>
        )}
      </View>

      <View style={p.tag}><View style={p.tagDot} /><Text style={p.tagText}>Student practicum · ICS & IBE</Text></View>
      <Text style={p.title} accessibilityRole="header">{title}</Text>
      {!!subtitle && <Text style={p.subtitle}>{subtitle}</Text>}

      {account && (
        <View style={p.account}>
          <View style={{ flex: 1 }}>
            <Text style={p.accountName} numberOfLines={1}>{account.name}</Text>
            {!!account.email && <Text style={p.accountEmail} numberOfLines={1}>{account.email}</Text>}
          </View>
          <Pressable onPress={account.onSwitch} accessibilityRole="button" accessibilityLabel="Not you? Switch account" style={({ pressed }) => [p.switch, pressed && p.keyPressed]}>
            <Text style={p.switchText}>Not you?</Text>
          </Pressable>
        </View>
      )}

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
            {KEYS.slice(row, row + 3).map(d => <View key={d}>{key(<Text style={digitText}>{d}</Text>, () => void press(d), d)}</View>)}
          </View>
        ))}
        <View style={p.row}>
          {onBiometric
            ? key(<Ionicons name="finger-print" size={size * 0.46} color={colors.ink} />, onBiometric, 'Unlock with fingerprint or face')
            : spacer}
          {key(<Text style={digitText}>0</Text>, () => void press('0'), '0')}
          {key(<Ionicons name="backspace-outline" size={size * 0.42} color={colors.ink} />, () => setDigits(d => d.slice(0, -1)), 'Delete last digit', digits.length === 0)}
        </View>
      </View>

      {footer}
    </ScrollView>
  );
}

export function PinPadLink({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => [p.link, pressed && p.keyPressed]}>
      <Text style={p.linkText}>{label}</Text>
    </Pressable>
  );
}

const p = StyleSheet.create({
  content: { flexGrow: 1, paddingHorizontal: 24 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  seal: { width: 44, height: 44, borderRadius: 14, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: colors.line, padding: 4 },
  brandName: { fontFamily: fonts.bold, fontSize: 16, color: colors.ink },
  close: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  tag: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: colors.line, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, marginBottom: 14 },
  tagDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.ink },
  tagText: { fontFamily: fonts.bold, fontSize: 12, color: colors.ink },
  title: { fontFamily: fonts.display, fontSize: 34, lineHeight: 38, letterSpacing: -0.8, color: colors.ink },
  subtitle: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22, color: colors.muted, marginTop: 8 },
  account: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 16, paddingLeft: 16, paddingRight: 8, minHeight: 64, borderRadius: 18, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: colors.line },
  accountName: { fontFamily: fonts.bold, fontSize: 15, color: colors.ink },
  accountEmail: { fontFamily: fonts.body, fontSize: 13, color: colors.muted },
  switch: { minHeight: 44, paddingHorizontal: 16, borderRadius: 999, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.bg, justifyContent: 'center' },
  switchText: { fontFamily: fonts.bold, fontSize: 13, color: colors.ink },
  dots: { alignSelf: 'center', flexDirection: 'row', gap: 22, marginTop: 22, height: 56, paddingHorizontal: 32, borderRadius: 999, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: colors.line, alignItems: 'center' },
  dot: { width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: colors.ink },
  dotFilled: { backgroundColor: colors.ink },
  error: { fontFamily: fonts.bold, fontSize: 13, color: colors.danger, marginTop: 10, minHeight: 18, textAlign: 'center' },
  pad: { alignItems: 'center', marginTop: 14, gap: 14 },
  row: { flexDirection: 'row', justifyContent: 'center', gap: 24 },
  key: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: colors.line },
  keyPressed: { backgroundColor: colors.tint, transform: [{ scale: 0.96 }] },
  digit: { fontFamily: fonts.display, color: colors.ink },
  link: { alignSelf: 'center', minHeight: 48, paddingHorizontal: 24, borderRadius: 16, borderWidth: 1, borderColor: colors.line, backgroundColor: '#FFFFFF', justifyContent: 'center', marginTop: 18 },
  linkText: { fontFamily: fonts.bold, fontSize: 15, color: colors.ink },
});
