import Link from 'next/link';

export default function PendingPage() {
  return (
    <div className="text-center flex flex-col items-center gap-5">
      <div className="w-16 h-16 rounded-full bg-[#0A3824]/10 border-2 border-[#0A3824] flex items-center justify-center">
        <span className="text-2xl">⏳</span>
      </div>
      <div>
        <h1 className="text-xl font-black text-[#0A3824] font-serif">Registration Under Review</h1>
        <p className="text-xs text-slate-600 mt-1.5 leading-relaxed max-w-xs mx-auto">
          If you just tapped the link in your email, your email is now confirmed. Opening this web page is only needed for this one step, so you can close it and go back to the CdM OJT mobile app. Your OJT Coordinator will review your registration next. If you haven&apos;t confirmed yet, open the email we sent and tap &quot;Confirm my email address.&quot;
        </p>
      </div>
      <div className="w-full rounded-xl bg-[#0A3824]/5 border border-[#0A3824]/20 px-5 py-4 text-left">
        <p className="text-[11px] font-bold text-[#0A3824] uppercase tracking-wider mb-2">What happens next</p>
        <ul className="text-xs text-slate-700 space-y-2">
          <li className="flex items-start gap-2">
            <span className="text-[#0A3824] font-bold">✓</span>
            <span>Your OJT Coordinator checks your student number, course (ICS / IBE), 4th-year standing and student ID photos.</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-[#0A3824] font-bold">✓</span>
            <span>You&apos;ll get an email and an app notification when your account is approved or needs changes.</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-[#0A3824] font-bold">✓</span>
            <span>Once approved, sign in using the <strong>CdM OJT Mobile App</strong> to propose your schedule and HTE, record attendance and submit reports.</span>
          </li>
        </ul>
      </div>
      <Link href="/auth/sign-in" className="text-xs font-bold text-[#0A3824] hover:underline">
        ← Return to Sign In
      </Link>
    </div>
  );
}
