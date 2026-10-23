// This public URL must point to the same environment as EXPO_PUBLIC_SUPABASE_URL.
export function getWebPortalUrl(path: string): string {
  const configured = process.env.EXPO_PUBLIC_WEB_URL;
  if (!configured) throw new Error('Mobile registration is not configured: set EXPO_PUBLIC_WEB_URL to the matching web portal URL and restart Expo.');
  const base = new URL(configured);
  const allowHttp = (typeof __DEV__ !== 'undefined' && __DEV__) || process.env.EXPO_PUBLIC_APP_ENV === 'preview';
  if (base.protocol !== 'https:' && !(allowHttp && base.protocol === 'http:')) {
    throw new Error('Account services require a secure connection.');
  }
  return new URL(path, base.origin).toString();
}
