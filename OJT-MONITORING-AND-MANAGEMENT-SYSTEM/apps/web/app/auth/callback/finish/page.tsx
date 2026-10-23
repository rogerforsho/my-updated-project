'use client';

import { useEffect } from 'react';
import { createClient } from '@/src/lib/supabase/client';

// Email links that use the implicit flow carry the session in the URL fragment, which the server never sees.
export default function CallbackFinishPage() {
  useEffect(() => {
    const fail = () => window.location.replace('/auth/sign-in?error=auth_callback_failed');
    const requestedNext = new URLSearchParams(window.location.search).get('next') ?? '/dashboard';
    const next = requestedNext.startsWith('/') && !requestedNext.startsWith('//') && !requestedNext.includes('\\')
      ? requestedNext
      : '/dashboard';
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const access_token = hash.get('access_token');
    const refresh_token = hash.get('refresh_token');
    if (!access_token || !refresh_token) return fail();
    createClient().auth.setSession({ access_token, refresh_token })
      .then(({ error }) => (error ? fail() : window.location.replace(next)), fail);
  }, []);

  return <main className="mx-auto max-w-md p-6 text-sm text-slate-600">Signing you in...</main>;
}
