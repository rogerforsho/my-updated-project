import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  AccessibilityInfo, ActivityIndicator, Animated, Image, KeyboardAvoidingView, Platform, Pressable,
  ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View, type TextInputProps,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts } from '../../theme';

// Shared look for the signed-out screens: campus photo header, off-white sheet, one input and one button pair.
export default function AuthShell({ headline, subline, children, footer }: {
  headline: string; subline: string; children: ReactNode; footer?: ReactNode;
}) {
  const { height } = useWindowDimensions();
  const enter = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled().then(reduce => {
      if (!alive) return;
      if (reduce) enter.setValue(1);
      else Animated.timing(enter, { toValue: 1, duration: 300, useNativeDriver: true }).start();
    }).catch(() => enter.setValue(1));
    return () => { alive = false; };
  }, [enter]);

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={a.root}>
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={{ height: Math.min(300, Math.round(height * 0.34)) }}>
          <Image source={require('../../../assets/campus.jpg')} style={StyleSheet.absoluteFill} resizeMode="cover" accessible={false} />
          <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(9,46,29,0.35)' }]} />
          <View style={a.photoShade} />
          <View style={a.brand}>
            <View style={a.seal}><Image source={require('../../../assets/logo.png')} style={{ width: '100%', height: '100%' }} resizeMode="contain" /></View>
            <View>
              <Text style={a.brandName}>Colegio de Montalban</Text>
              <Text style={a.brandSub}>OJT Practicum Portal</Text>
            </View>
          </View>
        </View>

        <Animated.View style={[a.sheet, { opacity: enter, transform: [{ translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }] }]}>
          <View style={a.tag}><View style={a.tagDot} /><Text style={a.tagText}>Student practicum · ICS & IBE</Text></View>
          <Text style={a.headline} accessibilityRole="header">{headline}</Text>
          <Text style={a.subline}>{subline}</Text>
          {children}
          {footer}
        </Animated.View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

export function AuthInput({ label, style, ...props }: TextInputProps & { label: string }) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={a.field}>
      <Text style={a.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor="#879687"
        {...props}
        onFocus={e => { setFocused(true); props.onFocus?.(e); }}
        onBlur={e => { setFocused(false); props.onBlur?.(e); }}
        style={[a.input, focused && a.inputFocused, style]}
      />
    </View>
  );
}

export function PasswordInput({ label, ...props }: TextInputProps & { label: string }) {
  const [show, setShow] = useState(false);
  return (
    <View>
      <AuthInput label={label} {...props} secureTextEntry={!show} autoCapitalize="none" style={{ paddingRight: 52 }} />
      <Pressable
        onPress={() => setShow(v => !v)}
        accessibilityRole="button"
        accessibilityLabel={show ? 'Hide password' : 'Show password'}
        style={a.eye}
      >
        <Ionicons name={show ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.muted} />
      </Pressable>
    </View>
  );
}

export function PrimaryButton({ label, onPress, loading, loadingLabel, disabled }: {
  label: string; onPress: () => void; loading?: boolean; loadingLabel?: string; disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityState={{ busy: !!loading, disabled: !!(disabled || loading) }}
      style={({ pressed }) => [a.primary, pressed && a.pressed, (disabled || loading) && { opacity: 0.85 }]}
    >
      {loading
        ? <><ActivityIndicator size="small" color={colors.sand} /><Text style={a.primaryText}>{loadingLabel ?? label}</Text></>
        : <><Text style={a.primaryText}>{label}</Text><Ionicons name="arrow-forward" size={18} color={colors.sand} /></>}
    </Pressable>
  );
}

export function SecondaryButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => [a.secondary, pressed && a.pressed]}>
      <Text style={a.secondaryText}>{label}</Text>
    </Pressable>
  );
}

export function AuthAlert({ message, tone = 'error' }: { message: string; tone?: 'error' | 'info' }) {
  return (
    <View style={[a.alert, tone === 'info' && a.alertInfo]} accessibilityRole="alert">
      <Text style={[a.alertText, tone === 'info' && { color: colors.ink }]}>{message}</Text>
    </View>
  );
}

export function AuthFootnote({ children }: { children: ReactNode }) {
  return <Text style={a.footnote}>{children}</Text>;
}

export const a = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.deep },
  photoShade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '60%', backgroundColor: 'rgba(9,46,29,0.55)' },
  brand: { position: 'absolute', left: 22, right: 22, bottom: 44, flexDirection: 'row', alignItems: 'center', gap: 12 },
  seal: { width: 44, height: 44, borderRadius: 14, backgroundColor: '#FFFFFF', padding: 4 },
  brandName: { fontFamily: fonts.display, fontSize: 20, color: '#FFFFFF' },
  brandSub: { fontFamily: fonts.body, fontSize: 13, color: 'rgba(255,255,255,0.8)', marginTop: 1 },
  sheet: { flexGrow: 1, marginTop: -24, backgroundColor: colors.bg, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 22, paddingTop: 24, paddingBottom: 32 },
  tag: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: colors.line, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, marginBottom: 16 },
  tagDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.ink },
  tagText: { fontFamily: fonts.bold, fontSize: 12, color: colors.ink },
  headline: { fontFamily: fonts.display, fontSize: 34, lineHeight: 38, letterSpacing: -0.8, color: colors.ink },
  subline: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22, color: colors.muted, marginTop: 8, marginBottom: 22 },
  field: { marginBottom: 14 },
  label: { fontFamily: fonts.bold, fontSize: 14, color: '#26372D', marginBottom: 6 },
  input: { height: 52, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: colors.line, borderRadius: 14, paddingHorizontal: 16, fontFamily: fonts.body, fontSize: 16, color: colors.text },
  inputFocused: { borderColor: colors.ink, borderWidth: 1.5 },
  eye: { position: 'absolute', right: 4, top: 26, width: 44, height: 52, alignItems: 'center', justifyContent: 'center' },
  primary: { height: 54, borderRadius: 16, backgroundColor: colors.deep, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, marginTop: 6 },
  primaryText: { fontFamily: fonts.bold, fontSize: 16, color: '#FFFFFF' },
  secondary: { height: 54, borderRadius: 16, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center', marginTop: 12 },
  secondaryText: { fontFamily: fonts.bold, fontSize: 16, color: colors.ink },
  pressed: { transform: [{ scale: 0.98 }] },
  link: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  linkText: { fontFamily: fonts.bold, fontSize: 14, color: colors.ink },
  alert: { backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FECACA', borderRadius: 14, padding: 12, marginBottom: 12 },
  alertInfo: { backgroundColor: '#EAF3EC', borderColor: '#BFD6C4' },
  alertText: { fontFamily: fonts.bold, fontSize: 14, lineHeight: 20, color: colors.danger },
  footnote: { fontFamily: fonts.body, textAlign: 'center', marginTop: 24, fontSize: 12, color: colors.muted },
});
