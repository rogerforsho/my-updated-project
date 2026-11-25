'use client';

import { useEffect, useState, type ReactNode } from 'react';
import QRCode from 'qrcode';
import { Download, Smartphone } from '@/src/components/ui/Icons';

const APK_PATH = '/downloads/CdM-OJT-Mobile.apk';

const steps = [
  ['Download the file', 'Tap Download for Android. The file is called CdM-OJT-Mobile.apk. Your browser may say this type of file can be harmful; that is a standard warning for every APK. Choose Keep or Download anyway.'],
  ['Allow your browser to install it', 'Open the downloaded file. Android will say it cannot install apps from this source: tap Settings, turn on Allow from this source for your browser (Chrome, for example), then go back. You can turn it off again afterwards.'],
  ['Install the app', 'Tap Install. If Google Play Protect says it has not seen this app before, tap More details, then Install anyway. This appears because the app is not in the Play Store.'],
  ['Open and sign in', 'Open CDM OJT Monitoring, create your student account with your school details, and wait for your OJT Coordinator to approve it. Allow camera and location when asked.'],
];

const facts = [
  ['What is an APK?', 'An APK is the installer file for an Android app, the same kind of file the Play Store downloads for you. This app is shared directly by the school instead of through the Play Store.'],
  ['Who made it?', 'Colegio de Montalban OJT Practicum Portal. Only trust the file you download from this page, never an APK sent to you in a chat, group or by another website.'],
  ['What it asks for', 'Camera, to take your attendance selfie. Location, to check you are at your workplace when you time in or out. Notifications, for reminders and announcements. It does not ask for your contacts or text messages.'],
  ['Updating or removing', 'To update, download the newest file from this page and install it over the old one. Your account stays on the server. To remove it, uninstall it like any other app.'],
  ['Something wrong?', 'If the install fails or you are not sure, stop and ask your OJT Coordinator before continuing. Never enter your password anywhere except in the app or this portal.'],
];

const TAP = '#D4A017';

function Dialog({ children }: { children: ReactNode }) {
  return (
    <>
      <rect x="9" y="9" width="102" height="202" rx="12" fill="#6B7280" opacity="0.35" />
      <rect x="18" y="62" width="84" height="104" rx="8" fill="#fff" />
      {children}
    </>
  );
}

