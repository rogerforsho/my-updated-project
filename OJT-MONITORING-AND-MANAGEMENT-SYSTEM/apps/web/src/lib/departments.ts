/**
 * Department & Course Utility Helpers
 * Pure utility functions safe for both Client and Server execution.
 * Colegio de Montalban: Institute of Computing Studies (ICS) & Institute of Business and Entrepreneurship (IBE)
 */

// The one app-side course-to-department rule. Keep aligned with course_department() in migration 029;
// scripts/check-course-department.cjs fails if they drift.
export const DEPARTMENT_COURSE_PATTERNS = {
  ICS: ['BSIT', 'BSCS', 'BS-CPE', 'BSCPE', 'INFORMATION TECHNOLOGY', 'COMPUTER ENGINEERING', 'COMPUTER SCIENCE'],
  IBE: ['BSBA', 'BSENTREP', 'ENTREPRENEURSHIP', 'HUMAN RESOURCE', 'BSA', 'ACCOUNTANCY'],
};

export function courseDepartment(course: string | null | undefined): 'ICS' | 'IBE' | null {
  const text = (course ?? '').toUpperCase();
  // ICS wins on ambiguous courses, as in course_department().
  for (const department of ['ICS', 'IBE'] as const) if (DEPARTMENT_COURSE_PATTERNS[department].some(pattern => text.includes(pattern))) return department;
  return null;
}

export const isICSCourse = (course: string | null | undefined) => courseDepartment(course) === 'ICS';
export const isIBECourse = (course: string | null | undefined) => courseDepartment(course) === 'IBE';

export function getDepartmentByCourse(course: string): 'ICS' | 'IBE' {
  if (isICSCourse(course)) return 'ICS';
  return 'IBE';
}

export function getDepartmentFullName(deptOrCourse: string): string {
  const d = (deptOrCourse || '').toUpperCase();
  if (d === 'ICS' || isICSCourse(deptOrCourse)) {
    return 'Institute of Computing Studies (ICS)';
  }
  return 'Institute of Business and Entrepreneurship (IBE)';
}
