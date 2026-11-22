import { useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { colors, fonts } from '../../theme';
import AuthShell, { a, AuthAlert, AuthInput, PasswordInput, PrimaryButton, SecondaryButton } from './AuthShell';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { AuthStackParamList } from '../../navigation/types';
import * as DocumentPicker from 'expo-document-picker';
import { Ionicons } from '@expo/vector-icons';
import { registerStudent } from '../../services/auth';
import { uploadRegistrationIdCard } from '../../lib/storage';
import { optimizeDocumentImage } from '../../lib/imageOptimizer';
import { STUDENT_REGISTRATION_COURSES } from '@ojt/shared';

type Props = { navigation: NativeStackNavigationProp<AuthStackParamList, 'Register'> };

export default function RegisterScreen({ navigation }: Props) {
  const [form, setForm] = useState({
    full_name: '', email: '', password: '', confirm_password: '',
    student_number: '', course: 'BSIT', year_level: '4',
  });
  const [idCardFront, setIdCardFront] = useState<{ uri: string; name: string; size?: number } | null>(null);
  const [idCardBack, setIdCardBack] = useState<{ uri: string; name: string; size?: number } | null>(null);
  const [dataPrivacyConsent, setDataPrivacyConsent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  function set(field: string, value: string) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  async function handlePickIdCard(side: 'front' | 'back') {
    setError('');
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['image/jpeg', 'image/png'],
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        if (asset.size && asset.size > 5 * 1024 * 1024) {
          setError('Student ID image must be less than 5 MB.');
          return;
        }
        // Vercel rejects request bodies over 4.5 MB, so shrink the photo before both sides are uploaded.
        const optimized = await optimizeDocumentImage(asset.uri);
        const file = {
          uri: optimized.uri,
          name: `student-id-${side}.jpg`,
          size: optimized.sizeBytes ?? asset.size,
        };
        if (side === 'front') setIdCardFront(file);
        else setIdCardBack(file);
      }
    } catch {
      setError('Could not select student ID document.');
    }
  }

  async function handleSubmit() {
    setError('');
    if (!dataPrivacyConsent) {
      setError('Please agree to the Data Privacy Notice to register.');
      return;
    }
    if (!form.full_name.trim() || !form.email.trim() || !form.student_number.trim()) {
      setError('Please fill in all required fields.');
      return;
    }
    if (!idCardFront || !idCardBack) {
      setError('Please attach both the front and back of your validated student ID.');
      return;
    }
    if (form.password !== form.confirm_password) {
      setError('Passwords do not match.');
      return;
    }
    if (form.password.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }

    setLoading(true);

    // 1. Upload both ID card sides
    const uploadRes = await uploadRegistrationIdCard(idCardFront, idCardBack, form.email);
    if (uploadRes.error) {
      setLoading(false);
      setError(uploadRes.error.message);
      return;
    }
    const idCardPaths = uploadRes.data;

    // 2. Register Student
    const result = await registerStudent({
      full_name: form.full_name,
      email: form.email,
      password: form.password,
      student_number: form.student_number,
      course: form.course,
      year_level: 4,
      id_card_path: idCardPaths?.front_path,
      id_card_front_path: idCardPaths?.front_path,
      id_card_back_path: idCardPaths?.back_path,
    });
    setLoading(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    navigation.navigate('Pending');
  }

  return (
    <AuthShell headline="Start your practicum." subline="Your OJT Coordinator reviews and approves your registration before you can sign in.">
      <Text style={g.group}>Your details</Text>
      {([
        { label: 'Full legal name', field: 'full_name', placeholder: 'Juan Dela Cruz', keyboard: 'default' },
        { label: 'Institutional email', field: 'email', placeholder: 'username@cdm.edu.ph', keyboard: 'email-address' },
        { label: 'Student number', field: 'student_number', placeholder: '2021-00001', keyboard: 'default' },
      ] as const).map(({ label, field, placeholder, keyboard }) => (
        <AuthInput
          key={field}
          label={label}
          value={form[field]}
          onChangeText={(v: string) => set(field, v)}
          placeholder={placeholder}
          keyboardType={keyboard}
          autoCapitalize={field === 'email' ? 'none' : 'words'}
        />
      ))}

      <Text style={g.group}>Program</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
        <View style={g.pillRow}>
          {STUDENT_REGISTRATION_COURSES.map(c => (
            <Pressable
              key={c}
              onPress={() => set('course', c)}
              accessibilityRole="button"
              accessibilityState={{ selected: form.course === c }}
              style={({ pressed }) => [g.pill, form.course === c && g.pillActive, pressed && a.pressed]}
            >
              <Text style={[g.pillText, form.course === c && g.pillTextActive]}>{c}</Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>
      <View style={g.fixedPill}>
        <Ionicons name="school-outline" size={18} color={colors.ink} />
        <Text style={g.fixedPillText}>4th Year Graduating Trainee</Text>
      </View>

      <Text style={g.group}>Validated student ID (front and back)</Text>
      {([
        { side: 'front' as const, label: 'Front', file: idCardFront },
        { side: 'back' as const, label: 'Back', file: idCardBack },
      ]).map(({ side, label, file }) => (
        <Pressable
          key={side}
          style={({ pressed }) => [g.uploadBox, file && g.uploadBoxSelected, pressed && a.pressed]}
          onPress={() => handlePickIdCard(side)}
          accessibilityRole="button"
          accessibilityLabel={file ? `ID ${label} selected, tap to change` : `Select ID ${label} photo`}
        >
          <Ionicons name={file ? 'checkmark-circle' : 'cloud-upload-outline'} size={26} color={file ? colors.ink : colors.muted} />
          <View style={{ flex: 1 }}>
            <Text style={[g.uploadTitle, file && { color: colors.ink }]} numberOfLines={1}>
              {file ? file.name : `Select ID ${label} photo`}
            </Text>
            <Text style={g.uploadSub}>
              {file?.size ? `${(file.size / 1024).toFixed(0)} KB ready · tap to change` : `${label} side required · 5 MB max`}
            </Text>
          </View>
        </Pressable>
      ))}

      <Text style={g.group}>Password</Text>
      <PasswordInput label="Password" value={form.password} onChangeText={(v: string) => set('password', v)} placeholder="Min. 8 characters" />
      <PasswordInput label="Confirm password" value={form.confirm_password} onChangeText={(v: string) => set('confirm_password', v)} placeholder="Re-enter password" />

      {/* RA 10173 Data Privacy Consent */}
      <Pressable
        style={g.consentRow}
        onPress={() => setDataPrivacyConsent(!dataPrivacyConsent)}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: dataPrivacyConsent }}
      >
        <View style={[g.checkbox, dataPrivacyConsent && g.checkboxChecked]}>
          {dataPrivacyConsent && <Ionicons name="checkmark" size={16} color="#FFFFFF" />}
        </View>
        <Text style={g.consentText}>
          I consent to the collection of my academic & practicum records under the{' '}
          <Text style={{ fontFamily: fonts.bold, color: colors.ink }}>Data Privacy Act (RA 10173)</Text>.
        </Text>
      </Pressable>

      {!!error && <AuthAlert message={error} />}

      <PrimaryButton label="Submit Registration" onPress={handleSubmit} loading={loading} />
      <SecondaryButton label="Already have an account? Sign in" onPress={() => navigation.navigate('SignIn')} />
    </AuthShell>
  );
}

const g = StyleSheet.create({
  group: { fontFamily: fonts.bold, fontSize: 13, letterSpacing: 0.8, textTransform: 'uppercase', color: colors.muted, marginTop: 10, marginBottom: 10 },
  pillRow: { flexDirection: 'row', gap: 8 },
  pill: { minHeight: 44, paddingHorizontal: 16, borderRadius: 14, borderWidth: 1, borderColor: colors.line, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  pillActive: { borderColor: colors.deep, backgroundColor: colors.deep },
  pillText: { fontFamily: fonts.bold, fontSize: 14, color: colors.ink },
  pillTextActive: { color: '#FFFFFF' },
  fixedPill: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48, paddingHorizontal: 14, borderRadius: 14, backgroundColor: colors.tint, borderWidth: 1, borderColor: colors.line, marginBottom: 6 },
  fixedPillText: { fontFamily: fonts.bold, fontSize: 14, color: colors.ink },
  uploadBox: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64, padding: 14, borderRadius: 14, borderWidth: 1.5, borderStyle: 'dashed', borderColor: '#C7D2C7', backgroundColor: '#FFFFFF', marginBottom: 10 },
  uploadBoxSelected: { borderColor: colors.deep, borderStyle: 'solid' },
  uploadTitle: { fontFamily: fonts.bold, fontSize: 14, color: '#26372D' },
  uploadSub: { fontFamily: fonts.body, fontSize: 12, color: colors.muted, marginTop: 2 },
  consentRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 14, backgroundColor: '#FFFFFF', borderRadius: 14, borderWidth: 1, borderColor: colors.line, marginVertical: 8 },
  checkbox: { width: 24, height: 24, borderRadius: 7, borderWidth: 1.5, borderColor: colors.deep, alignItems: 'center', justifyContent: 'center' },
  checkboxChecked: { backgroundColor: colors.deep },
  consentText: { flex: 1, fontFamily: fonts.body, fontSize: 13, lineHeight: 19, color: '#37483C' },
});
