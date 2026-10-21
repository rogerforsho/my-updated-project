import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#F4F6F2] dark:bg-[#0B0F19] px-4 text-center">
      <div className="w-16 h-16 rounded-2xl bg-[#0A3824]/10 dark:bg-emerald-950/60 border border-emerald-900/20 dark:border-emerald-800/50 text-[#0A3824] dark:text-emerald-400 flex items-center justify-center text-2xl font-bold mb-4 shadow-sm">
        404
      </div>
      <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
        Page Not Found
      </h1>
      <p className="mt-2 text-sm text-slate-500 dark:text-slate-400 max-w-sm">
        The page you are looking for does not exist or has been moved.
      </p>
      <Link
        href="/dashboard"
        className="mt-6 inline-flex items-center px-5 py-2.5 rounded-xl bg-[#0A3824] hover:bg-[#072a19] text-[#D5B254] font-semibold text-sm shadow-md transition-all active:scale-[0.98]"
      >
        Return to Portal
      </Link>
    </div>
  );
}
