import { notFound } from 'next/navigation';
import AttendancePrototype from './AttendancePrototype';

export default async function StudentAttendancePrototypePage({
  searchParams,
}: {
  searchParams: Promise<{ variant?: string }>;
}) {
  if (process.env.NODE_ENV === 'production') notFound();

  const { variant } = await searchParams;
  const initialVariant = variant === 'B' || variant === 'C' ? variant : 'A';
  return <AttendancePrototype initialVariant={initialVariant} />;
}
