import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Account setup',
  description: 'Set up your Colegio de Montalban OJT Practicum Portal account.',
  robots: { index: false, follow: false, nocache: true },
};

export default function InvitationLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="invitation-flow flex min-h-screen flex-col bg-[#F4F6F2] text-[#18271D]">
      <header className="border-b border-[#DCE5DB] bg-[#FFFEFB]">
        <div className="mx-auto flex min-h-[72px] max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex min-w-0 items-center gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#EDF2EB] p-1">
              <Image src="/logo.png" alt="Colegio de Montalban seal" width={34} height={34} className="object-contain" priority />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-xs font-bold text-[#5A6A5E]">OJT Practicum Portal</span>
              <span className="block truncate text-sm font-extrabold text-[#0A3824]">Colegio de Montalban</span>
            </span>
          </Link>
          <Link href="/auth/sign-in" className="shrink-0 text-xs font-bold text-[#0A3824] underline-offset-4 hover:underline">Sign in</Link>
        </div>
      </header>

      <div className="mx-auto grid w-full max-w-7xl flex-1 items-center gap-10 px-4 py-10 sm:px-6 lg:grid-cols-2 lg:gap-16 lg:px-8 lg:py-16">
        <div className="order-2 lg:order-1">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#DCE5DB] bg-[#FFFEFB] px-3 py-1.5 text-xs font-bold text-[#45644A]">
            <span className="h-2 w-2 rounded-full bg-[#45644A]" /> Official account setup
          </div>
          <h2 className="mt-5 max-w-xl text-4xl font-extrabold leading-[1.08] tracking-[-0.045em] sm:text-5xl">
            Better Training.<br /><span className="text-[#0A3824]">Brighter Future.</span>
          </h2>
          <p className="mt-5 max-w-lg text-sm leading-7 text-[#5A6A5E] sm:text-base">
            Your invitation is the first step into the Colegio de Montalban practicum workspace for ICS and IBE.
          </p>
          <div className="relative mt-8 aspect-[4/3] max-w-[560px] overflow-hidden rounded-[1.75rem] border border-[#DCE5DB] bg-[#E4DBC4] shadow-[0_18px_48px_rgba(24,39,29,0.10)]">
            <Image src="/cdm-campus.jpg" alt="Colegio de Montalban campus" fill sizes="(max-width: 1024px) 100vw, 560px" className="object-cover" />
          </div>
        </div>

        <div className="order-1 lg:order-2">
          <div className="mx-auto w-full max-w-[480px] rounded-[1.75rem] border border-[#DCE5DB] bg-[#FFFEFB] p-6 shadow-[0_18px_48px_rgba(24,39,29,0.06)] sm:p-9">
            {children}
          </div>
        </div>
      </div>

      <footer className="border-t border-[#DCE5DB] bg-[#FFFEFB] px-4 py-5 text-center text-xs text-[#5A6A5E] sm:px-6">
        Colegio de Montalban · OJT Practicum Portal · Rodriguez, Rizal
      </footer>
    </div>
  );
}
