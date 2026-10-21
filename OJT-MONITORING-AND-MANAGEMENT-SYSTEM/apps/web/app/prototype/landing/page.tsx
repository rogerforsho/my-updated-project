import { notFound } from 'next/navigation';
import SoftForestLanding from '@/src/components/landing/SoftForestLanding';

export default function LandingPrototypePage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return <SoftForestLanding showPrototypeBadge />;
}
