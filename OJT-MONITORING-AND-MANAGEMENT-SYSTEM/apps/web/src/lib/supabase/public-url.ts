export function toPublicSupabaseUrl(url: string): string {
  const serverUrl = process.env.SUPABASE_URL;
  const publicUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!serverUrl || !publicUrl) return url;

  try {
    const result = new URL(url);
    const internal = new URL(serverUrl);
    const browser = new URL(publicUrl);
    if (result.origin !== internal.origin) return url;
    result.protocol = browser.protocol;
    result.host = browser.host;
    return result.toString();
  } catch {
    return url;
  }
}