/**
 * Enterprise Input Validation Schemas
 * Colegio de Montalban OJT Management System (ISO/IEC 25010:2023)
 * Shared single-source-of-truth validation for Web, Mobile, and Desktop
 */
import { isStudentRegistrationCourse } from './courses';

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

export function validateEmail(email: string): ValidationResult {
  const trimmed = email.trim();
  if (!trimmed) {
    return { valid: false, error: 'Email address is required.' };
  }
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  if (!emailRegex.test(trimmed)) {
    return { valid: false, error: 'Please enter a valid email address.' };
  }
  return { valid: true };
}

export function validatePassword(password: string): ValidationResult {
  if (!password) {
    return { valid: false, error: 'Password is required.' };
  }
  if (password.length < 8) {
    return { valid: false, error: 'Password must be at least 8 characters long.' };
  }
  if (password.length > 128) {
    return { valid: false, error: 'Password cannot exceed 128 characters.' };
  }
  return { valid: true };
}

export function validateStudentRegistration(data: {
  fullName: string;
  email: string;
  password: string;
  confirmPassword?: string;
  studentNumber: string;
  course: string;
}): ValidationResult {
  if (!data.fullName.trim()) {
    return { valid: false, error: 'Full name is required.' };
  }
  const emailRes = validateEmail(data.email);
  if (!emailRes.valid) return emailRes;

  const passRes = validatePassword(data.password);
  if (!passRes.valid) return passRes;

  if (data.confirmPassword !== undefined && data.password !== data.confirmPassword) {
    return { valid: false, error: 'Passwords do not match.' };
  }

  if (!data.studentNumber.trim()) {
    return { valid: false, error: 'Student number is required.' };
  }

  if (!isStudentRegistrationCourse(data.course)) {
    return { valid: false, error: 'Please select a valid ICS or IBE degree program.' };
  }

  return { valid: true };
}
