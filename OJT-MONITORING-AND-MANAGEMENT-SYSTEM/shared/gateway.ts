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
export const BUNDLE_EXTENSIONS = ['.pdf', '.docx', '.doc'] as const;

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

export const STUDENT_REPORT_TYPES = [
  PRE_DEPLOYMENT_BUNDLE_TYPE,
  'Daily Journal',
  'Weekly Progress',
  'Accomplishment Report',
  'Incident Report',
  'final_report',
];

export const FINAL_REPORT_TYPE = 'final_report';

/** Coordinator-reviewed: gateway credentials and the final report (clearance reads the latter). */
export function isCoordinatorReviewType(type: string): boolean {
  return type?.trim() === FINAL_REPORT_TYPE || isBundleType(type) || GATEWAY_DOCUMENT_SPECS.some(spec => matchesDoc(type, spec.name));
}

export const SUPERVISOR_REVIEW_REPORT_TYPES = [
  'Daily Journal',
  'Accomplishment Report',
];

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
