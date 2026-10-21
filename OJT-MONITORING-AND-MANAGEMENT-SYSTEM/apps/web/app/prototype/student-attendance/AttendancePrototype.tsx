'use client';

import { useCallback, useEffect, useState } from 'react';

// Three calmer visual refinements of the current mobile attendance screen, switchable via ?variant=.
const variants = [
  { key: 'A', name: 'Soft Forest', description: 'Keep the current layout and soften the surfaces.' },
  { key: 'B', name: 'Warm Paper', description: 'Use quieter rows and warm neutral paper tones.' },
  { key: 'C', name: 'Clear Steps', description: 'Give the next attendance action the clearest path.' },
] as const;

type VariantKey = (typeof variants)[number]['key'];

function Mark({ muted = false }: { muted?: boolean }) {
  return <span className={`grid h-9 w-9 place-items-center rounded-xl text-sm font-black ${muted ? 'bg-[#EDF2EB] text-[#0A3824]' : 'border border-white/20 bg-white/10 text-white'}`}>CdM</span>;
}

function StatusLine({ variant }: { variant: VariantKey }) {
  if (variant === 'A') {
    return <div className="flex items-center gap-3 rounded-2xl bg-[#EDF2EB] p-4"><span className="grid h-9 w-9 place-items-center rounded-full bg-white text-[#45644A]">⌖</span><div className="min-w-0 flex-1"><p className="text-xs font-bold text-[#18271D]">GPS verification</p><p className="mt-1 text-[11px] text-[#68776B]">Your workplace location is checked before attendance.</p></div><span className="h-2 w-2 rounded-full bg-[#45644A]" /></div>;
  }
  if (variant === 'B') {
    return <div className="flex items-start gap-3 border-t border-[#DCE5DB] py-4"><span className="text-base text-[#45644A]">⌖</span><div><p className="text-xs font-bold text-[#18271D]">Location check</p><p className="mt-1 text-[11px] text-[#68776B]">Verified before your selfie is captured.</p></div><span className="ml-auto mt-1 text-[10px] font-semibold text-[#45644A]">REQUIRED</span></div>;
  }
  return <div className="rounded-xl border border-[#DCE5DB] px-3 py-3"><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#68776B]">Before clock-in</p><p className="mt-1 text-xs font-semibold text-[#18271D]">GPS location check + selfie</p></div>;
}

function MainAction({ variant }: { variant: VariantKey }) {
  return <button type="button" className={`w-full rounded-2xl px-4 py-4 text-sm font-bold transition-transform active:scale-[0.98] ${variant === 'B' ? 'bg-[#0A3824] text-white' : variant === 'C' ? 'bg-[#0A3824] text-white shadow-sm' : 'bg-[#0A3824] text-white'}`}><span className="flex items-center justify-between"><span>Time in with selfie</span><span aria-hidden="true">→</span></span></button>;
}

