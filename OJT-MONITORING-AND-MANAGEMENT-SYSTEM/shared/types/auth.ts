export interface RegisterStudentInput {
  full_name: string;
  email: string;
  password: string;
  student_number: string;
  course: string;
  year_level: number;
  id_card_path?: string;
  id_card_front_path?: string;
  id_card_back_path?: string;
}

export interface ResubmitStudentRegistrationInput {
  full_name: string;
  student_number: string;
  course: string;
  year_level: 4;
  id_card_front_path: string;
  id_card_back_path: string;
}

export interface StudentRegistrationResubmissionDetails extends ResubmitStudentRegistrationInput {
  email: string;
  rejection_reason: string | null;
}

export interface SignInInput {
  email: string;
  password: string;
}

export interface AuthUser {
  user_id: string;
  email: string;
  full_name: string;
  role: import('./roles').UserRole;
  account_status: import('./roles').AccountStatus;
  must_change_password?: boolean;
}
