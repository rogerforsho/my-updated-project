import { redirect } from 'next/navigation';
import { createClient } from '@/src/lib/supabase/server';
import { listAllCohortProgress } from '@/src/services/progress';
import WhatIfClient from './WhatIfClient';

export default async function CoordinatorWhatIfPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/auth/sign-in');
  const { data, error } = await listAllCohortProgress();
  if (error) throw new Error(error.message);
  return <WhatIfClient students={data ?? []} />;
}
