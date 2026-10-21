import Link from 'next/link';

export default function MobileOnlyPage() {
  return (
    <main className="min-h-screen grid place-items-center bg-slate-50 px-4">
      <section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <h1 className="text-2xl font-bold text-slate-900">Continue in the OJT mobile app</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          Student accounts use the mobile app for OJT workflows. Open the app to sign in, finish registration, and view your records.
        </p>
        <Link href="/auth/sign-in" className="mt-6 inline-block font-semibold text-[#0A3824] hover:underline">
          Back to sign in
        </Link>
      </section>
    </main>
  );
}