// Drawn illustrations, not real screenshots: Android wording differs by phone brand.
function PhoneScreen({ step }: { step: number }) {
  return (
    <svg viewBox="0 0 120 220" className="mx-auto h-[270px] w-auto" aria-hidden="true" focusable="false" fontFamily="system-ui, sans-serif">
      <rect x="4" y="4" width="112" height="212" rx="16" fill="#111827" />
      <rect x="9" y="9" width="102" height="202" rx="12" fill="#F7F5EE" />
      <rect x="48" y="12" width="24" height="4" rx="2" fill="#111827" />
      {step === 0 && (
        <>
          <rect x="16" y="26" width="88" height="12" rx="6" fill="#E5E7EB" />
          <rect x="16" y="46" width="60" height="6" rx="3" fill="#D1D5DB" />
          <rect x="16" y="58" width="88" height="40" rx="6" fill="#1B4332" />
          <text x="60" y="82" fontSize="7" fontWeight="700" fill="#fff" textAnchor="middle">Download for Android</text>
          <Dialog>
            <text x="26" y="80" fontSize="7" fontWeight="700" fill="#111827">Download this file?</text>
            <rect x="26" y="88" width="66" height="4" rx="2" fill="#D1D5DB" />
            <rect x="26" y="97" width="58" height="4" rx="2" fill="#D1D5DB" />
            <text x="26" y="118" fontSize="6" fill="#6B7280">CdM-OJT-Mobile.apk</text>
            <text x="24" y="153" fontSize="6" fill="#6B7280">Cancel</text>
            <rect x="46" y="143" width="54" height="16" rx="8" fill="#1B4332" />
            <text x="73" y="153.5" fontSize="6" fontWeight="700" fill="#fff" textAnchor="middle">Download anyway</text>
            <rect x="44" y="141" width="58" height="20" rx="10" fill="none" stroke={TAP} strokeWidth="1.8" />
          </Dialog>
        </>
      )}
      {step === 1 && (
        <>
          <rect x="9" y="9" width="102" height="30" rx="12" fill="#E4DBC4" />
          <text x="18" y="29" fontSize="7.5" fontWeight="700" fill="#111827">Install unknown apps</text>
          <rect x="16" y="52" width="88" height="34" rx="8" fill="#fff" />
          <rect x="22" y="60" width="18" height="18" rx="5" fill="#9CA3AF" />
          <text x="46" y="66" fontSize="7" fontWeight="700" fill="#111827">Browser</text>
          <text x="46" y="78" fontSize="5.5" fill="#6B7280">Allow from this source</text>
          <rect x="80" y="58" width="18" height="10" rx="5" fill="#1B4332" />
          <circle cx="93" cy="63" r="3.6" fill="#fff" />
          <rect x="77" y="55" width="24" height="16" rx="8" fill="none" stroke={TAP} strokeWidth="1.8" />
          <text x="16" y="104" fontSize="5.5" fill="#6B7280">Turn this on, then go back</text>
          <text x="16" y="113" fontSize="5.5" fill="#6B7280">and open the file again.</text>
        </>
      )}
      {step === 2 && (
        <>
          <Dialog>
            <rect x="26" y="72" width="16" height="16" rx="4" fill="#0A3824" />
            <text x="48" y="76" fontSize="6.5" fontWeight="700" fill="#111827">CDM OJT</text>
            <text x="48" y="84" fontSize="6.5" fontWeight="700" fill="#111827">Monitoring</text>
            <text x="26" y="104" fontSize="5.5" fill="#6B7280">Do you want to install this app?</text>
            <rect x="26" y="112" width="66" height="4" rx="2" fill="#E5E7EB" />
            <rect x="26" y="120" width="52" height="4" rx="2" fill="#E5E7EB" />
            <text x="30" y="154" fontSize="7" fill="#6B7280">Cancel</text>
            <rect x="64" y="143" width="32" height="16" rx="8" fill="#1B4332" />
            <text x="80" y="153.5" fontSize="7" fontWeight="700" fill="#fff" textAnchor="middle">Install</text>
            <rect x="62" y="141" width="36" height="20" rx="10" fill="none" stroke={TAP} strokeWidth="1.8" />
          </Dialog>
          <text x="60" y="186" fontSize="5.5" fill="#374151" textAnchor="middle">Play Protect warning?</text>
          <text x="60" y="195" fontSize="5.5" fontWeight="700" fill="#374151" textAnchor="middle">More details → Install anyway</text>
        </>
      )}
      {step === 3 && (
        <>
          <rect x="9" y="9" width="102" height="44" rx="12" fill="#0A3824" />
          <text x="60" y="38" fontSize="8" fontWeight="700" fill="#fff" textAnchor="middle">CDM OJT Monitoring</text>
          <rect x="18" y="68" width="84" height="16" rx="5" fill="#fff" stroke="#D1D5DB" />
          <text x="24" y="78.5" fontSize="6" fill="#9CA3AF">School email</text>
          <rect x="18" y="92" width="84" height="16" rx="5" fill="#fff" stroke="#D1D5DB" />
          <text x="24" y="102.5" fontSize="6" fill="#9CA3AF">Password</text>
          <rect x="18" y="118" width="84" height="16" rx="8" fill="#1B4332" />
          <text x="60" y="128.5" fontSize="7" fontWeight="700" fill="#fff" textAnchor="middle">Sign in</text>
          <rect x="16" y="150" width="88" height="40" rx="8" fill="#fff" stroke="#D1D5DB" />
          <text x="60" y="163" fontSize="6" fontWeight="700" fill="#111827" textAnchor="middle">Allow camera and location?</text>
          <rect x="60" y="171" width="38" height="13" rx="6.5" fill="#1B4332" />
          <text x="79" y="180" fontSize="6" fontWeight="700" fill="#fff" textAnchor="middle">Allow</text>
          <rect x="58" y="169" width="42" height="17" rx="8.5" fill="none" stroke={TAP} strokeWidth="1.8" />
        </>
      )}
    </svg>
  );
}

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
              <p className="mt-1 text-xs text-[var(--text-muted)]">Official build from Colegio de Montalban, for students&apos; Android phones.</p>
              <a href={APK_PATH} download className="mt-5 inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--cdm-green)] px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-[var(--cdm-green-light)] active:scale-[0.98]"><Download className="h-4 w-4" />Download for Android</a>
              <p className="mt-4 text-xs leading-5 text-[var(--text-muted)]">Four quick steps below show what you will see on your phone.</p>
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
        <h3 className="mt-10 text-lg font-extrabold text-[var(--foreground)]">Install in 4 steps</h3>
        <ol className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map(([title, text], i) => (
            <li key={title} className="flex flex-col rounded-2xl border border-[var(--line)] bg-[var(--surface-muted)] p-5">
              <PhoneScreen step={i} />
              <span className="mt-4 flex items-center gap-2"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[#E4DBC4]/60 text-xs font-extrabold text-[var(--cdm-olive)]">{i + 1}</span><span className="text-sm font-bold text-[var(--foreground)]">{title}</span></span>
              <span className="mt-2 text-xs leading-5 text-[var(--text-muted)]">{text}</span>
            </li>
          ))}
        </ol>
        <p className="mt-3 text-xs leading-5 text-[var(--text-muted)]">The pictures are illustrations. Your phone may word things slightly differently, and the yellow outline shows what to tap.</p>

        <div className="mt-8 rounded-2xl border border-[var(--line)] bg-[var(--surface-muted)] px-5 sm:px-6">
          <h3 className="pt-5 text-sm font-extrabold text-[var(--foreground)]">Before you install: what you should know</h3>
          {facts.map(([q, a]) => (
            <details key={q} className="border-b border-[var(--line)] py-4 last:border-0">
              <summary className="cursor-pointer text-sm font-bold text-[var(--foreground)]">{q}</summary>
              <p className="mt-2 max-w-3xl text-xs leading-6 text-[var(--text-muted)]">{a}</p>
            </details>
          ))}
        </div>
        <p className="mt-4 text-xs leading-5 text-[var(--text-muted)]">Download the app only from this page. It is not listed in app stores.</p>
      </div>
    </section>
  );
}
