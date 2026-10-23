'use server';

import {
  listPendingStudents as listPendingStudentsAction,
  listActiveStudents as listActiveStudentsAction,
  updateStudentAccountStatus as updateStudentAccountStatusAction,
  resetStudentPasswordToDefault as resetStudentPasswordToDefaultAction,
} from './auth/account-review';
import {
  registerStudent as registerStudentAction,
  uploadStudentIdCard as uploadStudentIdCardAction,
} from './auth/registration';
import {
  signIn as signInAction,
  signOut as signOutAction,
  changeUserPassword as changeUserPasswordAction,
  getAuthUser as getAuthUserAction,
} from './auth/session';
import { requestPasswordReset as requestPasswordResetAction } from './auth/password-recovery';

export async function listPendingStudents(...args: Parameters<typeof listPendingStudentsAction>) { return listPendingStudentsAction(...args); }
export async function listActiveStudents(...args: Parameters<typeof listActiveStudentsAction>) { return listActiveStudentsAction(...args); }
export async function updateStudentAccountStatus(...args: Parameters<typeof updateStudentAccountStatusAction>) { return updateStudentAccountStatusAction(...args); }
export async function resetStudentPasswordToDefault(...args: Parameters<typeof resetStudentPasswordToDefaultAction>) { return resetStudentPasswordToDefaultAction(...args); }
export async function registerStudent(...args: Parameters<typeof registerStudentAction>) { return registerStudentAction(...args); }
export async function uploadStudentIdCard(...args: Parameters<typeof uploadStudentIdCardAction>) { return uploadStudentIdCardAction(...args); }
export async function signIn(...args: Parameters<typeof signInAction>) { return signInAction(...args); }
export async function signOut(...args: Parameters<typeof signOutAction>) { return signOutAction(...args); }
export async function changeUserPassword(...args: Parameters<typeof changeUserPasswordAction>) { return changeUserPasswordAction(...args); }
export async function getAuthUser(...args: Parameters<typeof getAuthUserAction>) { return getAuthUserAction(...args); }
export async function requestPasswordReset(...args: Parameters<typeof requestPasswordResetAction>) { return requestPasswordResetAction(...args); }
