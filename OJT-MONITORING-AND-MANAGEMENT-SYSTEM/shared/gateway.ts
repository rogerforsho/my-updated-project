export interface GatewayDocumentSpec {
  id: string;
  name: string;
  /** Shown to the student when they pick this document type. */
  hint?: string;
}

/** Documents every student needs approved before proposing a schedule or being assigned to a company. */
export const GATEWAY_DOCUMENT_SPECS: GatewayDocumentSpec[] = [
  { id: 'consent', name: 'Parent/Guardian Consent Waiver', hint: 'Notarized waiver signed by your parent or guardian. Upload a photo or a PDF.' },
  { id: 'medical', name: 'Medical Certificate', hint: 'A valid medical certificate. Upload a photo or a PDF.' },
  { id: 'orientation', name: 'Pre-OJT Orientation Certificate' },
  { id: 'endorsement', name: 'Endorsement Letter' },
];

/** One PDF/DOCX holding every gateway document. Replaces the four separate uploads. */
export const PRE_DEPLOYMENT_BUNDLE_TYPE = 'Pre-deployment Requirements';
export const BUNDLE_MAX_BYTES = 25 * 1024 * 1024;
export const BUNDLE_EXTENSIONS = ['.pdf'] as const;

export function isBundleType(type: string): boolean {
  return type?.trim() === PRE_DEPLOYMENT_BUNDLE_TYPE;
}

/** Pass approved reports only. One approved bundle clears; so do the four legacy documents. */
export function getGatewayStatus(reports: Array<{ report_type: string }>) {
  if (reports.some(report => isBundleType(report.report_type))) {
    return { isCleared: true, approvedCount: GATEWAY_DOCUMENT_SPECS.length, missing: [] as string[] };
  }
  const missing = GATEWAY_DOCUMENT_SPECS
    .filter(spec => !reports.some(report => matchesDoc(report.report_type, spec.name)))
    .map(spec => spec.name);
  return { isCleared: missing.length === 0, approvedCount: GATEWAY_DOCUMENT_SPECS.length - missing.length, missing };
}

export const WEEKLY_JOURNAL_TYPE = 'Weekly Journal';
/** One merged PDF of every approved Weekly Journal. Built by the server, not picked by the student. */
export const COMPILED_JOURNALS_TYPE = 'Compiled Weekly Journals';
export const FINAL_REPORT_TYPE = 'final_report';
export const INCIDENT_REPORT_TYPE = 'Incident Report';

/** What a student can pick in the Submit form. Daily Journal and Accomplishment Report are retired. */
export const STUDENT_REPORT_TYPES = [
  PRE_DEPLOYMENT_BUNDLE_TYPE,
  WEEKLY_JOURNAL_TYPE,
  INCIDENT_REPORT_TYPE,
  FINAL_REPORT_TYPE,
];

/** Coordinator-reviewed: gateway credentials, the final report (clearance reads it) and the compiled journals. */
export function isCoordinatorReviewType(type: string): boolean {
  return type?.trim() === FINAL_REPORT_TYPE || type?.trim() === COMPILED_JOURNALS_TYPE || isBundleType(type) || GATEWAY_DOCUMENT_SPECS.some(spec => matchesDoc(type, spec.name));
}

/** Legacy types stay here so pending old rows can still be decided; students can no longer submit them. */
export const LEGACY_SUPERVISOR_REPORT_TYPES = ['Daily Journal', 'Accomplishment Report'];

export const SUPERVISOR_REVIEW_REPORT_TYPES = [WEEKLY_JOURNAL_TYPE, ...LEGACY_SUPERVISOR_REPORT_TYPES];

export type ReportReviewer = 'Supervisor' | 'Coordinator';

/** Display label and reviewer for a stored report_type. Stored values are never renamed in the UI layer. */
export function describeReportType(type: string): { label: string; reviewer: ReportReviewer; legacy: boolean } {
  const t = type?.trim() ?? '';
  if (t === FINAL_REPORT_TYPE) return { label: 'Final Report', reviewer: 'Coordinator', legacy: false };
  if (t === COMPILED_JOURNALS_TYPE) return { label: COMPILED_JOURNALS_TYPE, reviewer: 'Coordinator', legacy: false };
  if (t.toLowerCase() === 'weekly progress') return { label: WEEKLY_JOURNAL_TYPE, reviewer: 'Supervisor', legacy: false };
  const supervisorType = SUPERVISOR_REVIEW_REPORT_TYPES.find(s => s.toLowerCase() === t.toLowerCase());
  if (supervisorType) return { label: supervisorType, reviewer: 'Supervisor', legacy: LEGACY_SUPERVISOR_REPORT_TYPES.includes(supervisorType) };
  // Incident Report rows are only a Coordinator follow-up; the Coordinator is notified on submit.
  return { label: t, reviewer: 'Coordinator', legacy: false };
}

export function reviewerHint(type: string): string {
  return describeReportType(type).reviewer === 'Supervisor'
    ? 'Goes to your HTE Supervisor for review.'
    : 'Goes to your OJT Coordinator for review.';
}

/** Weekly Journal files stay small; the cap keeps the compiled PDF under the bucket limit. */
export const WEEKLY_JOURNAL_MAX_BYTES = 3 * 1024 * 1024;

export function normalizeDocType(type: string): string {
  const t = type.toLowerCase().trim();
  if (t.includes('moa')) return type.trim();
  if (t.includes('orientation') && (t.includes('cert') || t.includes('pre-ojt') || t.includes('completion') || t.includes('pre ojt') || t.includes('orientation certificate'))) {
    return 'Pre-OJT Orientation Certificate';
  }
  if (t.includes('endorsement') || t.includes('acceptance') || t.includes('placement letter')) {
    return 'Endorsement Letter';
  }
  if ((t.includes('student id') || t.includes('validated id') || t.includes('student identity') || t.includes('id card')) || (t === 'student id' || t === 'validated student id')) {
    return 'Validated Student ID';
  }
  if (t.includes('waiver') || t.includes('consent') || t.includes('parental')) {
    return 'Parent/Guardian Consent Waiver';
  }
  if (t.includes('medical') || t.includes('health clearance') || t.includes('physical exam')) {
    return 'Medical Certificate';
  }
  return type.trim();
}

export function matchesDoc(submittedType: string, specName: string): boolean {
  if (!submittedType || !specName) return false;
  const normSubmitted = normalizeDocType(submittedType);
  const normSpec = normalizeDocType(specName);
  return normSubmitted.toLowerCase() === normSpec.toLowerCase();
}
