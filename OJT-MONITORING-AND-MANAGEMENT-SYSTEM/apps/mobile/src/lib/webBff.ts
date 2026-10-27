import { supabase } from './supabase';
import { getWebPortalUrl } from './webPortal';
import type { AppResult } from '@ojt/shared';

// An unreachable server otherwise leaves fetch pending until the OS gives up, which shows as an endless spinner.
const BFF_TIMEOUT_MS = 30000;

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), BFF_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function getWebBff<T>(path: string): Promise<AppResult<T>> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token)
    return { data: null, error: { code: 'UNAUTHORIZED', message: 'Not logged in.' } };

  try {
    const response = await fetchWithTimeout(getWebPortalUrl(path), {
      method: 'GET',
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    const result = await response.json();
    if (!response.ok || result.error)
      return { data: null, error: result.error || { code: 'SERVER_FAILURE', message: 'The request could not be completed.' } };
    return { data: result.data as T, error: null };
  } catch {
    return { data: null, error: { code: 'SERVER_FAILURE', message: `The service could not be reached (${process.env.EXPO_PUBLIC_WEB_URL ?? 'no web URL set'}). Check your connection and try again.` } };
  }
}

/** Sends authenticated mobile business actions through the Next.js BFF. */
export async function postWebBff<T>(path: string, payload: unknown): Promise<AppResult<T>> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token)
    return { data: null, error: { code: 'UNAUTHORIZED', message: 'Not logged in.' } };

  try {
    const response = await fetchWithTimeout(getWebPortalUrl(path), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    const result = await response.json();
    if (!response.ok || result.error)
      return { data: null, error: result.error || { code: 'SERVER_FAILURE', message: 'The request could not be completed.' } };
    return { data: result.data as T, error: null };
  } catch {
    return { data: null, error: { code: 'SERVER_FAILURE', message: `The service could not be reached (${process.env.EXPO_PUBLIC_WEB_URL ?? 'no web URL set'}). Check your connection and try again.` } };
  }
}
