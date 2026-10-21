import 'server-only';

import { createClient } from '@/src/lib/supabase/server';

/** Resolves identity only from the signed-in Auth user and their active public profile. */
export async function getTrustedActor() {
  const supabase = await createClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  const authUser = authData.user;
  if (authError || !authUser) return { supabase, user: null, profile: null };

  const { data: profile, error: profileError } = await supabase
    .from('users')
    .select('user_id, full_name, email, role, account_status')
    .eq('user_id', authUser.id)
    .maybeSingle();

  if (profileError || !profile || profile.user_id !== authUser.id || profile.account_status !== 'active') {
    return { supabase, user: null, profile: null };
  }
  if (profile.role === 'Admin') {
    const { data: assurance, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (error || assurance?.currentLevel !== 'aal2') return { supabase, user: null, profile: null };
  }

  return { supabase, user: authUser, profile };
}
