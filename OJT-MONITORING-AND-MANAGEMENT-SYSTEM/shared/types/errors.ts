export type AppErrorCode =
  | 'SUCCESS'
  | 'VALIDATION_FAILURE'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'EXPIRED_QR'
  | 'INVALID_QR'
  | 'DUPLICATE_REQUEST'
  | 'RATE_LIMITED'
  | 'OFFLINE'
  | 'SYNC_FAILURE'
  | 'SERVER_FAILURE'
  | 'TIMEOUT';

export interface AppError {
  code: AppErrorCode;
  message: string;
}

export interface AppResult<T> {
  data: T | null;
  error: AppError | null;
}
