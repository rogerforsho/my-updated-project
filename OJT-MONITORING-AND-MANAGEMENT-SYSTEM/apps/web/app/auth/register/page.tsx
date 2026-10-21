import Link from 'next/link';

export default function RegisterPage() {
  return (
    <main className="min-h-screen grid place-items-center bg-slate-50 px-4">
      <section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <h1 className="text-2xl font-bold text-slate-900">Student registration</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          OJT student accounts are registered in the OJT mobile app. Open the app to submit your registration and student ID for review.
        </p>
        <Link href="/auth/sign-in" className="mt-6 inline-block font-semibold text-[#0A3824] hover:underline">
          Back to sign in
        </Link>
      </section>
    </main>
  );
}
