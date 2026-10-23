import Image from 'next/image';
import Link from 'next/link';
import type { ReactNode } from 'react';
import PublicFooter from '@/src/components/layout/PublicFooter';

const programs = [
  { code: 'ICS', title: 'Institute of Computing Studies', copy: 'For 4th-year students completing their OJT practicum.' },
  { code: 'IBE', title: 'Institute of Business and Entrepreneurship', copy: 'For 4th-year students completing their OJT practicum.' },
];

const capabilities = [
  ['01', 'GPS-verified attendance', 'Students log attendance with location verification and selfie evidence.'],
  ['02', 'Offline attendance logging', 'Mobile attendance records sync automatically when internet returns.'],
  ['03', 'Rendered-hour tracking', 'Students can follow progress toward the 486 required hours, with OJT Coordinator verification.'],
  ['04', 'Digital reports and evaluations', 'Supervisors use standardized 5-point rubrics to assess competencies, punctuality, and work ethics.'],
];

const resources = [
  { label: 'Desktop client', title: 'Windows Desktop Application', copy: 'Windows access for OJT Coordinator, admins, and supervisors, with system tray integration.', href: '/downloads/CdM-OJT-Portal-Setup-1.0.0.exe', action: 'Download client' },
  { label: 'Student mobile app', title: 'Attendance Companion', copy: 'Log attendance with GPS verification, selfie submission, and offline sync.', href: '#capabilities', action: 'Explore attendance' },
  { label: 'Certificate lookup', title: 'Verify a practicum certificate', copy: 'Search for a student certificate by its verification code.', href: '/verify-certificate/search', action: 'Open verification' },
];

function SectionLabel({ children }: { children: ReactNode }) {
  return <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--cdm-olive)]">{children}</p>;
}

