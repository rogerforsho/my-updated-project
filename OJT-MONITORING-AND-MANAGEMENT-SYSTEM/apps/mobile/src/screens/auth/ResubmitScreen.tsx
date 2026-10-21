import { useEffect, useState } from 'react';
import {
  ActivityIndicator, Image, KeyboardAvoidingView, Platform, ScrollView,
  StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { StudentRegistrationResubmissionDetails } from '@ojt/shared';
import { STUDENT_REGISTRATION_COURSES } from '@ojt/shared';
import type { AuthStackParamList } from '../../navigation/types';
import { uploadRegistrationIdCard } from '../../lib/storage';
import { getStudentRegistrationForResubmission, resubmitStudentRegistration, signOut } from '../../services/auth';

type Props = { navigation: NativeStackNavigationProp<AuthStackParamList, 'Resubmit'> };
type IdImage = { uri: string; name: string; size?: number };

export default function ResubmitScreen({ navigation }: Props) {
  const [details, setDetails] = useState<StudentRegistrationResubmissionDetails | null>(null);
  const [form, setForm] = useState({ full_name: '', student_number: '', course: 'BSIT' });
  const [front, setFront] = useState<IdImage | null>(null);
  const [back, setBack] = useState<IdImage | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    void getStudentRegistrationForResubmission().then(result => {
      if (!alive) return;
      setLoadingDetails(false);
      if (result.error || !result.data) {
        setError(result.error?.message || 'Registration details could not be loaded.');
        return;
      }
      setDetails(result.data);
      setForm({
        full_name: result.data.full_name,
        student_number: result.data.student_number,
        course: result.data.course,
      });
    });
    return () => { alive = false; };
  }, []);

  async function pickIdImage(side: 'front' | 'back') {
    setError('');
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['image/jpeg', 'image/png'],
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.length) return;
      const asset = result.assets[0];
      if (asset.size && asset.size > 5 * 1024 * 1024) {
        setError('Student ID images must be no larger than 5 MB.');
        return;
      }
      const image = { uri: asset.uri, name: asset.name, size: asset.size };
      if (side === 'front') setFront(image);
      else setBack(image);
    } catch {
      setError('Could not select the student ID image.');
    }
  }

  async function handleSubmit() {
    setError('');
    if (!details) return;
    if (!form.full_name.trim() || !form.student_number.trim()) {
      setError('Enter your full legal name and student number.');
      return;
    }
    if (!front || !back) {
      setError('Upload both sides of your student ID.');
      return;
    }

    setSubmitting(true);
    const uploaded = await uploadRegistrationIdCard(front, back, details.email, true);
    if (uploaded.error || !uploaded.data) {
      setSubmitting(false);
      setError(uploaded.error?.message || 'Student ID upload failed. Please try again.');
      return;
    }

    const result = await resubmitStudentRegistration({
      full_name: form.full_name.trim(),
      student_number: form.student_number.trim(),
      course: form.course,
      year_level: 4,
      id_card_front_path: uploaded.data.front_path,
      id_card_back_path: uploaded.data.back_path,
    });
    setSubmitting(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }

    navigation.replace('Pending');
  }

  async function handleSignOut() {
    await signOut();
    navigation.replace('SignIn');
  }

  if (loadingDetails) {
    return <View style={s.loading}><ActivityIndicator size="large" color="#0A3824" /></View>;
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={s.root}>
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        <View style={s.inner}>
          <View style={s.brand}>
            <View style={s.logoContainer}>
              <Image source={require('../../../assets/logo.png')} style={s.logo} resizeMode="contain" />
            </View>
            <Text style={s.brandTitle}>Colegio de Montalban</Text>
            <Text style={s.brandSub}>OJT Registration Review</Text>
          </View>

          <View style={s.card}>
            <Text style={s.title}>Correct and Resubmit</Text>
            <Text style={s.subtitle}>Update your registration on this same account. Check the review email for OJT Coordinator feedback.</Text>

            {!!details?.rejection_reason && (
              <View style={s.reasonBox}>
                <Text style={s.reasonTitle}>Review feedback</Text>
                <Text style={s.reasonText}>{details.rejection_reason}</Text>
              </View>
            )}

            {!!error && <View style={s.alert}><Text style={s.alertText}>{error}</Text></View>}

            <Text style={s.label}>Institutional Email</Text>
            <Text style={s.readOnly}>{details?.email}</Text>
            <Text style={s.help}>To change the email connected to this account, contact OJT Coordinator.</Text>

            <Text style={s.label}>Full Legal Name</Text>
            <TextInput style={s.input} value={form.full_name} onChangeText={value => setForm(previous => ({ ...previous, full_name: value }))} />

            <Text style={s.label}>Student Number</Text>
            <TextInput style={s.input} value={form.student_number} onChangeText={value => setForm(previous => ({ ...previous, student_number: value }))} autoCapitalize="characters" />

            <Text style={s.label}>Program / Degree</Text>
            <View style={s.pills}>
              {STUDENT_REGISTRATION_COURSES.map(course => (
                <TouchableOpacity key={course} onPress={() => setForm(previous => ({ ...previous, course }))} style={[s.pill, form.course === course && s.pillActive]}>
                  <Text style={[s.pillText, form.course === course && s.pillTextActive]}>{course}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={s.label}>Validated Student ID Card</Text>
            {([
              { side: 'front' as const, image: front },
              { side: 'back' as const, image: back },
            ]).map(({ side, image }) => (
              <TouchableOpacity key={side} onPress={() => pickIdImage(side)} style={[s.upload, image && s.uploadSelected]}>
                <Ionicons name={image ? 'checkmark-circle' : 'cloud-upload-outline'} size={22} color={image ? '#0A3824' : '#526257'} />
                <View style={s.uploadTextWrap}>
                  <Text style={s.uploadTitle}>{image?.name || `Select ID ${side} photo`}</Text>
                  <Text style={s.help}>{image ? 'Tap to replace' : 'JPG or PNG, 5 MB max'}</Text>
                </View>
              </TouchableOpacity>
            ))}

            <View style={s.fixedYear}><Text style={s.fixedYearText}>Fourth-year ICS / IBE student</Text></View>

            <TouchableOpacity style={[s.button, submitting && s.buttonDisabled]} onPress={handleSubmit} disabled={submitting} activeOpacity={0.85}>
              {submitting ? <ActivityIndicator color="#E4DBC4" /> : <Text style={s.buttonText}>Resubmit Registration</Text>}
            </TouchableOpacity>
            <TouchableOpacity onPress={handleSignOut} disabled={submitting}>
              <Text style={s.signOut}>Sign out</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#092E1D' },
  scroll: { flexGrow: 1 },
  inner: { flex: 1, justifyContent: 'center', paddingHorizontal: 22, paddingVertical: 32 },
  loading: { flex: 1, backgroundColor: '#F4F6F2', alignItems: 'center', justifyContent: 'center' },
  brand: { alignItems: 'center', marginBottom: 18 },
  logoContainer: { width: 58, height: 58, borderRadius: 29, backgroundColor: '#fff', padding: 2, borderWidth: 2, borderColor: '#E4DBC4', marginBottom: 8 },
  logo: { width: '100%', height: '100%', borderRadius: 27 },
  brandTitle: { fontSize: 18, fontWeight: '900', color: '#E4DBC4' },
  brandSub: { fontSize: 12, fontWeight: '700', color: '#fff', marginTop: 2 },
  card: { backgroundColor: '#fff', borderRadius: 20, padding: 20 },
  title: { fontSize: 20, fontWeight: '800', color: '#0A3824' },
  subtitle: { fontSize: 12, color: '#526257', lineHeight: 17, marginTop: 4, marginBottom: 14 },
  reasonBox: { backgroundColor: '#fff8e8', borderColor: '#f2d39a', borderWidth: 1, borderRadius: 10, padding: 11, marginBottom: 12 },
  reasonTitle: { fontSize: 11, fontWeight: '800', color: '#79500a', marginBottom: 4 },
  reasonText: { fontSize: 12, color: '#573b0b', lineHeight: 17 },
  alert: { backgroundColor: '#fef2f2', borderColor: '#fecaca', borderWidth: 1, borderRadius: 10, padding: 10, marginBottom: 10 },
  alertText: { color: '#b91c1c', fontSize: 12, textAlign: 'center' },
  label: { fontSize: 11, fontWeight: '700', color: '#37483C', marginTop: 10, marginBottom: 4 },
  input: { borderWidth: 1, borderColor: '#DCE5DB', borderRadius: 9, paddingHorizontal: 11, paddingVertical: 9, fontSize: 13, color: '#18271D', backgroundColor: '#F7F9F5' },
  readOnly: { borderWidth: 1, borderColor: '#DCE5DB', borderRadius: 9, paddingHorizontal: 11, paddingVertical: 10, fontSize: 13, color: '#526257', backgroundColor: '#f1f4f0' },
  help: { fontSize: 10, color: '#69776c', marginTop: 3 },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  pill: { borderWidth: 1, borderColor: '#DCE5DB', backgroundColor: '#F7F9F5', borderRadius: 8, paddingHorizontal: 9, paddingVertical: 6 },
  pillActive: { borderColor: '#0A3824', backgroundColor: '#0A3824' },
  pillText: { fontSize: 11, fontWeight: '700', color: '#526257' },
  pillTextActive: { color: '#E4DBC4' },
  upload: { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderStyle: 'dashed', borderColor: '#C7D2C7', backgroundColor: '#F7F9F5', borderRadius: 10, padding: 10, marginBottom: 6 },
  uploadSelected: { borderStyle: 'solid', borderColor: '#0A3824', backgroundColor: 'rgba(10,56,36,0.04)' },
  uploadTextWrap: { flex: 1, marginLeft: 9 },
  uploadTitle: { fontSize: 12, fontWeight: '600', color: '#26372D' },
  fixedYear: { marginTop: 7, padding: 9, borderRadius: 9, backgroundColor: 'rgba(10,56,36,0.06)' },
  fixedYearText: { fontSize: 11, color: '#0A3824', fontWeight: '700', textAlign: 'center' },
  button: { backgroundColor: '#0A3824', borderRadius: 11, paddingVertical: 13, alignItems: 'center', marginTop: 14 },
  buttonDisabled: { opacity: 0.7 },
  buttonText: { color: '#E4DBC4', fontSize: 13, fontWeight: '800' },
  signOut: { textAlign: 'center', color: '#526257', fontSize: 12, marginTop: 13, fontWeight: '700' },
});
