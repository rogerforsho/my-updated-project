export const STUDENT_REGISTRATION_COURSES = ['BSIT', 'BS-CPE', 'BSBA-HRM', 'BSENTREP'] as const;

export type StudentRegistrationCourse = (typeof STUDENT_REGISTRATION_COURSES)[number];

export function isStudentRegistrationCourse(course: string): course is StudentRegistrationCourse {
  return STUDENT_REGISTRATION_COURSES.some((approvedCourse) => approvedCourse === course.trim().toUpperCase());
}
