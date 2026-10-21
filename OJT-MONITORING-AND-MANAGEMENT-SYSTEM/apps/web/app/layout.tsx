import type { Metadata } from "next";
import { headers } from "next/headers";
import { Plus_Jakarta_Sans, Outfit } from "next/font/google";
import ClientProviders from "@/src/components/providers/ClientProviders";
import "./globals.css";

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-geometric-sans",
  weight: ["300", "400", "500", "600", "700", "800"],
});

const outfit = Outfit({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-geometric-display",
  weight: ["500", "600", "700", "800", "900"],
});

const siteUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://ojt.cdm.edu.ph';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: 'Colegio de Montalban - OJT Monitoring System',
    template: '%s | CdM OJT Portal',
  },
  description: 'Cross-Platform OJT Monitoring and Management System for Institute of Computing Studies (ICS) & Institute of Business and Entrepreneurship (IBE) Trainees - Colegio de Montalban',
  keywords: [
    'Colegio de Montalban',
    'CdM',
    'OJT Monitoring System',
    'Practicum Management',
    'ICS',
    'IBE',
    'Kasiglahan Village',
    'Rodriguez Rizal',
  ],
  authors: [{ name: 'Colegio de Montalban' }],
  creator: 'Colegio de Montalban',
  publisher: 'Colegio de Montalban',
  icons: {
    icon: [
      { url: '/logo.png', sizes: 'any', type: 'image/png' },
      { url: '/logo.png', sizes: '32x32', type: 'image/png' },
      { url: '/logo.png', sizes: '192x192', type: 'image/png' },
    ],
    shortcut: '/logo.png',
    apple: [
      { url: '/logo.png', sizes: '180x180', type: 'image/png' },
    ],
  },
  openGraph: {
    title: 'Colegio de Montalban - OJT Practicum Portal',
    description: 'Official Cross-Platform OJT Monitoring and Management System for graduating trainees.',
    url: siteUrl,
    siteName: 'CdM OJT Portal',
    locale: 'en_PH',
    type: 'website',
    images: [
      {
        url: '/logo.png',
        width: 512,
        height: 512,
        alt: 'Colegio de Montalban Official Seal',
      },
    ],
  },
  twitter: {
    card: 'summary',
    title: 'Colegio de Montalban - OJT Practicum Portal',
    description: 'Official Cross-Platform OJT Monitoring and Management System.',
    images: ['/logo.png'],
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const nonce = (await headers()).get("x-nonce") || undefined;
  return (
    <html
      lang="en"
      className={`h-full antialiased ${plusJakartaSans.variable} ${outfit.variable}`}
      suppressHydrationWarning
    >
      <head>
        {/* Browsers mask nonce attributes in the DOM, causing a false React 19.2 hydration warning. */}
        <script
          nonce={nonce}
          suppressHydrationWarning
          dangerouslySetInnerHTML={{
            __html: `
              try {
                const t = localStorage.getItem('ojt_theme');
                if (t === 'dark' || (!t && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
                  document.documentElement.classList.add('dark');
                } else {
                  document.documentElement.classList.remove('dark');
                }
              } catch (_) {}
            `,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col bg-[#F4F6F2] dark:bg-[#0B0F19] text-slate-900 dark:text-slate-100 font-sans transition-colors duration-150">
        <ClientProviders>
          {children}
        </ClientProviders>
      </body>
    </html>
  );
}