export default function SoftForestLanding({
  onOpenAccessPortal,
  showPrototypeBadge = false,
  gettingStarted,
  helpSection,
}: {
  onOpenAccessPortal?: () => void;
  showPrototypeBadge?: boolean;
  gettingStarted?: ReactNode;
  helpSection?: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <div className="border-b border-[var(--line)] bg-[var(--surface)]">
        <header className="mx-auto flex min-h-[72px] max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <Link href="#top" className="flex min-w-0 items-center gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--surface-muted)] p-1"><Image src="/logo.png" alt="Colegio de Montalban seal" width={34} height={34} className="object-contain" /></span>
            <span className="min-w-0"><span className="block truncate text-[9px] font-bold uppercase tracking-[0.13em] text-[var(--text-muted)]">OJT Practicum Portal</span><span className="block truncate text-sm font-extrabold text-[var(--cdm-green)]">Colegio de Montalban</span></span>
          </Link>
          <nav aria-label="Main navigation" className="hidden items-center gap-6 text-xs font-semibold text-[var(--cdm-olive)] md:flex">
            {gettingStarted && <a href="#start" className="transition-colors hover:text-[var(--cdm-green)]">Get started</a>}
            <a href="#programs" className="transition-colors hover:text-[var(--cdm-green)]">Programs</a>
            <a href="#capabilities" className="transition-colors hover:text-[var(--cdm-green)]">Capabilities</a>
            <a href="#resources" className="transition-colors hover:text-[var(--cdm-green)]">Resources</a>
          </nav>
          {onOpenAccessPortal ? <button type="button" onClick={onOpenAccessPortal} className="rounded-xl bg-[var(--cdm-green)] px-4 py-2.5 text-xs font-bold text-white transition-colors hover:bg-[var(--cdm-green-light)] active:scale-[0.98]">Access Portal</button> : <Link href="/auth/sign-in" className="rounded-xl bg-[var(--cdm-green)] px-4 py-2.5 text-xs font-bold text-white transition-colors hover:bg-[var(--cdm-green-light)] active:scale-[0.98]">Access Portal</Link>}
        </header>
      </div>

      <main id="top">
        <section className="overflow-hidden border-b border-[var(--line)] bg-[var(--background)]">
          <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 py-12 sm:px-6 sm:py-16 lg:grid-cols-2 lg:gap-16 lg:px-8 lg:py-20">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-[var(--line)] bg-[var(--surface)] px-3 py-1.5"><span className="h-2 w-2 rounded-full bg-[#45644A]" /><SectionLabel>Student practicum · ICS &amp; IBE</SectionLabel></div>
              <h1 className="mt-5 max-w-xl text-4xl font-extrabold leading-[1.08] tracking-[-0.045em] text-[var(--foreground)] sm:text-5xl lg:text-[3.65rem]">Better Training.<br /><span className="text-[var(--cdm-green)]">Brighter Future.</span></h1>
              <p className="mt-5 max-w-xl text-sm leading-7 text-[var(--text-muted)] sm:text-base">GPS-verified attendance, rendered-hour tracking, digital reports, and supervisor evaluations for 4th-year students at Colegio de Montalban.</p>
              <div className="mt-7 flex flex-col gap-3 sm:flex-row">
                {onOpenAccessPortal ? <button type="button" onClick={onOpenAccessPortal} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--cdm-green)] px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-[var(--cdm-green-light)] active:scale-[0.98]">Access your portal <span aria-hidden="true">→</span></button> : <Link href="/auth/sign-in" className="inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--cdm-green)] px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-[var(--cdm-green-light)] active:scale-[0.98]">Access your portal <span aria-hidden="true">→</span></Link>}
                <a href={gettingStarted ? '#start' : '#resources'} className="inline-flex items-center justify-center rounded-xl border border-[var(--line)] bg-[var(--surface)] px-5 py-3 text-sm font-semibold text-[var(--cdm-olive)] transition-colors hover:bg-[var(--surface-muted)]">{gettingStarted ? 'New here? Get started' : 'View system resources'}</a>
              </div>
              <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-[var(--line)] pt-5 text-xs font-medium text-[var(--text-muted)]">
                <span className="inline-flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-[#45644A]" />4th-year ICS students</span>
                <span className="inline-flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-[#45644A]" />4th-year IBE students</span>
              </div>
            </div>

            <div className="relative mx-auto w-full max-w-[560px] lg:ml-auto">
              <div className="relative aspect-[4/3] overflow-hidden rounded-[1.75rem] border border-[var(--line)] bg-[#E4DBC4] shadow-[0_18px_48px_rgba(24,39,29,0.10)]">
                <Image src="/cdm-campus.jpg" alt="Colegio de Montalban campus" fill priority sizes="(max-width: 768px) 100vw, 560px" className="object-cover" />
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#092E1D]/75 to-transparent px-5 pb-5 pt-16 text-white sm:px-6 sm:pb-6">
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#E4DBC4]">Kasiglahan Village</p>
                  <p className="mt-1 text-base font-bold">Colegio de Montalban</p>
                  <p className="mt-1 text-xs text-white/80">Institute of Computing Studies · Institute of Business and Entrepreneurship</p>
                </div>
              </div>
              <div className="absolute -bottom-4 left-4 rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3 shadow-[0_8px_24px_rgba(24,39,29,0.08)] sm:-left-5 sm:px-5">
                <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">Attendance</p>
                <p className="mt-1 text-xs font-bold text-[var(--cdm-green)]">GPS + selfie verification</p>
              </div>
              <div className="absolute -right-2 -top-3 rounded-2xl border border-[var(--line)] bg-[#E4DBC4] px-4 py-3 sm:-right-4">
                <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--cdm-olive)]">OJT progress</p>
                <p className="mt-1 text-xs font-extrabold text-[var(--cdm-green)]">Hour tracking</p>
              </div>
            </div>
          </div>
        </section>

        {gettingStarted}

        <section id="programs" className="border-b border-[var(--line)] bg-[var(--surface)] py-14 sm:py-16">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div><SectionLabel>Academic departments</SectionLabel><h2 className="mt-2 text-2xl font-extrabold tracking-tight text-[var(--foreground)] sm:text-3xl">A shared practicum path</h2></div>
              <p className="max-w-lg text-sm leading-6 text-[var(--text-muted)]">Built for 4th-year students under the Institute of Computing Studies and the Institute of Business and Entrepreneurship.</p>
            </div>
            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              {programs.map((program) => <article key={program.title} className="rounded-2xl border border-[var(--line)] bg-[var(--surface-muted)] p-5 transition-colors hover:bg-[var(--surface-muted)]"><span className="inline-flex rounded-full bg-[#E4DBC4]/60 px-2.5 py-1 text-[10px] font-bold tracking-wide text-[var(--cdm-olive)]">{program.code}</span><h3 className="mt-4 text-sm font-bold leading-snug text-[var(--foreground)]">{program.title}</h3><p className="mt-2 text-xs leading-5 text-[var(--text-muted)]">{program.copy}</p></article>)}
            </div>
          </div>
        </section>

        <section id="capabilities" className="border-b border-[var(--line)] bg-[var(--surface-muted)] py-14 sm:py-16">
          <div className="mx-auto grid max-w-7xl gap-8 px-4 sm:px-6 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16 lg:px-8">
            <div><SectionLabel>Practicum monitoring</SectionLabel><h2 className="mt-2 max-w-md text-2xl font-extrabold leading-tight tracking-tight text-[var(--foreground)] sm:text-3xl">Clear progress for students and supervisors.</h2><p className="mt-4 max-w-md text-sm leading-6 text-[var(--text-muted)]">The system brings attendance, hour tracking, reports, and evaluations into one practicum workflow.</p></div>
            <div className="divide-y divide-[#D6E0D5] rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-5 sm:px-6">
              {capabilities.map(([number, title, copy]) => <article key={number} className="flex gap-4 py-4 sm:py-5"><span className="pt-0.5 text-[10px] font-bold tracking-wider text-[var(--cdm-olive)]">{number}</span><div><h3 className="text-sm font-bold text-[var(--foreground)]">{title}</h3><p className="mt-1 text-xs leading-5 text-[var(--text-muted)]">{copy}</p></div></article>)}
            </div>
          </div>
        </section>

        <section id="resources" className="border-b border-[var(--line)] bg-[var(--surface)] py-14 sm:py-16">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <SectionLabel>Official tools and verification</SectionLabel><h2 className="mt-2 max-w-2xl text-2xl font-extrabold tracking-tight text-[var(--foreground)] sm:text-3xl">System resources</h2>
            <div className="mt-7 grid gap-4 md:grid-cols-3">
              {resources.map((resource) => <article key={resource.title} className="flex flex-col rounded-2xl border border-[var(--line)] bg-[var(--surface-muted)] p-5"><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--cdm-olive)]">{resource.label}</p><h3 className="mt-3 text-sm font-bold text-[var(--foreground)]">{resource.title}</h3><p className="mt-2 flex-1 text-xs leading-5 text-[var(--text-muted)]">{resource.copy}</p><Link href={gettingStarted && resource.label === 'Student mobile app' ? '#start' : resource.href} className="mt-5 inline-flex items-center justify-between border-t border-[var(--line)] pt-4 text-xs font-bold text-[var(--cdm-green)]">{gettingStarted && resource.label === 'Student mobile app' ? 'View installation guide' : resource.action}<span aria-hidden="true">→</span></Link></article>)}
            </div>
          </div>
        </section>

        {helpSection}

        <section className="bg-[var(--background)] py-12 sm:py-14">
          <div className="mx-auto flex max-w-7xl flex-col gap-5 rounded-[1.75rem] border border-[var(--line)] bg-[var(--surface)] px-5 py-7 sm:px-8 sm:py-9 lg:flex-row lg:items-center lg:justify-between lg:px-10">
            <div><SectionLabel>Colegio de Montalban · OJT</SectionLabel><h2 className="mt-2 text-xl font-extrabold tracking-tight text-[var(--foreground)] sm:text-2xl">Continue to your practicum portal</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--text-muted)]">Sign in to access your role-specific OJT workspace.</p></div>
            {onOpenAccessPortal ? <button type="button" onClick={onOpenAccessPortal} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-[var(--cdm-green)] px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-[var(--cdm-green-light)] active:scale-[0.98]">Access Portal <span aria-hidden="true">→</span></button> : <Link href="/auth/sign-in" className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-[var(--cdm-green)] px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-[var(--cdm-green-light)] active:scale-[0.98]">Access Portal <span aria-hidden="true">→</span></Link>}
          </div>
        </section>
      </main>

      <PublicFooter />
      {showPrototypeBadge && <div className="pointer-events-none fixed bottom-3 right-3 rounded-full border border-[var(--line)] bg-[var(--surface)]/90 px-3 py-1.5 text-[9px] font-bold uppercase tracking-[0.14em] text-[var(--cdm-olive)] shadow-sm">Prototype · Soft Forest</div>}
    </div>
  );
}