function AttendanceScreen({ variant }: { variant: VariantKey }) {
  const isPaper = variant === 'B';
  const isSteps = variant === 'C';

  return (
    <div className={`min-h-[730px] ${isPaper ? 'bg-[#F3EDE3]' : 'bg-[#F4F6F2]'}`}>
      <header className={`px-5 pb-5 pt-5 ${isSteps ? 'border-b border-[#DCE5DB] bg-white' : isPaper ? 'border-b border-[#D7CEBB] bg-[#F3EDE3]' : 'bg-[#0A3824] text-white'}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3"><Mark muted={isPaper || isSteps} /><div><p className={`text-[10px] font-bold uppercase tracking-[0.14em] ${isPaper || isSteps ? 'text-[#68776B]' : 'text-white/70'}`}>Colegio de Montalban</p><p className={`text-sm font-bold ${isPaper || isSteps ? 'text-[#18271D]' : 'text-white'}`}>OJT attendance</p></div></div>
          <button type="button" aria-label="Notifications" className={`grid h-9 w-9 place-items-center rounded-full ${isPaper || isSteps ? 'bg-white text-[#45644A]' : 'bg-white/10 text-white'}`}>•</button>
        </div>
        <div className="mt-6"><p className={`text-[10px] font-bold uppercase tracking-[0.15em] ${isPaper || isSteps ? 'text-[#68776B]' : 'text-[#D5B254]'}`}>Today · Practicum</p><h1 className={`mt-1 text-2xl font-extrabold tracking-tight ${isPaper || isSteps ? 'text-[#18271D]' : 'text-white'}`}>Attendance Portal</h1></div>
      </header>

      <main className="px-4 pb-7 pt-4">
        <div className={`mb-4 flex rounded-xl p-1 ${isPaper ? 'bg-[#E4DBC4]/65' : 'bg-[#EDF2EB]'}`}>
          <button type="button" className="flex-1 rounded-lg bg-white px-3 py-2 text-xs font-bold text-[#0A3824] shadow-sm">Check in</button>
          <button type="button" className="flex-1 rounded-lg px-3 py-2 text-xs font-semibold text-[#68776B]">History</button>
        </div>

        {isSteps ? (
          <section className="mb-4 bg-white px-4 py-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#68776B]">Today&apos;s attendance</p>
            <div className="mt-4 flex gap-3"><span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[#EDF2EB] text-[11px] font-bold text-[#45644A]">1</span><div><p className="text-sm font-bold text-[#18271D]">Time in</p><p className="mt-1 text-[11px] text-[#68776B]">No attendance recorded yet today.</p></div></div>
            <div className="ml-3 my-2 h-5 border-l border-dashed border-[#B9C8B7]" />
            <div className="flex gap-3"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-[#DCE5DB] text-[11px] text-[#68776B]">2</span><div><p className="text-sm font-semibold text-[#68776B]">Time out</p><p className="mt-1 text-[11px] text-[#68776B]">Available after time in.</p></div></div>
          </section>
        ) : (
          <section className={`mb-4 rounded-2xl p-4 ${isPaper ? 'border border-[#D7CEBB] bg-white/70' : 'border border-[#DCE5DB] bg-white'}`}>
            <div className="flex items-start justify-between gap-4"><div><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#68776B]">Today&apos;s status</p><p className="mt-1 text-base font-bold text-[#18271D]">Not clocked in</p></div><span className="rounded-full bg-[#EDF2EB] px-2.5 py-1 text-[10px] font-semibold text-[#45644A]">Ready</span></div>
            <div className={`mt-4 flex justify-between border-t pt-3 text-xs ${isPaper ? 'border-[#D7CEBB]' : 'border-[#E7ECE5]'}`}><span className="text-[#68776B]">Time in</span><span className="font-semibold text-[#18271D]">—</span><span className="text-[#68776B]">Time out</span><span className="font-semibold text-[#18271D]">—</span></div>
          </section>
        )}

        {variant === 'A' ? <StatusLine variant={variant} /> : <StatusLine variant={variant} />}

        <div className={isSteps ? 'mt-5' : 'mt-4'}><MainAction variant={variant} /></div>
        <p className="mt-2 px-2 text-center text-[10px] leading-4 text-[#68776B]">Attendance is recorded after your location is checked and selfie is submitted.</p>

        <section className={`mt-5 ${isPaper ? 'border-t border-[#D7CEBB] pt-4' : 'rounded-2xl border border-[#DCE5DB] bg-white px-4 py-3'}`}>
          <div className="flex items-center justify-between"><p className="text-xs font-bold text-[#18271D]">Offline attendance</p><span className="text-[10px] font-semibold text-[#45644A]">SYNC ON RECONNECT</span></div>
          <p className="mt-1 text-[11px] leading-4 text-[#68776B]">Offline logs sync automatically when internet returns.</p>
        </section>

        <button type="button" className={`mt-4 w-full text-xs font-semibold text-[#45644A] ${isPaper ? 'border-t border-[#D7CEBB] pt-4 text-left' : 'py-2'}`}>View attendance history <span aria-hidden="true">→</span></button>
      </main>
    </div>
  );
}

export default function AttendancePrototype({ initialVariant }: { initialVariant: VariantKey }) {
  const [variant, setVariant] = useState<VariantKey>(initialVariant);
  const setVariantFromIndex = useCallback((index: number) => {
    const next = variants[(index + variants.length) % variants.length];
    setVariant(next.key);
    const url = new URL(window.location.href);
    url.searchParams.set('variant', next.key);
    window.history.replaceState(null, '', url);
  }, []);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLElement && event.target.matches('input, textarea, [contenteditable="true"]')) return;
      if (event.key === 'ArrowLeft') setVariantFromIndex(variants.findIndex(item => item.key === variant) - 1);
      if (event.key === 'ArrowRight') setVariantFromIndex(variants.findIndex(item => item.key === variant) + 1);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [setVariantFromIndex, variant]);

  const index = variants.findIndex(item => item.key === variant);
  const current = variants[index];

  return (
    <div className="min-h-screen bg-[#EDF2EB] px-4 pb-28 pt-6 text-[#18271D] sm:px-8 sm:pt-9">
      <div className="mx-auto max-w-4xl">
        <div className="mb-5 text-center sm:mb-7"><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#45644A]">Design directions · {current.key}</p><h2 className="mt-1 text-xl font-extrabold tracking-tight">{current.name}</h2><p className="mt-1 text-xs text-[#68776B]">{current.description}</p></div>
        <div className="mx-auto w-full max-w-[420px] overflow-hidden rounded-[1.75rem] border border-[#DCE5DB] bg-white shadow-[0_12px_36px_rgba(24,39,29,0.08)]"><AttendanceScreen variant={variant} /></div>
        <p className="mx-auto mt-4 max-w-[420px] text-center text-[10px] leading-4 text-[#68776B]">Visual preview based on the current attendance UI. Controls here are for design review only.</p>
      </div>

      <div className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-full border border-[#DCE5DB] bg-white px-3 py-2 shadow-lg" aria-label="Prototype variant switcher">
        <button type="button" onClick={() => setVariantFromIndex(index - 1)} className="grid h-9 w-9 place-items-center rounded-full text-lg text-[#45644A] hover:bg-[#EDF2EB]" aria-label="Previous design">←</button>
        <span className="min-w-[116px] text-center text-[11px] font-bold text-[#18271D]">{current.key} · {current.name}</span>
        <button type="button" onClick={() => setVariantFromIndex(index + 1)} className="grid h-9 w-9 place-items-center rounded-full text-lg text-[#45644A] hover:bg-[#EDF2EB]" aria-label="Next design">→</button>
      </div>
    </div>
  );
}
