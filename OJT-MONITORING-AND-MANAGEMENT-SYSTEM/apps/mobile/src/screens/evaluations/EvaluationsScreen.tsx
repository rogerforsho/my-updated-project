import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, TextInput,
  TouchableOpacity, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { listOwnEvaluations, submitOwnEvaluationAppeal, type StudentEvaluationRecord } from '../../services/evaluations';

export default function EvaluationsScreen() {
  const insets = useSafeAreaInsets();
  const [records, setRecords] = useState<StudentEvaluationRecord[]>([]);
  const [completion, setCompletion] = useState<{ final_grade: number; recorded_at: string; finalized_at: string | null; certificate_status: 'active' | 'revoked' | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [activeId, setActiveId] = useState('');
  const [reason, setReason] = useState('');
  const [details, setDetails] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState('');

  const load = useCallback(async () => {
    setError('');
    const result = await listOwnEvaluations();
    if (result.error) setError(result.error.message);
    else {
      setRecords(result.data?.evaluations ?? []);
      setCompletion(result.data?.completion ?? null);
    }
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function submitAppeal(evaluationId: string) {
    setError('');
    setSuccess('');
    setSubmitting(true);
    const result = await submitOwnEvaluationAppeal({ evaluation_id: evaluationId, appeal_reason: reason, supporting_details: details });
    setSubmitting(false);
    if (result.error) { setError(result.error.message); return; }
    setActiveId('');
    setReason('');
    setDetails('');
    setSuccess('Your appeal was sent to your OJT Coordinator. The original evaluation remains in your history.');
    await load();
  }

  if (loading) return <View style={s.center}><ActivityIndicator size="large" color="#0A3824" /></View>;

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <ScrollView
        contentContainerStyle={s.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} colors={['#0A3824']} />}
      >
        <Text style={s.kicker}>COLEGIO DE MONTALBAN OJT</Text>
        <Text style={s.title}>Evaluation results</Text>
        <Text style={s.subtitle}>Your supervisor’s submitted ratings and Coordinator appeal decisions.</Text>
        {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
        {!!success && <Text accessibilityLiveRegion="polite" style={s.success}>{success}</Text>}
        {completion && (
          <View style={s.completionCard}>
            <Text style={s.completionTitle}>Final OJT Grade</Text>
            <Text style={s.completionGrade}>{completion.final_grade.toFixed(2)}</Text>
            <Text style={s.completionNote}>Recorded by your OJT Coordinator on {new Date(completion.recorded_at).toLocaleDateString()}. {completion.certificate_status ? `OJT finalized on ${new Date(completion.finalized_at ?? completion.recorded_at).toLocaleDateString()}.` : completion.final_grade <= 3 ? 'Passing grade; OJT finalization is pending.' : 'Failing grade; OJT remains incomplete.'}</Text>
          </View>
        )}
        {records.length === 0 ? (
          <View style={s.empty}><Ionicons name="star-outline" size={28} color="#728176" /><Text style={s.emptyText}>No evaluation has been submitted yet.</Text></View>
        ) : records.map(record => {
          const appeal = record.appeal;
          const isOpen = activeId === record.evaluation_id;
          return (
            <View key={record.evaluation_id} style={s.card}>
              <View style={s.cardTop}>
                <View>
                  <Text style={s.stage}>{record.evaluation_type === 'midterm' ? 'Midterm evaluation' : 'Final evaluation'}</Text>
                  <Text style={s.date}>{new Date(record.evaluation_date).toLocaleDateString()}</Text>
                </View>
                <Text style={s.score}>{record.effective_score == null ? '—' : `${record.effective_score}%`}</Text>
              </View>
              {appeal?.status === 'adjusted' && <Text style={s.adjusted}>Adjusted after appeal · original score {record.performance_score ?? '—'}%</Text>}
              <Text style={s.feedback}>{record.feedback}</Text>
              {appeal?.status === 'pending' ? (
                <View style={s.appealBox}>
                  <Text style={s.appealStatus}>Appeal awaiting Coordinator review</Text>
                  <Text style={s.appealText}>Your appeal: {appeal.appeal_reason}</Text>
                  {!!appeal.supporting_details && <Text style={s.appealText}>Supporting details: {appeal.supporting_details}</Text>}
                  <Text style={s.pending}>You can submit another appeal after this one is decided.</Text>
                </View>
              ) : (
                <>
                  {appeal && (
                    <View style={s.appealBox}>
                      <Text style={s.appealStatus}>{appeal.status === 'upheld' ? 'Original evaluation upheld' : 'Evaluation adjusted after appeal'}</Text>
                      <Text style={s.appealText}>Your appeal: {appeal.appeal_reason}</Text>
                      {!!appeal.supporting_details && <Text style={s.appealText}>Supporting details: {appeal.supporting_details}</Text>}
                      {!!appeal.decision_reason && <Text style={s.appealText}>Coordinator decision: {appeal.decision_reason}</Text>}
                    </View>
                  )}
                  {!isOpen ? (
                    <TouchableOpacity accessibilityRole="button" onPress={() => { setActiveId(record.evaluation_id); setError(''); }} style={s.appealButton}>
                      <Text style={s.appealButtonText}>{appeal ? 'Submit another appeal' : 'Request a review'}</Text>
                    </TouchableOpacity>
                  ) : (
                    <View style={s.form}>
                      <Text style={s.label}>Why are you appealing? (20–3,000 characters)</Text>
                      <TextInput multiline value={reason} onChangeText={setReason} maxLength={3000} style={s.input} placeholder="Explain which part of the evaluation you believe needs review." textAlignVertical="top" />
                      <Text style={s.label}>Supporting details (optional)</Text>
                      <TextInput multiline value={details} onChangeText={setDetails} maxLength={3000} style={[s.input, s.details]} placeholder="Add context or identify evidence for your Coordinator." textAlignVertical="top" />
                      <View style={s.actions}>
                        <TouchableOpacity onPress={() => { setActiveId(''); setReason(''); setDetails(''); }} style={s.cancelButton}><Text style={s.cancelText}>Cancel</Text></TouchableOpacity>
                        <TouchableOpacity disabled={submitting} onPress={() => submitAppeal(record.evaluation_id)} style={[s.submitButton, submitting && s.disabled]}>
                          {submitting ? <ActivityIndicator color="#fff" /> : <Text style={s.submitText}>Submit appeal</Text>}
                        </TouchableOpacity>
                      </View>
                    </View>
                  )}
                </>
              )}
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F5F7F4' },
  content: { padding: 20, paddingBottom: 36, gap: 14 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F5F7F4' },
  kicker: { color: '#65806D', fontSize: 10, fontWeight: '800', letterSpacing: 1.2 },
  title: { color: '#102A1D', fontSize: 25, fontWeight: '800', marginTop: -7 },
  subtitle: { color: '#66746A', fontSize: 13, lineHeight: 19, marginTop: -8, marginBottom: 3 },
  error: { color: '#9B2525', backgroundColor: '#FDECEC', borderRadius: 10, padding: 12, fontSize: 13 },
  success: { color: '#145D38', backgroundColor: '#E8F6EC', borderRadius: 10, padding: 12, fontSize: 13 },
  completionCard: { backgroundColor: '#EAF4EC', borderWidth: 1, borderColor: '#B8D7C0', borderRadius: 16, padding: 16, gap: 5 },
  completionTitle: { color: '#173B29', fontSize: 12, fontWeight: '800' },
  completionGrade: { color: '#0A3824', fontSize: 28, fontWeight: '900' },
  completionNote: { color: '#56685A', fontSize: 11 },
  empty: { alignItems: 'center', padding: 30, backgroundColor: '#fff', borderRadius: 16, gap: 8 },
  emptyText: { color: '#5E6B61', fontSize: 13 },
  card: { backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: '#E1E8E2', padding: 16, gap: 11 },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  stage: { color: '#173B29', fontWeight: '800', fontSize: 15 },
  date: { color: '#7B877E', fontSize: 11, marginTop: 3 },
  score: { color: '#0A3824', fontWeight: '900', fontSize: 23 },
  adjusted: { color: '#16603A', fontSize: 12, fontWeight: '700' },
  feedback: { color: '#435248', fontSize: 13, lineHeight: 19 },
  appealBox: { backgroundColor: '#F6F8F5', borderRadius: 10, padding: 12, gap: 6 },
  appealStatus: { color: '#173B29', fontWeight: '800', fontSize: 12 },
  appealText: { color: '#4D5B51', fontSize: 12, lineHeight: 17 },
  pending: { color: '#80601B', fontSize: 11, fontWeight: '600' },
  appealButton: { alignSelf: 'flex-start', borderWidth: 1, borderColor: '#0A3824', borderRadius: 9, paddingHorizontal: 13, paddingVertical: 9 },
  appealButtonText: { color: '#0A3824', fontWeight: '800', fontSize: 12 },
  form: { gap: 9, paddingTop: 5 },
  label: { color: '#435248', fontSize: 12, fontWeight: '700' },
  input: { minHeight: 92, borderWidth: 1, borderColor: '#CBD6CD', borderRadius: 10, padding: 11, color: '#17251B', backgroundColor: '#fff', fontSize: 13 },
  details: { minHeight: 68 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 3 },
  cancelButton: { paddingHorizontal: 12, paddingVertical: 10 },
  cancelText: { color: '#58675D', fontWeight: '700', fontSize: 12 },
  submitButton: { minWidth: 112, backgroundColor: '#0A3824', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 13, paddingVertical: 10, borderRadius: 9 },
  submitText: { color: '#fff', fontWeight: '800', fontSize: 12 },
  disabled: { opacity: 0.6 },
});
