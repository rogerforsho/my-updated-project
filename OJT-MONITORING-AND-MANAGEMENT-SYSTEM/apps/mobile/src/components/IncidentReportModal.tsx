import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  INCIDENT_CATEGORIES, listMyIncidentReports, submitIncidentReport,
  type IncidentCategory, type MyIncidentReport,
} from '../services/incidentReports';

export default function IncidentReportModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const [category, setCategory] = useState<IncidentCategory>('harassment');
  const [description, setDescription] = useState('');
  const [reports, setReports] = useState<MyIncidentReport[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!visible) return;
    setError('');
    setLoading(true);
    listMyIncidentReports().then((result) => {
      if (result.data) setReports(result.data);
      else setError(result.error?.message ?? 'Could not load your reports.');
    }).finally(() => setLoading(false));
  }, [visible]);

  async function submit() {
    setError(''); setSaving(true);
    const result = await submitIncidentReport({ category, description });
    setSaving(false);
    if (result.error) { setError(result.error.message); return; }
    setDescription('');
    Alert.alert('Report sent', 'Only your OJT Coordinator can read this report. Your company and supervisor cannot see it.');
    const refreshed = await listMyIncidentReports();
    if (refreshed.data) setReports(refreshed.data);
  }

  return <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
    <View style={styles.overlay}><View style={styles.container}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}><Text style={styles.title}>Report a concern</Text>
          <Text style={styles.subtitle}>Confidential: only your OJT Coordinator can read it. Your company and supervisor cannot.</Text></View>
        <TouchableOpacity onPress={onClose} accessibilityRole="button" accessibilityLabel="Close incident report"><Ionicons name="close" size={22} color="#526257" /></TouchableOpacity>
      </View>
      {loading ? <ActivityIndicator style={{ margin: 20 }} color="#0A3824" /> : <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Text style={styles.section}>What kind of concern is it?</Text>
        <View style={styles.chips}>
          {INCIDENT_CATEGORIES.map((item) => <TouchableOpacity key={item.value} onPress={() => setCategory(item.value)} accessibilityRole="button"
            accessibilityState={{ selected: category === item.value }} style={[styles.chip, category === item.value && styles.chipActive]}>
            <Text style={[styles.chipText, category === item.value && styles.chipTextActive]}>{item.label}</Text>
          </TouchableOpacity>)}
        </View>
        <Text style={styles.section}>What happened?</Text>
        <TextInput style={[styles.input, styles.textarea]} multiline maxLength={4000} value={description} onChangeText={setDescription}
          placeholder="Describe what happened, when, and who was involved." placeholderTextColor="#879687" textAlignVertical="top" />
        <Text style={styles.helper}>{description.trim().length}/4000</Text>
        {!!error && <Text accessibilityLiveRegion="polite" style={styles.error}>{error}</Text>}
        <TouchableOpacity style={[styles.submit, description.trim().length < 10 && { opacity: 0.55 }]} onPress={submit}
          disabled={saving || description.trim().length < 10} accessibilityRole="button">
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitText}>Send to my OJT Coordinator</Text>}
        </TouchableOpacity>
        <Text style={styles.section}>Your reports</Text>
        {reports.length ? reports.map((item) => <View key={item.incident_id} style={styles.card}>
          <Text style={styles.cardTitle}>{INCIDENT_CATEGORIES.find((c) => c.value === item.category)?.label ?? item.category} · {new Date(item.created_at).toLocaleDateString()}</Text>
          <Text style={styles.cardStatus}>{item.status.toUpperCase()}{item.coordinator_response ? ` — ${item.coordinator_response}` : ''}</Text>
        </View>) : <Text style={styles.helper}>No reports yet.</Text>}
      </ScrollView>}
    </View></View>
  </Modal>;
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  container: { backgroundColor: '#FFFEFB', borderTopLeftRadius: 22, borderTopRightRadius: 22, maxHeight: '94%' },
  header: { padding: 18, borderBottomWidth: 1, borderBottomColor: '#DCE5DB', flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  title: { color: '#0A3824', fontSize: 18, fontWeight: '800' }, subtitle: { color: '#526257', fontSize: 12, marginTop: 4 },
  body: { padding: 18, paddingBottom: 36 }, section: { color: '#0A3824', fontSize: 14, fontWeight: '800', marginTop: 12, marginBottom: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderColor: '#DCE5DB', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: '#fff' },
  chipActive: { backgroundColor: '#0A3824', borderColor: '#0A3824' }, chipText: { color: '#37483C', fontWeight: '600', fontSize: 12 }, chipTextActive: { color: '#fff' },
  input: { borderWidth: 1, borderColor: '#DCE5DB', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, color: '#17231B', backgroundColor: '#fff' },
  textarea: { minHeight: 140 }, helper: { color: '#647568', fontSize: 12, marginVertical: 8 }, error: { color: '#991b1b', marginVertical: 8 },
  submit: { backgroundColor: '#0A3824', borderRadius: 12, padding: 14, alignItems: 'center', marginTop: 8 }, submitText: { color: '#fff', fontWeight: '800' },
  card: { padding: 12, borderWidth: 1, borderColor: '#DCE5DB', borderRadius: 12, marginBottom: 8 }, cardTitle: { color: '#17231B', fontWeight: '700' }, cardStatus: { color: '#526257', fontSize: 12, marginTop: 4 },
});
