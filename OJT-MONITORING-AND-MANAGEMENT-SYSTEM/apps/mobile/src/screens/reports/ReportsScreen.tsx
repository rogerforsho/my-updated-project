import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, FlatList, RefreshControl,
  Modal, TextInput, ActivityIndicator, StyleSheet, ScrollView,
  KeyboardAvoidingView, Platform, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { compileWeeklyJournals, listStudentReports, submitStudentReport } from '../../services/reports';
import { isNetworkAvailable } from '../../lib/syncEngine';
import NetworkToast from '../../components/NetworkToast';
import { COMPILED_JOURNALS_TYPE, GATEWAY_DOCUMENT_SPECS, STUDENT_REPORT_TYPES, WEEKLY_JOURNAL_TYPE, describeReportType, isBundleType, reviewerHint, type DbReport } from '@ojt/shared';
import CompanyRequestModal from '../../components/CompanyRequestModal';
import IncidentReportModal from '../../components/IncidentReportModal';

const REPORT_TYPES = STUDENT_REPORT_TYPES;

function formatFileSize(bytes?: number): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ReportsScreen() {
  const insets = useSafeAreaInsets();
  const [reports, setReports] = useState<DbReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedType, setSelectedType] = useState(WEEKLY_JOURNAL_TYPE);
  const [attachedFile, setAttachedFile] = useState<{
    uri: string;
    name: string;
    size?: number;
    mimeType?: string;
  } | null>(null);
  const [remarks, setRemarks] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [modalError, setModalError] = useState('');
  const [isOffline, setIsOffline] = useState(false);
  const [companyRequestOpen, setCompanyRequestOpen] = useState(false);
  const [incidentOpen, setIncidentOpen] = useState(false);
  const [isCompleted, setIsCompleted] = useState<boolean | null>(null);
  const [hoursComplete, setHoursComplete] = useState(false);
  const [compiling, setCompiling] = useState(false);

  const load = useCallback(async () => {
    setError('');
    const online = await isNetworkAvailable();
    setIsOffline(!online);
    const result = await listStudentReports(1, 50);
    if (result.error) {
      setError(result.error.message);
    } else {
      setReports(result.data?.reports || []);
      setIsCompleted(result.data?.isCompleted ?? null);
      setHoursComplete(result.data?.hoursComplete ?? false);
    }
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = () => {
    setRefreshing(true);
    load();
  };

  const handleOpenModal = () => {
    setModalError('');
    setSelectedType(WEEKLY_JOURNAL_TYPE);
    setAttachedFile(null);
    setRemarks('');
    setModalOpen(true);
  };

  const handlePickDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/pdf',
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        if (!asset.name.toLowerCase().endsWith('.pdf') || (asset.mimeType && asset.mimeType !== 'application/pdf')) {
          setModalError('Only PDF files are accepted. Save or export your document as a PDF first.');
          return;
        }
        setAttachedFile({
          uri: asset.uri,
          name: asset.name,
          size: asset.size,
          mimeType: asset.mimeType,
        });
        setModalError('');
      }
    } catch (err: any) {
      setModalError(err?.message || 'Failed to select document.');
    }
  };

  const handleRemoveAttachedFile = () => {
    setAttachedFile(null);
  };

  const handleSubmit = async () => {
    setModalError('');
    if (!attachedFile) {
      setModalError('Please attach a PDF file.');
      return;
    }

    setSubmitting(true);
    let result: Awaited<ReturnType<typeof submitStudentReport>>;
    try {
      result = await submitStudentReport({
        report_type: selectedType,
        file_attachment: attachedFile,
        remarks: remarks.trim() || undefined,
      });
    } catch {
      result = { data: null, error: { code: 'SERVER_FAILURE', message: 'The submission failed. Check your connection and try again.' } };
    } finally {
      setSubmitting(false);
    }

    if (result.error) {
      setModalError(result.error.message);
      return;
    }

    setModalOpen(false);
    const routedTo = describeReportType(selectedType).reviewer === 'Supervisor' ? 'your HTE Supervisor' : 'your OJT Coordinator';
    setSuccess(`${describeReportType(selectedType).label} submitted. It was sent to ${routedTo} for review.`);
    load();
  };

  const journals = reports.filter(r => describeReportType(r.report_type).label === WEEKLY_JOURNAL_TYPE);
  const approvedJournals = journals.filter(r => r.supervisor_decision === 'approved').length;
  const pendingJournals = journals.filter(r => !r.supervisor_decision).length;
  const returnedJournals = journals.filter(r => r.supervisor_decision === 'returned').length;
  // A returned compile can be redone; anything else means the Coordinator already has one.
  const compiledSent = reports.some(r => r.report_type === COMPILED_JOURNALS_TYPE && r.status !== 'rejected');

  const runCompile = async () => {
    setCompiling(true);
    setError('');
    const result = await compileWeeklyJournals();
    setCompiling(false);
    if (result.error) { setError(result.error.message); return; }
    const skipped = result.data?.notIncluded.length ?? 0;
    setSuccess(`${result.data?.included ?? 0} journals were merged into one PDF and sent to your OJT Coordinator.${skipped ? ` ${skipped} could not be included (not a readable PDF).` : ''}`);
    load();
  };

  const handleCompile = () => {
    const warning = pendingJournals + returnedJournals;
    if (!warning) { runCompile(); return; }
    Alert.alert(
      'Some journals will be left out',
      `${warning} journal${warning === 1 ? ' is' : 's are'} still waiting for your Supervisor or was returned for correction. Only ${approvedJournals} approved journal${approvedJournals === 1 ? '' : 's'} will be compiled.`,
      [{ text: 'Wait', style: 'cancel' }, { text: 'Compile now', onPress: runCompile }],
    );
  };

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator size="large" color="#0A3824" />
      </View>
    );
  }

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      {/* Top Header */}
      <View style={s.header}>
        <View>
          <Text style={s.headerKicker}>Colegio de Montalban OJT</Text>
          <Text style={s.title}>Practicum Reports</Text>
          <Text style={s.subtitle}>Requirements, weekly journals & final report (PDF only)</Text>
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <TouchableOpacity onPress={() => setIncidentOpen(true)} style={s.btnSubmitHeader} activeOpacity={0.85}
          accessibilityRole="button" accessibilityLabel="Report a confidential concern to your OJT Coordinator">
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Ionicons name="shield-checkmark" size={16} color="#E4DBC4" />
            <Text style={s.btnSubmitHeaderText}>Report concern</Text>
          </View>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setCompanyRequestOpen(true)} style={s.btnSubmitHeader} activeOpacity={0.85}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Ionicons name="business" size={16} color="#E4DBC4" />
            <Text style={s.btnSubmitHeaderText}>Request HTE</Text>
          </View>
        </TouchableOpacity>
        {isCompleted === false && <TouchableOpacity
          onPress={handleOpenModal} style={s.btnSubmitHeader} activeOpacity={0.85}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Ionicons name="add-circle" size={16} color="#E4DBC4" />
            <Text style={s.btnSubmitHeaderText}>Submit</Text>
          </View>
        </TouchableOpacity>}
        </View>
      </View>

      {/* Alerts */}
      {isCompleted === true && <Text style={s.subtitle}>Your OJT is completed. Academic records are read-only.</Text>}
      {!!success && (
        <View style={s.alertSuccess}>
          <Ionicons name="checkmark-circle" size={18} color="#0A3824" />
          <Text style={s.alertSuccessText}>{success}</Text>
        </View>
      )}
      {!!error && (
        <View style={s.alertError}>
          <Ionicons name="alert-circle" size={18} color="#991b1b" />
          <Text style={s.alertErrorText}>{error}</Text>
          <TouchableOpacity
            onPress={() => setError('')}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel="Dismiss error"
          >
            <Ionicons name="close" size={16} color="#7f1d1d" />
          </TouchableOpacity>
        </View>
      )}

      {/* Reports List */}
      <FlatList
        data={reports}
        keyExtractor={(item) => item.report_id}
        contentContainerStyle={s.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#0A3824']} />}
        ListHeaderComponent={isCompleted === false ? (
          <View style={[s.reportCard, { borderColor: '#0A3824' }]}>
            <Text style={s.reportType}>Compile Weekly Journals</Text>
            <Text style={[s.dateText, { marginBottom: 8 }]}>
              Merges every Supervisor-approved Weekly Journal into one PDF and sends it to your OJT Coordinator.
            </Text>
            <Text style={s.remarksText}>{approvedJournals} approved · {pendingJournals} waiting for Supervisor · {returnedJournals} returned</Text>
            {compiledSent ? (
              <Text style={[s.remarksLabel, { marginTop: 10, color: '#0A3824' }]}>Your compiled journals are with your OJT Coordinator.</Text>
            ) : !hoursComplete ? (
              <Text style={[s.remarksLabel, { marginTop: 10 }]}>Unlocks when you complete your Required Hours.</Text>
            ) : (
              <TouchableOpacity
                onPress={handleCompile}
                disabled={compiling || approvedJournals === 0}
                style={[s.btnSubmitModal, { marginTop: 10, flex: 0 }, (compiling || approvedJournals === 0) && { opacity: 0.5 }]}
                activeOpacity={0.85}
              >
                {compiling ? <ActivityIndicator color="#E4DBC4" /> : <Text style={s.btnSubmitModalText}>Compile and send to Coordinator</Text>}
              </TouchableOpacity>
            )}
          </View>
        ) : null}
        ListEmptyComponent={
          <View style={s.emptyBox}>
            <Ionicons name="document-text-outline" size={44} color="#879687" style={{ marginBottom: 8 }} />
            <Text style={s.emptyTitle}>No reports submitted yet</Text>
            <Text style={s.emptySub}>
              {isCompleted ? 'Your completed OJT records are read-only.' : 'Tap the Submit button at the top to upload your weekly journal as a PDF.'}
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={s.reportCard}>
            <View style={s.cardTopRow}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                <Ionicons name="document-attach-outline" size={18} color="#0A3824" />
                <View style={{ flex: 1 }}>
                  <Text style={s.reportType}>{describeReportType(item.report_type).label}</Text>
                  <Text style={s.dateText}>{describeReportType(item.report_type).reviewer === 'Supervisor' ? 'HTE Supervisor review' : 'OJT Coordinator review'}</Text>
                </View>
              </View>

              <View style={[
                s.statusBadge,
                item.status === 'reviewed' || item.status === 'approved' || item.supervisor_decision === 'approved' ? s.badgeGreen : s.badgeAmber
              ]}>
                <Text style={[
                  s.statusBadgeText,
                  item.status === 'reviewed' || item.status === 'approved' || item.supervisor_decision === 'approved' ? s.textGreen : s.textAmber
                ]}>
                  {item.supervisor_decision === 'approved' ? 'Supervisor approved' : item.supervisor_decision === 'returned' ? 'Returned for correction' : item.status === 'approved' || item.status === 'reviewed' ? 'Coordinator approved' : item.status === 'rejected' ? 'Coordinator returned' : 'Pending review'}
                </Text>
              </View>
            </View>

            <Text style={s.dateText}>
              Submitted on {new Date(item.submission_date).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
            </Text>

            <View style={s.fileBox}>
              <Text style={s.fileText} numberOfLines={1}>
                {item.file_path}
              </Text>
            </View>

            {!!item.remarks && (
              <View style={s.remarksBox}>
                <Text style={s.remarksLabel}>{item.status === 'rejected' ? 'Coordinator note (fix and resubmit):' : 'Remarks:'}</Text>
                <Text style={s.remarksText}>{item.remarks}</Text>
              </View>
            )}
          </View>
        )}
      />

      {/* Submission Modal */}
      <Modal
        visible={modalOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setModalOpen(false)}
      >
        <KeyboardAvoidingView
          style={s.modalBackdrop}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={s.modalContent}>
            {/* Pinned Modal Header */}
            <View style={s.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={s.modalTitle}>Submit Practicum Report</Text>
                <Text style={s.modalSubtitle}>PDF files only. Each type shows who reviews it.</Text>
              </View>
              <TouchableOpacity
                onPress={() => setModalOpen(false)}
                style={{ padding: 4 }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel="Close modal"
              >
                <Ionicons name="close-circle" size={26} color="#879687" />
              </TouchableOpacity>
            </View>

            {/* Scrollable Form Body */}
            <ScrollView
              style={s.modalScroll}
              contentContainerStyle={s.modalScrollContent}
              showsVerticalScrollIndicator={true}
              keyboardShouldPersistTaps="handled"
            >
              {!!modalError && (
                <View style={s.alertError}>
                  <Ionicons name="alert-circle" size={16} color="#991b1b" />
                  <Text style={s.alertErrorText}>{modalError}</Text>
                </View>
              )}

              <Text style={s.fieldLabel}>Document Type</Text>
              <View style={s.typeWrap}>
                {REPORT_TYPES.map((type) => (
                  <TouchableOpacity
                    key={type}
                    onPress={() => setSelectedType(type)}
                    style={[s.typePill, selectedType === type && s.typePillActive]}
                    activeOpacity={0.8}
                  >
                    <Text style={[s.typePillText, selectedType === type && s.typePillTextActive]}>
                      {describeReportType(type).label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                <Ionicons name="paper-plane-outline" size={14} color="#0A3824" />
                <Text style={{ fontSize: 12, fontWeight: '700', color: '#0A3824', flex: 1 }}>{reviewerHint(selectedType)}</Text>
              </View>

              {isBundleType(selectedType) ? (
                <View style={{ marginBottom: 12, padding: 12, borderRadius: 10, backgroundColor: '#F3F0E4' }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: '#0A3824', marginBottom: 6 }}>
                    Upload ONE PDF that contains all of these (max 25 MB):
                  </Text>
                  {GATEWAY_DOCUMENT_SPECS.map((spec, i) => (
                    <View key={spec.id} style={{ marginBottom: 4 }}>
                      <Text style={{ fontSize: 12, color: '#0A3824' }}>{i + 1}. {spec.name}</Text>
                      {spec.hint ? <Text style={{ fontSize: 11, color: '#526257', marginLeft: 14 }}>{spec.hint}</Text> : null}
                    </View>
                  ))}
                  <Text style={{ fontSize: 11, color: '#526257', marginTop: 6 }}>
                    Put each document on its own page, in this order. Combine scanned pages into a single PDF before uploading.
                  </Text>
                </View>
              ) : null}

              <Text style={s.fieldLabel}>Attach Document File</Text>
              {attachedFile ? (
                <View style={s.attachedCard}>
                  <View style={s.attachedIconWrap}>
                    <Ionicons name="document-text" size={22} color="#0A3824" />
                  </View>
                  <View style={{ flex: 1, marginRight: 8 }}>
                    <Text style={s.attachedFileName} numberOfLines={1}>
                      {attachedFile.name}
                    </Text>
                    <Text style={s.attachedFileSize}>
                      {formatFileSize(attachedFile.size) || 'Ready to upload'}
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={handleRemoveAttachedFile}
                    style={s.btnRemoveAttachment}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="trash-outline" size={18} color="#dc2626" />
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity
                  onPress={handlePickDocument}
                  style={s.btnAttachFile}
                  activeOpacity={0.8}
                >
                  <Ionicons name="cloud-upload-outline" size={20} color="#0A3824" />
                  <Text style={s.btnAttachFileText}>Choose PDF</Text>
                </TouchableOpacity>
              )}

              <Text style={s.fieldLabel}>Student Remarks (Optional)</Text>
              <TextInput
                value={remarks}
                onChangeText={setRemarks}
                placeholder="Add any notes for your reviewer..."
                placeholderTextColor="#879687"
                style={[s.input, { height: 68, textAlignVertical: 'top' }]}
                multiline
              />
            </ScrollView>

            {/* Pinned Action Buttons (Always Visible at bottom!) */}
            <View style={s.modalFooter}>
              <View style={s.modalBtnRow}>
                <TouchableOpacity
                  onPress={() => setModalOpen(false)}
                  style={s.btnCancelModal}
                  activeOpacity={0.85}
                >
                  <Text style={s.btnCancelModalText}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={handleSubmit}
                  disabled={submitting}
                  style={[s.btnSubmitModal, submitting && { opacity: 0.7 }]}
                  activeOpacity={0.85}
                >
                  {submitting ? (
                    <ActivityIndicator color="#092E1D" />
                  ) : (
                    <Text style={s.btnSubmitModalText}>Submit Report</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
      <CompanyRequestModal visible={companyRequestOpen} onClose={() => setCompanyRequestOpen(false)} />
      <IncidentReportModal visible={incidentOpen} onClose={() => setIncidentOpen(false)} />

      <NetworkToast isOffline={isOffline} />
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F4F6F2' },
  center: { flex: 1, backgroundColor: '#F4F6F2', justifyContent: 'center', alignItems: 'center' },
  header: {
    backgroundColor: '#FFFEFB',
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 15,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#DCE5DB',
  },
  headerKicker: {
    color: '#A8792B',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  title: { color: '#092E1D', fontSize: 20, fontWeight: '800', marginTop: 2 },
  subtitle: { color: '#68776B', fontSize: 11, marginTop: 2 },
  btnSubmitHeader: {
    backgroundColor: '#0A3824',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#0A3824',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 3,
  },
  btnSubmitHeaderText: { color: '#FFFEFB', fontSize: 12, fontWeight: '800', letterSpacing: 0.2 },
  listContent: { padding: 20, gap: 14 },
  alertSuccess: {
    backgroundColor: 'rgba(10,56,36,0.08)',
    borderWidth: 1,
    borderColor: '#0A3824',
    borderRadius: 14,
    padding: 14,
    marginHorizontal: 20,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  alertSuccessText: { color: '#0A3824', fontSize: 13, fontWeight: '700', flex: 1 },
  alertError: {
    backgroundColor: '#fbf2f2',
    borderWidth: 1,
    borderColor: '#f1cdcd',
    borderRadius: 14,
    padding: 14,
    marginHorizontal: 20,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  alertErrorText: { color: '#7f1d1d', fontSize: 13, fontWeight: '600', flex: 1, lineHeight: 18 },
  reportCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#DCE5DB',
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  cardTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  reportType: { fontSize: 14, fontWeight: '800', color: '#18271D' },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  badgeGreen: { backgroundColor: 'rgba(10,56,36,0.1)' },
  textGreen: { color: '#0A3824', fontSize: 11, fontWeight: '800', textTransform: 'capitalize' },
  badgeAmber: { backgroundColor: '#fef3c7' },
  textAmber: { color: '#d97706', fontSize: 11, fontWeight: '800', textTransform: 'capitalize' },
  statusBadgeText: { fontSize: 11, fontWeight: '700' },
  dateText: { fontSize: 11, color: '#879687', marginBottom: 10 },
  fileBox: { backgroundColor: '#F7F9F5', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: '#F4F6F2' },
  fileText: { fontSize: 12, color: '#37483C', fontWeight: '500' },
  remarksBox: { marginTop: 10, borderTopWidth: 1, borderTopColor: '#F4F6F2', paddingTop: 8 },
  remarksLabel: { fontSize: 11, fontWeight: '700', color: '#526257', marginBottom: 2 },
  remarksText: { fontSize: 12, color: '#26372D' },
  emptyBox: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60, paddingHorizontal: 20 },
  emptyTitle: { fontSize: 16, fontWeight: '800', color: '#18271D', marginBottom: 4 },
  emptySub: { fontSize: 12, color: '#879687', textAlign: 'center', maxWidth: 260 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalContent: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 18,
    paddingHorizontal: 20,
    paddingBottom: 16,
    maxHeight: '88%',
    display: 'flex',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F4F6F2',
  },
  modalTitle: { fontSize: 18, fontWeight: '900', color: '#0A3824' },
  modalSubtitle: { fontSize: 11, color: '#526257', fontWeight: '500', marginTop: 1 },
  modalScroll: { flexShrink: 1 },
  modalScrollContent: { paddingBottom: 14 },
  modalFooter: {
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F4F6F2',
    backgroundColor: '#ffffff',
  },
  fieldLabel: { fontSize: 12, fontWeight: '700', color: '#37483C', marginBottom: 6, marginTop: 10 },
  typeWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 6 },
  typePill: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: '#F4F6F2', borderWidth: 1, borderColor: '#DCE5DB' },
  typePillActive: { backgroundColor: '#0A3824', borderColor: '#0A3824' },
  typePillText: { fontSize: 11, fontWeight: '600', color: '#37483C' },
  typePillTextActive: { color: '#E4DBC4', fontWeight: '800' },
  btnAttachFile: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'rgba(10,56,36,0.06)',
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: '#0A3824',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  btnAttachFileText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0A3824',
  },
  attachedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0fdf4',
    borderWidth: 1,
    borderColor: '#bbf7d0',
    borderRadius: 12,
    padding: 12,
  },
  attachedIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: 'rgba(10,56,36,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  attachedFileName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#18271D',
  },
  attachedFileSize: {
    fontSize: 11,
    fontWeight: '500',
    color: '#16a34a',
    marginTop: 2,
  },
  btnRemoveAttachment: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: '#fee2e2',
  },
  orDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 10,
    gap: 8,
  },
  orLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#DCE5DB',
  },
  orText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#879687',
    letterSpacing: 0.5,
  },
  input: { borderWidth: 1.5, borderColor: '#DCE5DB', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 13, color: '#18271D', backgroundColor: '#F7F9F5' },
  modalBtnRow: { flexDirection: 'row', gap: 10 },
  btnCancelModal: { flex: 1, backgroundColor: '#F4F6F2', borderRadius: 12, paddingVertical: 13, alignItems: 'center', borderWidth: 1, borderColor: '#C7D2C7' },
  btnCancelModalText: { color: '#37483C', fontSize: 13, fontWeight: '800' },
  btnSubmitModal: { flex: 2, backgroundColor: '#0A3824', borderRadius: 12, paddingVertical: 13, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(228,219,196,0.3)' },
  btnSubmitModalText: { color: '#E4DBC4', fontSize: 13, fontWeight: '800' },
});
