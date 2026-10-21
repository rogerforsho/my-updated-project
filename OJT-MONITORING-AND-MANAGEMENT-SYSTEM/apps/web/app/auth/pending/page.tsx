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
          Confirm your email using the link we sent. Your OJT Coordinator can approve your registration after your email is confirmed. If you have already confirmed it, your account is awaiting OJT Coordinator review.
        </p>
      </div>
      <div className="w-full rounded-xl bg-[#0A3824]/5 border border-[#0A3824]/20 px-5 py-4 text-left">
        <p className="text-[11px] font-bold text-[#0A3824] uppercase tracking-wider mb-2">Next Verification Steps</p>
        <ul className="text-xs text-slate-700 space-y-2">
          <li className="flex items-start gap-2">
            <span className="text-[#0A3824] font-bold">✓</span>
            <span>OJT Coordinator verifies student number and 4th-year standing (ICS / IBE).</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-[#0A3824] font-bold">✓</span>
            <span>Host training company and supervisor assignment will be linked.</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-[#0A3824] font-bold">✓</span>
            <span>Once approved, sign in using the <strong>CdM OJT Mobile App</strong> on your mobile device to record attendance and submit logs.</span>
          </li>
        </ul>
      </div>
      <Link href="/auth/sign-in" className="text-xs font-bold text-[#0A3824] hover:underline">
        ← Return to Sign In
      </Link>
    </div>
  );
}
