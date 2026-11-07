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

export function getGatewayStatus(reports: Array<{ report_type: string }>) {
  const missing = GATEWAY_DOCUMENT_SPECS
    .filter(spec => !reports.some(report => matchesDoc(report.report_type, spec.name)))
    .map(spec => spec.name);
  return { isCleared: missing.length === 0, approvedCount: GATEWAY_DOCUMENT_SPECS.length - missing.length, missing };
}

export const STUDENT_REPORT_TYPES = [
  'Parent/Guardian Consent Waiver',
  'Medical Certificate',
  'Pre-OJT Orientation Certificate',
  'Endorsement Letter',
  'Daily Journal',
  'Weekly Progress',
  'Accomplishment Report',
  'Incident Report',
  'final_report',
];

export const FINAL_REPORT_TYPE = 'final_report';

/** Coordinator-reviewed: gateway credentials and the final report (clearance reads the latter). */
export function isCoordinatorReviewType(type: string): boolean {
  return type?.trim() === FINAL_REPORT_TYPE || GATEWAY_DOCUMENT_SPECS.some(spec => matchesDoc(type, spec.name));
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
