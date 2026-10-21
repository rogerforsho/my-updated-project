import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Verify Practicum Certificate',
  description: 'Public credential verification portal for official OJT Certificates of Completion issued by Colegio de Montalban for ICS and IBE trainees.',
  alternates: {
    canonical: '/verify-certificate',
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function VerifyCertificateLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
