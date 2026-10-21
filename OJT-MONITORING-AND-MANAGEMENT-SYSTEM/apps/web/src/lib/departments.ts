/**
 * Department & Course Utility Helpers
 * Pure utility functions safe for both Client and Server execution.
 * Colegio de Montalban: Institute of Computing Studies (ICS) & Institute of Business and Entrepreneurship (IBE)
 */

export function isICSCourse(course: string): boolean {
  const c = (course || '').toUpperCase();
  return (
    c.includes('BSIT') ||
    c.includes('BSCS') ||
    c.includes('BS-CPE') ||
    c.includes('BSCPE') ||
    c.includes('INFORMATION TECHNOLOGY') ||
    c.includes('COMPUTER ENGINEERING') ||
    c.includes('COMPUTER SCIENCE')
  );
}

export function isIBECourse(course: string): boolean {
  const c = (course || '').toUpperCase();
  return (
    c.includes('BSBA-HRM') ||
    c.includes('BSBA-HR') ||
    c.includes('BSBA-MKT') ||
    c.includes('BSBA-FM') ||
    c.includes('BSBA') ||
    c.includes('BSENTREP') ||
    c.includes('ENTREPRENEURSHIP') ||
    c.includes('HUMAN RESOURCE') ||
    c.includes('BSA') ||
    c.includes('ACCOUNTANCY')
  );
}

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
