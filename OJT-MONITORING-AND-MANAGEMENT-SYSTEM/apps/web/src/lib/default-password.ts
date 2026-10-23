// Default student password: the student number. Supabase needs 8+ characters,
// so a shorter number is prefixed with "cdm-". The student must change it at first login.
export function defaultStudentPassword(studentNumber: string): string {
  const number = studentNumber.trim();
  return number.length >= 8 ? number : `cdm-${number}`;
}
