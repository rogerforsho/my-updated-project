export const STUDENT_REGISTRATION_COURSES = ['BSIT', 'BS-CPE', 'BSBA-HRM', 'BSENTREP'] as const;

export type StudentRegistrationCourse = (typeof STUDENT_REGISTRATION_COURSES)[number];

// Matches course_department() in the database for the courses students can register with.
export const COURSE_DEPARTMENT: Record<StudentRegistrationCourse, 'ICS' | 'IBE'> = {
  BSIT: 'ICS',
  'BS-CPE': 'ICS',
  'BSBA-HRM': 'IBE',
  BSENTREP: 'IBE',
};

export function isStudentRegistrationCourse(course: string): course is StudentRegistrationCourse {
  return STUDENT_REGISTRATION_COURSES.some((approvedCourse) => approvedCourse === course.trim().toUpperCase());
}

// Required practicum hours per program. Mirrors required_hours_for_course() in the database.
export const REQUIRED_HOURS_BY_COURSE: Record<StudentRegistrationCourse, number> = {
  BSIT: 486,
  'BS-CPE': 240,
  'BSBA-HRM': 300,
  BSENTREP: 300,
};

// Contains-matching (not equality) so legacy spellings like "BSCPE" resolve the same way the database does.
export function requiredHoursForCourse(course: string | null | undefined): number | null {
  const c = (course ?? '').toUpperCase();
  if (c.includes('BSIT') || c.includes('INFORMATION TECHNOLOGY')) return REQUIRED_HOURS_BY_COURSE.BSIT;
  if (c.includes('BS-CPE') || c.includes('BSCPE') || c.includes('COMPUTER ENGINEERING')) return REQUIRED_HOURS_BY_COURSE['BS-CPE'];
  if (c.includes('BSBA') || c.includes('HUMAN RESOURCE')) return REQUIRED_HOURS_BY_COURSE['BSBA-HRM'];
  if (c.includes('BSENTREP') || c.includes('ENTREPRENEURSHIP')) return REQUIRED_HOURS_BY_COURSE.BSENTREP;
  return null;
}

/** The student's own value, else their program's hours, else the legacy default (BSIT's 486). */
export function resolveRequiredHours(requiredHours: number | null | undefined, course: string | null | undefined): number {
  return requiredHours || requiredHoursForCourse(course) || REQUIRED_HOURS_BY_COURSE.BSIT;
}

// The one course-to-department rule. Keep aligned with course_department() in migration 029;
// scripts/check-course-department.cjs fails if they drift.
export const DEPARTMENT_COURSE_PATTERNS = {
  ICS: ['BSIT', 'BSCS', 'BS-CPE', 'BSCPE', 'INFORMATION TECHNOLOGY', 'COMPUTER ENGINEERING', 'COMPUTER SCIENCE'],
  IBE: ['BSBA', 'BSENTREP', 'ENTREPRENEURSHIP', 'HUMAN RESOURCE', 'BSA', 'ACCOUNTANCY'],
};

/** Null for an unknown or empty course: callers must deny, not guess a department. */
export function courseDepartment(course: string | null | undefined): 'ICS' | 'IBE' | null {
  const text = (course ?? '').toUpperCase();
  // ICS wins on ambiguous courses, as in course_department().
  for (const department of ['ICS', 'IBE'] as const) if (DEPARTMENT_COURSE_PATTERNS[department].some(pattern => text.includes(pattern))) return department;
  return null;
}

export const isICSCourse = (course: string | null | undefined) => courseDepartment(course) === 'ICS';
export const isIBECourse = (course: string | null | undefined) => courseDepartment(course) === 'IBE';
