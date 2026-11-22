'use client';

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Download, Smartphone } from '@/src/components/ui/Icons';

const APK_PATH = '/downloads/CdM-OJT-Mobile.apk';

const steps = [
  ['Download the app', 'Tap Download for Android. Your browser may warn that this type of file can be harmful; choose Keep.'],
  ['Allow the install', 'When asked, allow your browser to Install unknown apps. If Play Protect warns about the app, tap Install anyway.'],
  ['Open and sign in', 'Open CDM OJT Monitoring, create your student account, and wait for Coordinator approval.'],
];

export default function MobileAppSection() {
  const [qr, setQr] = useState('');

  useEffect(() => {
    QRCode.toDataURL(`${window.location.origin}${APK_PATH}`, { margin: 1, width: 184, color: { dark: '#1B4332', light: '#FFFFFF' } })
      .then(setQr)
      .catch(() => setQr(''));
  }, []);

  return (
    <section id="app" className="scroll-mt-6 border-b border-[var(--line)] bg-[var(--surface)] py-14 sm:py-16">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <p className="text-xs font-bold text-[var(--cdm-olive)]">Student mobile app</p>
        <h2 className="mt-2 max-w-2xl text-2xl font-extrabold tracking-tight text-[var(--foreground)] sm:text-3xl">Get the OJT app on your phone.</h2>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--text-muted)]">Log GPS-verified attendance with a selfie, track your hours, and submit reports. Attendance still works offline and syncs when the internet returns.</p>

        <div className="mt-8 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
          <article className="grid gap-6 rounded-2xl border border-[var(--line)] bg-[var(--surface-muted)] p-5 sm:grid-cols-[1fr_auto] sm:p-6">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full bg-[#E4DBC4]/60 px-2.5 py-1 text-xs font-bold text-[var(--cdm-olive)]"><Smartphone className="h-3.5 w-3.5" />Android · Version 1.1.0</span>
              <h3 className="mt-4 text-lg font-extrabold text-[var(--foreground)]">CDM OJT Monitoring for Android</h3>
              <p className="mt-1 text-xs text-[var(--text-muted)]">Official build from Colegio de Montalban, for students' Android phones.</p>
              <a href={APK_PATH} download className="mt-5 inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--cdm-green)] px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-[var(--cdm-green-light)] active:scale-[0.98]"><Download className="h-4 w-4" />Download for Android</a>
              <ol className="mt-6 grid gap-4">
                {steps.map(([title, text], i) => (
                  <li key={title} className="flex gap-3">
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#E4DBC4]/60 text-xs font-extrabold text-[var(--cdm-olive)]">{i + 1}</span>
                    <span><span className="block text-sm font-bold text-[var(--foreground)]">{title}</span><span className="mt-0.5 block text-xs leading-5 text-[var(--text-muted)]">{text}</span></span>
                  </li>
                ))}
              </ol>
            </div>
            <div className="hidden flex-col items-center gap-2 sm:flex">
              <div className="grid h-[200px] w-[200px] place-items-center rounded-2xl border border-[var(--line)] bg-white">
                {/* eslint-disable-next-line @next/next/no-img-element -- data: URL generated in the browser */}
                {qr ? <img src={qr} alt="QR code that downloads the Android app" width={184} height={184} /> : null}
              </div>
              <p className="text-center text-xs font-semibold text-[var(--text-muted)]">On a computer?<br />Scan with your phone.</p>
            </div>
          </article>

          <article className="flex flex-col rounded-2xl border border-dashed border-[var(--line)] bg-[var(--surface-muted)] p-5 sm:p-6">
            <span className="inline-flex w-fit items-center gap-2 rounded-full border border-[var(--line)] px-2.5 py-1 text-xs font-bold text-[var(--text-muted)]"><Smartphone className="h-3.5 w-3.5" />iPhone · Coming soon</span>
            <h3 className="mt-4 text-lg font-extrabold text-[var(--foreground)]">iPhone version</h3>
            <p className="mt-2 flex-1 text-xs leading-5 text-[var(--text-muted)]">The iPhone app is not available yet. iPhone users can ask the OJT Coordinator for help recording attendance until it is released.</p>
          </article>
        </div>
        <p className="mt-4 text-xs leading-5 text-[var(--text-muted)]">Download the app only from this page. It is not listed in app stores.</p>
      </div>
    </section>
  );
}
