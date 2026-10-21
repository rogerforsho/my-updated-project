import { redirect } from 'next/navigation';

export default function LegacyProgramHeadIndexPage() {
  redirect('/coordinator/reports');
}
