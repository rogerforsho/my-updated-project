/**
 * Department & Course Utility Helpers
 * Pure utility functions safe for both Client and Server execution.
 * Colegio de Montalban: Institute of Computing Studies (ICS) & Institute of Business and Entrepreneurship (IBE)
 */

export { DEPARTMENT_COURSE_PATTERNS, courseDepartment, isICSCourse, isIBECourse } from '@ojt/shared';
import { courseDepartment } from '@ojt/shared';

/** Null for an unknown course, so callers deny instead of treating it as IBE. */
export const getDepartmentByCourse = (course: string) => courseDepartment(course);

export function getDepartmentFullName(deptOrCourse: string): string {
  const d = (deptOrCourse || '').toUpperCase();
  const department = d === 'ICS' || d === 'IBE' ? d : courseDepartment(deptOrCourse);
  if (department === 'ICS') return 'Institute of Computing Studies (ICS)';
  if (department === 'IBE') return 'Institute of Business and Entrepreneurship (IBE)';
  return 'Unknown department';
}
