'use client';

import { useEffect, useState } from 'react';

// Students confirm their email in a phone browser but only use the mobile app, so this page signs nobody in.
export default function EmailConfirmedPage() {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    // Supabase reports expired or reused links as error / error_code in the query or the fragment.
    const query = new URLSearchParams(window.location.search);
    const hash = new URLSearchParams(window.location.hash.slice(1));
    setFailed(Boolean(query.get('error') || query.get('error_code') || hash.get('error') || hash.get('error_code')));
  }, []);

  return (
    <main className="min-h-screen grid place-items-center bg-slate-50 px-4">
      <section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        {failed ? (
          <>
            <h1 className="text-2xl font-bold text-slate-900">Link expired or already used</h1>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              If you already confirmed your email, close this page and go back to the CdM OJT mobile app.
              Otherwise, register again in the app or contact your OJT Coordinator.
            </p>
          </>
        ) : (
          <>
            <div aria-hidden className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-emerald-100 text-3xl text-[#0A3824]">✓</div>
            <h1 className="mt-4 text-2xl font-bold text-slate-900">Email confirmed</h1>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              Close this page and go back to the CdM OJT mobile app. Your OJT Coordinator will now review your
              registration and student ID. You will receive an email and an app notification once your account is
              approved or needs changes.
            </p>
          </>
        )}
      </section>
    </main>
  );
}
