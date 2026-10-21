export interface GatewayDocumentSpec {
  id: string;
  name: string;
}

export const GATEWAY_DOCUMENT_SPECS: GatewayDocumentSpec[] = [
  { id: 'orientation', name: 'Pre-OJT Orientation Certificate' },
  { id: 'endorsement', name: 'Endorsement Letter' },
];

export const STUDENT_REPORT_TYPES = [
  'Pre-OJT Orientation Certificate',
  'Endorsement Letter',
  'Daily Journal',
  'Weekly Progress',
  'Accomplishment Report',
  'Incident Report',
];

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
    return 'Medical Clearance';
  }
  return type.trim();
}

export function matchesDoc(submittedType: string, specName: string): boolean {
  if (!submittedType || !specName) return false;
  const normSubmitted = normalizeDocType(submittedType);
  const normSpec = normalizeDocType(specName);
  return normSubmitted.toLowerCase() === normSpec.toLowerCase();
}
