export type UserRole =
  | 'Student'
  | 'Coordinator'
  | 'Supervisor'
  | 'Admin';

export type AccountCategory = 'OJT Student' | 'OJT Coordinator' | 'Supervisor' | 'Super Admin';

export const ACCOUNT_ROLE_LABEL: Record<UserRole, AccountCategory> = {
  Student: 'OJT Student',
  Coordinator: 'OJT Coordinator',
  Supervisor: 'Supervisor',
  Admin: 'Super Admin',
};

export function accountRoleLabel(role: UserRole): AccountCategory {
  return ACCOUNT_ROLE_LABEL[role];
}

export type AccountStatus = 'pending' | 'active' | 'rejected' | 'inactive';
