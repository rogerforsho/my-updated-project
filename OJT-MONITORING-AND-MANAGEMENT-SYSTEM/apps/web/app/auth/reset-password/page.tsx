import { redirect } from 'next/navigation';

export default function LegacyPasswordResetPage() {
  redirect('/auth/sign-in');
}
