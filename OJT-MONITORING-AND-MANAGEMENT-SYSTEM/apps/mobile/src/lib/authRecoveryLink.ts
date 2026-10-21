export function parseStudentPasswordRecoveryUrl(value: string): {
  code?: string;
  accessToken?: string;
  refreshToken?: string;
  error?: string;
} | null {
  let url: URL;
  try { url = new URL(value); } catch { return null; }
  if (url.protocol !== 'cdm-ojt-monitoring:' || url.hostname !== 'auth' || url.pathname !== '/reset-password') return null;

  const hash = new URLSearchParams(url.hash.slice(1));
  const get = (key: string) => url.searchParams.get(key) ?? hash.get(key);
  const type = get('type');
  if (type && type !== 'recovery') return null;
  const result = {
    code: get('code') ?? undefined,
    accessToken: get('access_token') ?? undefined,
    refreshToken: get('refresh_token') ?? undefined,
    error: get('error_description') ?? get('error') ?? undefined,
  };
  return result.code || (result.accessToken && result.refreshToken) || result.error ? result : null;
}
