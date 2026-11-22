export const STUDENT_REGISTRATION_COURSES = ['BSIT', 'BS-CPE', 'BSBA-HRM', 'BSENTREP'] as const;

export type StudentRegistrationCourse = (typeof STUDENT_REGISTRATION_COURSES)[number];

// Matches course_department() in the database for the courses students can register with.
export const COURSE_DEPARTMENT: Record<StudentRegistrationCourse, 'ICS' | 'IBE'> = {
  BSIT: 'ICS',
  'BS-CPE': 'ICS',
  'BSBA-HRM': 'IBE',
  BSENTREP: 'IBE',
};

export const DEPARTMENT_PROGRAMS: Record<'ICS' | 'IBE', StudentRegistrationCourse[]> = {
  ICS: ['BSIT', 'BS-CPE'],
  IBE: ['BSBA-HRM', 'BSENTREP'],
};

// Mirrors program_key_for_course() in migration 20261122000100: contains-matching so legacy spellings resolve alike.
export const PROGRAM_COURSE_PATTERNS: Record<StudentRegistrationCourse, string[]> = {
  BSIT: ['BSIT', 'INFORMATION TECHNOLOGY'],
  'BS-CPE': ['BS-CPE', 'BSCPE', 'COMPUTER ENGINEERING'],
  'BSBA-HRM': ['BSBA', 'HUMAN RESOURCE'],
  BSENTREP: ['BSENTREP', 'ENTREPRENEURSHIP'],
};

/** The program a course belongs to, or null (legacy BSCS/BSA have none). Same order as program_key_for_course(). */
export function programForCourse(course: string | null | undefined): StudentRegistrationCourse | null {
  const text = (course ?? '').toUpperCase();
  return STUDENT_REGISTRATION_COURSES.find(program => PROGRAM_COURSE_PATTERNS[program].some(pattern => text.includes(pattern))) ?? null;
}

/** Access as a list of departments ('ICS' = every program of it) and/or programs ('BSIT'), flattened to programs. */
export function accessPrograms(items: readonly string[] | null | undefined): string[] {
  return [...new Set((items ?? []).flatMap(item => item === 'ICS' || item === 'IBE' ? DEPARTMENT_PROGRAMS[item] : [item]))];
}

/**
 * A Coordinator's access picked as programs becomes one grant per department.
 * programs null = every program of the department (stored as NULL, so a program added later is covered).
 */
export function programGrants(programs: readonly string[]): Array<{ department: 'ICS' | 'IBE'; programs: StudentRegistrationCourse[] | null }> {
  const picked = new Set(programs);
  const grants: Array<{ department: 'ICS' | 'IBE'; programs: StudentRegistrationCourse[] | null }> = [];
  for (const department of ['ICS', 'IBE'] as const) {
    const own = DEPARTMENT_PROGRAMS[department].filter(program => picked.has(program));
    if (own.length === 0) continue;
    grants.push({ department, programs: own.length === DEPARTMENT_PROGRAMS[department].length ? null : own });
  }
  return grants;
}

export function isStudentRegistrationCourse(course: string): course is StudentRegistrationCourse {
  return STUDENT_REGISTRATION_COURSES.some((approvedCourse) => approvedCourse === course.trim().toUpperCase());
}

// Seed and fallback values only. The OJT Coordinator sets the real Target Hours per course
// (program_target_hours table, Coordinator > Target Hours); the app reads them from students.required_hours.
// These are used only when a student has no value, and as the seed of the table's first rows.
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
