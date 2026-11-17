import { supabase } from './supabase';
import { getWebPortalUrl } from './webPortal';
import { fetchWithTimeout } from './fetchWithTimeout';
import type { AppResult } from '@ojt/shared';

async function callWebBff<T>(path: string, method: 'GET' | 'POST', payload?: unknown): Promise<AppResult<T>> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token)
    return { data: null, error: { code: 'UNAUTHORIZED', message: 'Not logged in.' } };

  try {
    const response = await fetchWithTimeout(getWebPortalUrl(path), {
      method,
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(method === 'POST' ? { body: JSON.stringify(payload) } : {}),
    });
    const result = await response.json();
    if (!response.ok || result.error)
      return { data: null, error: result.error || { code: 'SERVER_FAILURE', message: 'The request could not be completed.' } };
    return { data: result.data as T, error: null };
  } catch {
    return { data: null, error: { code: 'SERVER_FAILURE', message: `The service could not be reached (${process.env.EXPO_PUBLIC_WEB_URL ?? 'no web URL set'}). Check your connection and try again.` } };
  }
}

export const getWebBff = <T>(path: string) => callWebBff<T>(path, 'GET');

/** Sends authenticated mobile business actions through the Next.js BFF. */
export const postWebBff = <T>(path: string, payload: unknown) => callWebBff<T>(path, 'POST', payload);
