import Link from 'next/link';
import { getSupervisorInvitePreview } from '@/src/services/supervisorInvites';
import { InviteForm } from './InviteForm';

export default async function SupervisorInvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invite = await getSupervisorInvitePreview(token);

  if (!invite) {
    return (
      <div className="text-center flex flex-col items-center gap-4">
        <h1 className="text-xl font-black text-[#0A3824] font-serif">This invitation link is not valid</h1>
        <p className="text-xs text-slate-600 max-w-xs leading-relaxed">
          It may have expired, been used already, or been withdrawn. Ask your OJT Coordinator at Colegio de Montalban for a new link.
        </p>
        <Link href="/auth/sign-in" className="text-xs font-bold text-[#0A3824] hover:underline">Go to Sign In</Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-black text-[#0A3824] font-serif">Supervisor sign-up</h1>
        <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
          You are signing up as a Supervisor for <strong>{invite.company_name}</strong> ({invite.department} practicum students).
          We will email you a one-time link to choose your password.
        </p>
      </div>
      <InviteForm token={token} />
    </div>
  );
}
