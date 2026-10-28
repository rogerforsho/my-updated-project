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
