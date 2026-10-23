// The server may reach Supabase on a different host than the browser (e.g. host.docker.internal
// vs 127.0.0.1). @supabase/ssr names the auth cookie after that host, so name it after the
// browser's URL everywhere; otherwise the browser client never finds the session.
export function authCookieOptions(): { name: string } | undefined {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return undefined;
  try {
    return { name: `sb-${new URL(url).hostname.split('.')[0]}-auth-token` };
  } catch {
    return undefined;
  }
}
