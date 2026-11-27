import Link from 'next/link';
import { getSupervisorInvitePreview } from '@/src/services/supervisorInvites';
import { InviteForm } from './InviteForm';

export default async function SupervisorInvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invite = await getSupervisorInvitePreview(token);

  if (!invite) {
    return (
      <main className="text-center flex flex-col items-center gap-4 py-4">
        <p className="text-xs font-bold text-[#45644A]">SUPERVISOR INVITATION</p>
        <h1 className="text-3xl font-extrabold tracking-tight text-[#0A3824]">This invitation link is not valid</h1>
        <p className="text-sm text-[#5A6A5E] max-w-xs leading-6">
          It may have expired, been used already, or been withdrawn. Ask your OJT Coordinator at Colegio de Montalban for a new link.
        </p>
        <Link href="/auth/sign-in" className="text-sm font-bold text-[#0A3824] underline-offset-4 hover:underline">Go to sign in</Link>
      </main>
    );
  }

  return (
    <main className="flex flex-col gap-6">
      <div>
        <p className="text-xs font-bold text-[#45644A]">SUPERVISOR INVITATION</p>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-[#0A3824]">Join your practicum workspace</h1>
        <p className="mt-3 text-sm leading-6 text-[#5A6A5E]">
          Create your Supervisor account for <strong className="text-[#18271D]">{invite.company_name}</strong> and {invite.department} practicum students.
        </p>
        <p className="mt-2 text-sm leading-6 text-[#5A6A5E]">We’ll email you a one-time link to choose your password.</p>
      </div>
      <InviteForm token={token} />
    </main>
  );
}
