import React, { useState, useEffect } from 'react';
import {
  Modal, View, Text, TouchableOpacity, ScrollView,
  TextInput, ActivityIndicator, StyleSheet, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { fetchCompaniesList, fetchStudentScheduleProposal, submitScheduleProposal } from '../services/schedule';
import { MAX_DAILY_HOURS, MAX_WEEKLY_HOURS, validateSchedulePolicy } from '@ojt/shared';
import type { WorkModality, DbPracticumSchedule } from '@ojt/shared';

interface Props {
  visible: boolean;
  onClose: () => void;
  onSubmitted: () => void;
}

const DAYS_OF_WEEK = [
  { id: 1, label: 'Mon', full: 'Monday' },
  { id: 2, label: 'Tue', full: 'Tuesday' },
  { id: 3, label: 'Wed', full: 'Wednesday' },
  { id: 4, label: 'Thu', full: 'Thursday' },
  { id: 5, label: 'Fri', full: 'Friday' },
  { id: 6, label: 'Sat', full: 'Saturday' },
];

const MODALITIES: { key: WorkModality; label: string; icon: any }[] = [
  { key: 'on_site', label: 'On-site', icon: 'business-outline' },
  { key: 'hybrid', label: 'Hybrid', icon: 'repeat-outline' },
  { key: 'remote', label: 'Remote / WFH', icon: 'laptop-outline' },
];

export default function ScheduleProposalModal({ visible, onClose, onSubmitted }: Props) {
  const [companies, setCompanies] = useState<Array<{ company_id: string; company_name: string; address: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const [companyId, setCompanyId] = useState('');
  const [modality, setModality] = useState<WorkModality>('on_site');
  const [selectedDays, setSelectedDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [timeIn, setTimeIn] = useState('08:00');
  const [timeOut, setTimeOut] = useState('17:00');
  const [lunchMinutes, setLunchMinutes] = useState(60);
  const [lunchBreakStart, setLunchBreakStart] = useState('');
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState('');
  const [notes, setNotes] = useState('');
  const [existingProposal, setExistingProposal] = useState<DbPracticumSchedule | null>(null);

  useEffect(() => {
    if (visible) {
      loadData();
    }
  }, [visible]);

  async function loadData() {
    setLoading(true);
    setError('');
    const [compRes, schedRes] = await Promise.all([
      fetchCompaniesList(),
      fetchStudentScheduleProposal(),
    ]);

    if (compRes.data) setCompanies(compRes.data);
    if (schedRes.data) {
      const s = schedRes.data;
      setExistingProposal(s);
      if (s.company_id) setCompanyId(s.company_id);
      if (s.work_modality) setModality(s.work_modality);
      if (s.work_days) setSelectedDays(s.work_days);
      if (s.time_in) setTimeIn(s.time_in.substring(0, 5));
      if (s.time_out) setTimeOut(s.time_out.substring(0, 5));
      if (s.lunch_break_minutes != null) setLunchMinutes(s.lunch_break_minutes);
      if (s.lunch_break_start) setLunchBreakStart(s.lunch_break_start.substring(0, 5));
      if (s.start_date) setStartDate(s.start_date);
      if (s.end_date) setEndDate(s.end_date);
      if (s.student_notes) setNotes(s.student_notes);
    } else if (compRes.data && compRes.data.length > 0 && !companyId) {
      setCompanyId(compRes.data[0].company_id);
    }
    setLoading(false);
  }

  function toggleDay(id: number) {
    if (selectedDays.includes(id)) {
      if (selectedDays.length === 1) return; // Must keep at least one
      setSelectedDays(selectedDays.filter(d => d !== id));
    } else {
      setSelectedDays([...selectedDays, id].sort());
    }
  }

  // Live calculations
  const [inH, inM] = timeIn.split(':').map(Number);
  const [outH, outM] = timeOut.split(':').map(Number);
  const startMin = (inH || 0) * 60 + (inM || 0);
  const endMin = (outH || 0) * 60 + (outM || 0);
  const isTimeOrderValid = startMin < endMin;
  const shiftMin = isTimeOrderValid ? (endMin - startMin) - lunchMinutes : 0;
  const dailyHours = isTimeOrderValid ? Math.max(0, Math.round((shiftMin / 60) * 100) / 100) : 0;
  const weeklyHours = Math.round((dailyHours * selectedDays.length) * 100) / 100;
  const schedulePolicy = validateSchedulePolicy({
    work_days: selectedDays,
    time_in: timeIn,
    time_out: timeOut,
    lunch_break_minutes: lunchMinutes,
    lunch_break_start: lunchMinutes > 0 ? lunchBreakStart : null,
    start_date: startDate,
    end_date: endDate || null,
    work_modality: modality,
  });
  const isChedCompliant = schedulePolicy.ok;
  const isDailyExceeded = dailyHours > MAX_DAILY_HOURS;
  const isWeeklyExceeded = weeklyHours > MAX_WEEKLY_HOURS;

  async function handleSubmit() {
    setError('');
    if (!isChedCompliant) {
      setError('Please resolve schedule compliance errors before submitting.');
      return;
    }
    if (!startDate) {
      setError('Please enter a target practicum start date.');
      return;
    }

    setSubmitting(true);
    const result = await submitScheduleProposal({
      company_id: companyId || null,
      custom_company_name: null,
      work_modality: modality,
      work_days: selectedDays,
      time_in: timeIn,
      time_out: timeOut,
      lunch_break_minutes: lunchMinutes,
      lunch_break_start: lunchMinutes > 0 ? lunchBreakStart : null,
      start_date: startDate,
      end_date: endDate || null,
      student_notes: notes.trim() || null,
    });
    setSubmitting(false);

    if (result.error) {
      setError(result.error.message);
      return;
    }

    Alert.alert(
      'Schedule Proposal Submitted',
      'Your practicum work schedule proposal has been sent to your OJT Coordinator for verification and industry deployment.',
      [{ text: 'OK', onPress: () => { onSubmitted(); onClose(); } }]
    );
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={s.overlay}>
        <View style={s.modalContainer}>
          {/* Header */}
          <View style={s.header}>
            <View>
              <Text style={s.headerTitle}>Practicum Work Schedule</Text>
              <Text style={s.headerSubtitle}>Propose your weekly commitment (Option A)</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={s.closeBtn}>
              <Ionicons name="close" size={22} color="#526257" />
            </TouchableOpacity>
          </View>

          {loading ? (
            <View style={{ padding: 40, alignItems: 'center' }}>
              <ActivityIndicator size="large" color="#0A3824" />
              <Text style={{ marginTop: 12, fontSize: 13, color: '#526257' }}>Loading schedule details...</Text>
            </View>
          ) : (
            <ScrollView style={s.body} contentContainerStyle={{ paddingBottom: 30 }} showsVerticalScrollIndicator={false}>
              {existingProposal && (
                <View style={[
                  s.statusBanner,
                  existingProposal.status === 'approved' ? s.statusBannerApproved :
                  existingProposal.status === 'rejected' || existingProposal.status === 'modified' ? s.statusBannerRejected : s.statusBannerPending
                ]}>
                  <Text style={s.statusBannerTitle}>
                    {existingProposal.status === 'approved' ? '✓ Schedule Approved' :
                     existingProposal.status === 'rejected' ? '⚠️ Schedule Rejected: Please Revise and Resubmit' :
                     existingProposal.status === 'modified' ? '⚠️ Coordinator Requested Changes' : '⏳ Pending OJT Coordinator Review'}
                  </Text>
                  {existingProposal.coordinator_feedback && (
                    <Text style={s.statusBannerText}>
                      OJT Coordinator Remarks: {existingProposal.coordinator_feedback}
                    </Text>
                  )}
                </View>
              )}

              {/* Host Establishment Selection */}
              <View style={s.section}>
                <Text style={s.sectionTitle}>1. Host Training Establishment</Text>
                <Text style={s.label}>Select Accredited Partner Company</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    {companies.map(c => (
                      <TouchableOpacity
                        key={c.company_id}
                        onPress={() => setCompanyId(c.company_id)}
                        style={[s.compPill, companyId === c.company_id && s.compPillActive]}
                        activeOpacity={0.7}
                      >
                        <Text style={[s.compPillText, companyId === c.company_id && s.compPillTextActive]}>
                          {c.company_name}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>

                <Text style={s.helperText}>If your HTE is not listed, submit an HTE request from the Reports tab. Your Coordinator will verify the HTE and choose the approved branch.</Text>
              </View>

              {/* Work Modality */}
              <View style={s.section}>
                <Text style={s.sectionTitle}>2. Work Modality</Text>
                <View style={s.modalityRow}>
                  {MODALITIES.map(m => (
                    <TouchableOpacity
                      key={m.key}
                      onPress={() => setModality(m.key)}
                      style={[s.modalityBtn, modality === m.key && s.modalityBtnActive]}
                      activeOpacity={0.7}
                    >
                      <Ionicons
                        name={m.icon}
                        size={18}
                        color={modality === m.key ? '#E4DBC4' : '#37483C'}
                      />
                      <Text style={[s.modalityText, modality === m.key && s.modalityTextActive]}>
                        {m.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Weekly Work Days */}
              <View style={s.section}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={s.sectionTitle}>3. Weekly Work Days</Text>
                  <Text style={{ fontSize: 11, color: '#0A3824', fontWeight: '700' }}>
                    {selectedDays.length} Days Selected
                  </Text>
                </View>
                <View style={s.daysRow}>
                  {DAYS_OF_WEEK.map(d => {
                    const selected = selectedDays.includes(d.id);
                    return (
                      <TouchableOpacity
                        key={d.id}
                        onPress={() => toggleDay(d.id)}
                        style={[s.dayBtn, selected && s.dayBtnActive]}
                        activeOpacity={0.7}
                      >
                        <Text style={[s.dayBtnText, selected && s.dayBtnTextActive]}>{d.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <Text style={s.helperText}>Sundays are prohibited per institutional practicum policy.</Text>
              </View>

              {/* Daily Shift Hours */}
              <View style={s.section}>
                <Text style={s.sectionTitle}>4. Daily Shift Hours (24-Hour Format)</Text>
                <View style={s.timeRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.label}>Time In</Text>
                    <TextInput
                      style={s.timeInput}
                      value={timeIn}
                      onChangeText={setTimeIn}
                      placeholder="08:00"
                      placeholderTextColor="#879687"
                      keyboardType="numbers-and-punctuation"
                    />
                  </View>
                  <Text style={{ alignSelf: 'center', marginTop: 16, fontSize: 16, color: '#879687' }}>➔</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={s.label}>Time Out</Text>
                    <TextInput
                      style={s.timeInput}
                      value={timeOut}
                      onChangeText={setTimeOut}
                      placeholder="17:00"
                      placeholderTextColor="#879687"
                      keyboardType="numbers-and-punctuation"
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.label}>Lunch Break</Text>
                    <TextInput
                      style={s.timeInput}
                      value={lunchMinutes.toString()}
                      onChangeText={v => setLunchMinutes(parseInt(v) || 0)}
                      placeholder="60 mins"
                      placeholderTextColor="#879687"
                      keyboardType="numeric"
                    />
                  </View>
                </View>

                <View style={{ marginTop: 8 }}>
                  <Text style={s.label}>Lunch Break Starts (24-hour time)</Text>
                  <TextInput
                    style={s.timeInput}
                    value={lunchBreakStart}
                    onChangeText={setLunchBreakStart}
                    placeholder={lunchMinutes > 0 ? 'e.g. 12:00' : 'Not required when break is 0'}
                    placeholderTextColor="#879687"
                    keyboardType="numbers-and-punctuation"
                  />
                  <Text style={s.helperText}>Only the lunch minutes that overlap your recorded shift are deducted.</Text>
                </View>

                {/* Live CHED Compliance Card */}
                <View style={[
                  s.complianceCard,
                  isChedCompliant ? s.complianceCardValid : s.complianceCardInvalid
                ]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Ionicons
                      name={isChedCompliant ? "shield-checkmark" : "warning"}
                      size={20}
                      color={isChedCompliant ? "#0A3824" : "#b91c1c"}
                    />
                    <Text style={[s.complianceTitle, { color: isChedCompliant ? '#0A3824' : '#b91c1c' }]}>
                      {isChedCompliant ? 'CHED CMO 104 Compliant' : 'Guidelines Non-Compliant'}
                    </Text>
                  </View>

                  <View style={s.metricsRow}>
                    <View style={s.metricItem}>
                      <Text style={s.metricLabel}>Daily Rendered</Text>
                      <Text style={[s.metricValue, isDailyExceeded && { color: '#b91c1c' }]}>
                        {dailyHours} hrs / day
                      </Text>
                      <Text style={s.metricSub}>Max {MAX_DAILY_HOURS.toFixed(1)} hrs/day</Text>
                    </View>

                    <View style={s.metricDivider} />

                    <View style={s.metricItem}>
                      <Text style={s.metricLabel}>Weekly Commitment</Text>
                      <Text style={[s.metricValue, isWeeklyExceeded && { color: '#b91c1c' }]}>
                        {weeklyHours} hrs / week
                      </Text>
                      <Text style={s.metricSub}>Max {MAX_WEEKLY_HOURS.toFixed(1)} hrs/wk</Text>
                    </View>
                  </View>

                  {!schedulePolicy.ok && (
                    <Text style={s.complianceWarning}>{schedulePolicy.message}</Text>
                  )}
                </View>
              </View>

              {/* Practicum Period */}
              <View style={s.section}>
                <Text style={s.sectionTitle}>5. Practicum Period</Text>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.label}>Target Start Date (YYYY-MM-DD)</Text>
                    <TextInput
                      style={s.input}
                      value={startDate}
                      onChangeText={setStartDate}
                      placeholder="2026-10-01"
                      placeholderTextColor="#879687"
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.label}>Expected End Date (Optional)</Text>
                    <TextInput
                      style={s.input}
                      value={endDate}
                      onChangeText={setEndDate}
                      placeholder="2026-12-15"
                      placeholderTextColor="#879687"
                    />
                  </View>
                </View>
              </View>

              {/* Remarks / Errand Notes */}
              <View style={s.section}>
                <Text style={s.sectionTitle}>6. Student Remarks / Notes (Optional)</Text>
                <TextInput
                  style={[s.input, { height: 60, textAlignVertical: 'top' }]}
                  multiline
                  placeholder="e.g., Assigned to IT Department, special shift request, or orientation date."
                  value={notes}
                  onChangeText={setNotes}
                  placeholderTextColor="#879687"
                />
              </View>

              {!!error && (
                <View style={s.errorBox}>
                  <Text style={s.errorText}>{error}</Text>
                </View>
              )}

              <TouchableOpacity
                style={[s.submitBtn, (!isChedCompliant || submitting) && s.submitBtnDisabled]}
                onPress={handleSubmit}
                disabled={!isChedCompliant || submitting}
                activeOpacity={0.85}
              >
                {submitting ? (
                  <ActivityIndicator color="#E4DBC4" />
                ) : (
                  <Text style={s.submitBtnText}>
                    {existingProposal ? 'Update Practicum Schedule' : 'Submit Schedule Proposal'}
                  </Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '92%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F4F6F2',
  },
  headerTitle: { fontSize: 17, fontWeight: '800', color: '#0A3824' },
  headerSubtitle: { fontSize: 11, color: '#526257', marginTop: 1 },
  closeBtn: { padding: 6, borderRadius: 20, backgroundColor: '#F4F6F2' },
  body: { paddingHorizontal: 20, paddingTop: 14 },
  statusBanner: {
    padding: 12,
    borderRadius: 12,
    marginBottom: 14,
    borderWidth: 1,
  },
  statusBannerPending: {
    backgroundColor: '#fefce8',
    borderColor: '#fef08a',
  },
  statusBannerApproved: {
    backgroundColor: '#ecfdf5',
    borderColor: '#a7f3d0',
  },
  statusBannerRejected: {
    backgroundColor: '#fef2f2',
    borderColor: '#fecaca',
  },
  statusBannerTitle: { fontSize: 12, fontWeight: '700', color: '#18271D' },
  statusBannerText: { fontSize: 11, color: '#37483C', marginTop: 2 },
  section: { marginBottom: 16 },
  sectionTitle: { fontSize: 13, fontWeight: '800', color: '#26372D', marginBottom: 8 },
  label: { fontSize: 11, fontWeight: '600', color: '#37483C', marginBottom: 4 },
  input: {
    borderWidth: 1,
    borderColor: '#C7D2C7',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 13,
    color: '#18271D',
    backgroundColor: '#F7F9F5',
  },
  compPill: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#C7D2C7',
    backgroundColor: '#F7F9F5',
  },
  compPillActive: {
    borderColor: '#0A3824',
    backgroundColor: '#0A3824',
  },
  compPillText: { fontSize: 12, fontWeight: '600', color: '#37483C' },
  compPillTextActive: { color: '#E4DBC4' },
  modalityRow: { flexDirection: 'row', gap: 8 },
  modalityBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#C7D2C7',
    backgroundColor: '#F7F9F5',
  },
  modalityBtnActive: {
    borderColor: '#0A3824',
    backgroundColor: '#0A3824',
  },
  modalityText: { fontSize: 11, fontWeight: '700', color: '#37483C' },
  modalityTextActive: { color: '#E4DBC4' },
  daysRow: { flexDirection: 'row', gap: 6, marginBottom: 4 },
  dayBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 9,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#C7D2C7',
    backgroundColor: '#F7F9F5',
  },
  dayBtnActive: {
    borderColor: '#0A3824',
    backgroundColor: '#0A3824',
  },
  dayBtnText: { fontSize: 12, fontWeight: '700', color: '#37483C' },
  dayBtnTextActive: { color: '#E4DBC4' },
  helperText: { fontSize: 10, color: '#879687', fontStyle: 'italic', marginTop: 2 },
  timeRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  timeInput: {
    borderWidth: 1,
    borderColor: '#C7D2C7',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 8,
    fontSize: 13,
    fontWeight: '700',
    color: '#18271D',
    backgroundColor: '#F7F9F5',
    textAlign: 'center',
  },
  complianceCard: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  complianceCardValid: {
    backgroundColor: '#f0fdf4',
    borderColor: '#bbf7d0',
  },
  complianceCardInvalid: {
    backgroundColor: '#fef2f2',
    borderColor: '#fecaca',
  },
  complianceTitle: { fontSize: 12, fontWeight: '800' },
  metricsRow: {
    flexDirection: 'row',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.06)',
  },
  metricItem: { flex: 1, alignItems: 'center' },
  metricLabel: { fontSize: 10, color: '#526257', fontWeight: '600' },
  metricValue: { fontSize: 14, fontWeight: '800', color: '#0A3824', marginTop: 2 },
  metricSub: { fontSize: 9, color: '#879687' },
  metricDivider: { width: 1, backgroundColor: 'rgba(0,0,0,0.08)', marginHorizontal: 8 },
  complianceWarning: { fontSize: 11, color: '#b91c1c', marginTop: 4, fontWeight: '600' },
  errorBox: {
    padding: 10,
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
    borderRadius: 10,
    marginBottom: 12,
  },
  errorText: { fontSize: 11, color: '#b91c1c', textAlign: 'center', fontWeight: '600' },
  submitBtn: {
    backgroundColor: '#0A3824',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 5,
    elevation: 3,
  },
  submitBtnDisabled: { opacity: 0.5 },
  submitBtnText: { color: '#E4DBC4', fontSize: 14, fontWeight: '800' },
});
