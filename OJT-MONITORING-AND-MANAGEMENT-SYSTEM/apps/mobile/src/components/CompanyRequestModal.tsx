import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { Ionicons } from '@expo/vector-icons';
import { listMyCompanyRequests, submitCompanyRequest, type CompanyRequestInput } from '../services/companyRequests';
import type { DbCompanyRequest } from '@ojt/shared';

const empty: CompanyRequestInput = {
  requested_company_name: '', company_address: '', contact_person: '', contact_email: '', contact_number: '',
  requested_branch_name: '', branch_address: '',
};

export default function CompanyRequestModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const [form, setForm] = useState<CompanyRequestInput>(empty);
  const [requests, setRequests] = useState<DbCompanyRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!visible) return;
    setError('');
    setLoading(true);
    listMyCompanyRequests().then((result) => {
      if (result.data) setRequests(result.data);
      else setError(result.error?.message ?? 'Could not load requests.');
    }).finally(() => setLoading(false));
  }, [visible]);

  async function pickEvidence(field: 'business_permit' | 'moa') {
    const picked = await DocumentPicker.getDocumentAsync({
      type: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'image/*'],
      copyToCacheDirectory: true,
    });
    if (!picked.canceled && picked.assets[0]) {
      const { uri, name, mimeType } = picked.assets[0];
      setForm((current) => ({ ...current, [field]: { uri, name, mimeType } }));
    }
  }

  async function submit() {
    setError(''); setSaving(true);
    const result = await submitCompanyRequest(form);
    setSaving(false);
    if (result.error) { setError(result.error.message); return; }
    setForm(empty);
    Alert.alert('Request submitted', 'Your OJT Coordinator will verify the HTE and branch before placement.');
    const refreshed = await listMyCompanyRequests();
    if (refreshed.data) setRequests(refreshed.data);
  }

  const field = (label: string, key: keyof CompanyRequestInput, placeholder: string, keyboardType?: 'default' | 'email-address' | 'phone-pad') => (
    <View style={styles.field} key={key}>
      <Text style={styles.label}>{label}</Text>
      <TextInput style={styles.input} value={typeof form[key] === 'string' ? form[key] as string : ''}
        onChangeText={(value) => setForm((current) => ({ ...current, [key]: value }))}
        placeholder={placeholder} placeholderTextColor="#879687" keyboardType={keyboardType} autoCapitalize={keyboardType === 'email-address' ? 'none' : 'sentences'} />
    </View>
  );
  const hasPendingRequest = requests.some((request) => request.status === 'pending');

  return <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
    <View style={styles.overlay}><View style={styles.container}>
      <View style={styles.header}><View><Text style={styles.title}>Request a new HTE</Text><Text style={styles.subtitle}>Coordinator verification is required before placement.</Text></View>
        <TouchableOpacity onPress={onClose} accessibilityRole="button" accessibilityLabel="Close HTE request"><Ionicons name="close" size={22} color="#526257" /></TouchableOpacity>
      </View>
      {loading ? <ActivityIndicator style={{ margin: 20 }} color="#0A3824" /> : <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Text style={styles.section}>HTE details</Text>
        {field('HTE name', 'requested_company_name', 'Registered business name')}
        {field('HTE address', 'company_address', 'Business address')}
        {field('Contact person', 'contact_person', 'Name')}
        {field('Contact email', 'contact_email', 'contact@example.com', 'email-address')}
        {field('Contact number', 'contact_number', 'Phone number', 'phone-pad')}
        <Text style={styles.section}>Proposed branch</Text>
        {field('Branch name', 'requested_branch_name', 'e.g. Main Office')}
        {field('Branch address', 'branch_address', 'Work location address')}
        <Text style={styles.helper}>Optional evidence. The system does not create or sign an MOA.</Text>
        {(['business_permit', 'moa'] as const).map((key) => <TouchableOpacity key={key} style={styles.upload} onPress={() => pickEvidence(key)}>
          <Ionicons name="attach" size={18} color="#0A3824" /><Text style={styles.uploadText}>{form[key]?.name ?? (key === 'moa' ? 'Attach MOA copy (optional)' : 'Attach business permit (optional)')}</Text>
        </TouchableOpacity>)}
        {!!error && <Text accessibilityLiveRegion="polite" style={styles.error}>{error}</Text>}
        <TouchableOpacity style={[styles.submit, hasPendingRequest && { opacity: 0.55 }]} onPress={submit} disabled={saving || hasPendingRequest} accessibilityRole="button">
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitText}>{hasPendingRequest ? 'Request pending review' : 'Submit for Coordinator review'}</Text>}
        </TouchableOpacity>
        <Text style={styles.section}>Your requests</Text>
        {requests.length ? requests.map((item) => <View key={item.request_id} style={styles.requestCard}>
          <Text style={styles.requestTitle}>{item.requested_company_name} · {item.requested_branch_name}</Text>
          <Text style={styles.requestStatus}>{item.status.toUpperCase()}{item.feedback ? ` — ${item.feedback}` : ''}</Text>
        </View>) : <Text style={styles.helper}>No HTE requests yet.</Text>}
      </ScrollView>}
    </View></View>
  </Modal>;
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  container: { backgroundColor: '#FFFEFB', borderTopLeftRadius: 22, borderTopRightRadius: 22, maxHeight: '94%' },
  header: { padding: 18, borderBottomWidth: 1, borderBottomColor: '#DCE5DB', flexDirection: 'row', justifyContent: 'space-between' },
  title: { color: '#0A3824', fontSize: 18, fontWeight: '800' }, subtitle: { color: '#526257', fontSize: 12, marginTop: 4 },
  body: { padding: 18, paddingBottom: 36 }, section: { color: '#0A3824', fontSize: 14, fontWeight: '800', marginTop: 12, marginBottom: 8 },
  field: { marginBottom: 10 }, label: { color: '#37483C', fontSize: 12, fontWeight: '700', marginBottom: 5 },
  input: { borderWidth: 1, borderColor: '#DCE5DB', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, color: '#17231B', backgroundColor: '#fff' },
  helper: { color: '#647568', fontSize: 12, marginVertical: 8 }, upload: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 10, backgroundColor: '#F1F5EF', marginBottom: 8, gap: 8 },
  uploadText: { color: '#0A3824', fontWeight: '600', flex: 1 }, error: { color: '#991b1b', marginVertical: 8 },
  submit: { backgroundColor: '#0A3824', borderRadius: 12, padding: 14, alignItems: 'center', marginTop: 8 }, submitText: { color: '#fff', fontWeight: '800' },
  requestCard: { padding: 12, borderWidth: 1, borderColor: '#DCE5DB', borderRadius: 12, marginBottom: 8 }, requestTitle: { color: '#17231B', fontWeight: '700' }, requestStatus: { color: '#526257', fontSize: 12, marginTop: 4 },
});
