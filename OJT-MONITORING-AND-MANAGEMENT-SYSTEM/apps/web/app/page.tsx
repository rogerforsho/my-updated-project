import { Metadata } from 'next';
import LandingPageClient from '@/src/components/landing/LandingPageClient';

export const metadata: Metadata = {
  title: 'Colegio de Montalban - Official OJT Monitoring & Management Portal',
  description: 'The authoritative cross-platform practicum monitoring and compliance ecosystem for 4th-year ICS and IBE students of Colegio de Montalban.',
  alternates: {
    canonical: '/',
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootPage() {
  return <LandingPageClient />;
}
