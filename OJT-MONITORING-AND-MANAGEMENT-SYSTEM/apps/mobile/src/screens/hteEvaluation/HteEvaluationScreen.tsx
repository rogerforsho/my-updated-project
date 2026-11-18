import { useCallback, useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, TextInput, ActivityIndicator, StyleSheet, ScrollView,
  RefreshControl, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  HTE_EVALUATION_SECTIONS, HTE_RATING_MAX, HTE_RATING_MIN, isValidHteRatings, scoreHteEvaluation, scoreHteSection,
  type HteRatings,
} from '@ojt/shared';
import { getHteEvaluation, submitHteEvaluation, type HteEvaluationState } from '../../services/hteEvaluation';

const SCALE = Array.from({ length: HTE_RATING_MAX - HTE_RATING_MIN + 1 }, (_, i) => HTE_RATING_MIN + i);

export default function HteEvaluationScreen() {
  const [state, setState] = useState<HteEvaluationState | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [department, setDepartment] = useState('');
  const [field, setField] = useState('');
  const [ratings, setRatings] = useState<Partial<HteRatings>>({});
  const [comments, setComments] = useState('');
  const [certified, setCertified] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    const result = await getHteEvaluation();
    if (result.error) setError(result.error.message);
    else { setError(''); setState(result.data); }
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const send = async () => {
    setSubmitting(true);
    setError('');
    const result = await submitHteEvaluation({
      department_assigned: department.trim(), field_of_training: field.trim(),
      ratings: ratings as HteRatings, comments: comments.trim(), certified,
    });
    setSubmitting(false);
    if (result.error) { setError(result.error.message); return; }
    load();
  };

  const handleSubmit = () => {
    if (!department.trim() || !field.trim()) { setError('Enter your division/department and field of training.'); return; }
    if (!isValidHteRatings(ratings)) { setError('Rate all 11 statements from 1 to 5.'); return; }
    if (!certified) { setError('Confirm that your answers are true and correct.'); return; }
    setError('');
    Alert.alert('Submit evaluation?', 'You cannot change your answers after you submit. Only your OJT Coordinator can read them.', [
      { text: 'Review again', style: 'cancel' },
      { text: 'Submit', onPress: send },
    ]);
  };

  if (loading) return <View style={s.center}><ActivityIndicator size="large" color="#0A3824" /></View>;

  const submitted = state?.submitted ?? null;
  const shown: Partial<HteRatings> = submitted?.ratings ?? ratings;

  return (
    <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={s.header}>
        <Text style={s.kicker}>Colegio de Montalban OJT</Text>
        <Text style={s.title}>HTE Evaluation</Text>
        <Text style={s.subtitle}>Rate your Host Training Establishment after your training</Text>
      </View>
      <ScrollView
        contentContainerStyle={s.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} colors={['#0A3824']} />}
      >
        {!!error && (
          <View style={s.alertError}>
            <Ionicons name="alert-circle" size={18} color="#991b1b" />
            <Text style={s.alertErrorText}>{error}</Text>
          </View>
        )}

        {state && !state.unlocked && !submitted && (
          <View style={s.card}>
            <Ionicons name="lock-closed-outline" size={28} color="#879687" />
            <Text style={s.cardTitle}>Not available yet</Text>
            <Text style={s.muted}>
              This opens when you complete your Required Hours ({Math.round(state.completedHours)} / {state.requiredHours} hours).
            </Text>
          </View>
        )}

        {state && (state.unlocked || submitted) && (
          <>
            {submitted && (
              <View style={[s.card, { borderColor: '#0A3824' }]}>
                <Text style={s.cardTitle}>Submitted</Text>
                <Text style={s.muted}>
                  Sent to your OJT Coordinator on {new Date(submitted.submitted_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}.
                </Text>
                <Text style={s.total}>{Number(submitted.total_score).toFixed(0)} / 100</Text>
              </View>
            )}

            <Text style={s.part}>Part I. Student Information</Text>
            <View style={s.card}>
              <Info label="Name" value={state.student.name} />
              <Info label="Program" value={state.student.program} />
              <Info label="Company" value={[state.placement?.companyName, state.placement?.branchName].filter(Boolean).join(' - ')} />
              <Info label="Inclusive dates" value={state.placement ? `${state.placement.startDate} to ${state.placement.endDate ?? 'present'}` : ''} />
              <Info label="Hours rendered" value={String(Math.round(state.completedHours))} />
              <Text style={s.label}>Division / Department assigned</Text>
              {submitted ? <Text style={s.value}>{submitted.department_assigned}</Text> : (
                <TextInput value={department} onChangeText={setDepartment} maxLength={120} style={s.input} placeholder="e.g. IT Department" placeholderTextColor="#879687" />
              )}
              <Text style={s.label}>Field of training given</Text>
              {submitted ? <Text style={s.value}>{submitted.field_of_training}</Text> : (
                <TextInput value={field} onChangeText={setField} maxLength={120} style={s.input} placeholder="e.g. Web development" placeholderTextColor="#879687" />
              )}
            </View>

            <Text style={s.part}>Part II. Evaluation of HTE</Text>
            <Text style={s.muted}>Be honest. 1 = strongly disagree, 5 = strongly agree. Your Supervisor cannot see your answers.</Text>
            {HTE_EVALUATION_SECTIONS.map(section => (
              <View key={section.id} style={s.card}>
                <Text style={s.cardTitle}>{section.id}. {section.title}  ·  {scoreHteSection(shown, section.id).toFixed(0)}%</Text>
                {section.criteria.map(criterion => (
                  <View key={criterion.id} style={{ marginTop: 10 }}>
                    <Text style={s.value}>{criterion.text} <Text style={s.muted}>({criterion.weight}%)</Text></Text>
                    <View style={s.scaleRow}>
                      {SCALE.map(n => {
                        const active = shown[criterion.id] === n;
                        return (
                          <TouchableOpacity
                            key={n}
                            disabled={!!submitted}
                            onPress={() => setRatings(prev => ({ ...prev, [criterion.id]: n }))}
                            style={[s.scaleBtn, active && s.scaleBtnActive]}
                            accessibilityRole="button"
                            accessibilityLabel={`Rate ${n} out of ${HTE_RATING_MAX}: ${criterion.text}`}
                            accessibilityState={{ selected: active }}
                          >
                            <Text style={[s.scaleText, active && s.scaleTextActive]}>{n}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                ))}
              </View>
            ))}
            {!submitted && <Text style={s.total}>Total: {scoreHteEvaluation(ratings).toFixed(0)} / 100</Text>}

            <Text style={s.part}>Part III. Comments / Recommendations</Text>
            <View style={s.card}>
              {submitted ? <Text style={s.value}>{submitted.comments || 'No comments.'}</Text> : (
                <TextInput
                  value={comments} onChangeText={setComments} multiline maxLength={3000}
                  placeholder="Suggestions for improving the OJT experience (optional)" placeholderTextColor="#879687"
                  style={[s.input, { height: 90, textAlignVertical: 'top' }]}
                />
              )}
            </View>

            {!submitted && (
              <>
                <TouchableOpacity onPress={() => setCertified(c => !c)} style={s.certRow} accessibilityRole="checkbox" accessibilityState={{ checked: certified }}>
                  <Ionicons name={certified ? 'checkbox' : 'square-outline'} size={22} color="#0A3824" />
                  <Text style={[s.value, { flex: 1 }]}>Certified true and correct. This replaces the signature on the paper form.</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleSubmit} disabled={submitting} style={[s.btnSubmit, submitting && { opacity: 0.7 }]} activeOpacity={0.85}>
                  {submitting ? <ActivityIndicator color="#E4DBC4" /> : <Text style={s.btnSubmitText}>Submit to OJT Coordinator</Text>}
                </TouchableOpacity>
              </>
            )}
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ marginBottom: 8 }}>
      <Text style={s.label}>{label}</Text>
      <Text style={s.value}>{value || '-'}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F4F6F2' },
  center: { flex: 1, backgroundColor: '#F4F6F2', justifyContent: 'center', alignItems: 'center' },
  header: { backgroundColor: '#FFFEFB', paddingHorizontal: 20, paddingTop: 14, paddingBottom: 15, borderBottomWidth: 1, borderBottomColor: '#DCE5DB' },
  kicker: { color: '#65806D', fontSize: 10, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase' },
  title: { color: '#092E1D', fontSize: 20, fontWeight: '800', marginTop: 2 },
  subtitle: { color: '#68776B', fontSize: 11, marginTop: 2 },
  content: { padding: 20, gap: 12, paddingBottom: 40 },
  part: { fontSize: 13, fontWeight: '800', color: '#0A3824', marginTop: 6 },
  card: { backgroundColor: '#ffffff', borderRadius: 16, borderWidth: 1, borderColor: '#DCE5DB', padding: 16 },
  cardTitle: { fontSize: 14, fontWeight: '800', color: '#18271D' },
  muted: { fontSize: 12, color: '#68776B', marginTop: 2 },
  label: { fontSize: 11, fontWeight: '700', color: '#526257', marginTop: 4, marginBottom: 2 },
  value: { fontSize: 13, color: '#26372D' },
  input: { borderWidth: 1.5, borderColor: '#DCE5DB', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 13, color: '#18271D', backgroundColor: '#F7F9F5' },
  scaleRow: { flexDirection: 'row', gap: 8, marginTop: 6 },
  scaleBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, backgroundColor: '#F4F6F2', borderWidth: 1, borderColor: '#DCE5DB', alignItems: 'center' },
  scaleBtnActive: { backgroundColor: '#0A3824', borderColor: '#0A3824' },
  scaleText: { fontSize: 14, fontWeight: '700', color: '#37483C' },
  scaleTextActive: { color: '#E4DBC4' },
  total: { fontSize: 18, fontWeight: '900', color: '#0A3824', textAlign: 'right', marginTop: 4 },
  certRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 },
  btnSubmit: { backgroundColor: '#0A3824', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  btnSubmitText: { color: '#E4DBC4', fontSize: 14, fontWeight: '800' },
  alertError: { backgroundColor: '#fbf2f2', borderWidth: 1, borderColor: '#f1cdcd', borderRadius: 14, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 10 },
  alertErrorText: { color: '#7f1d1d', fontSize: 13, fontWeight: '600', flex: 1, lineHeight: 18 },
});
