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
