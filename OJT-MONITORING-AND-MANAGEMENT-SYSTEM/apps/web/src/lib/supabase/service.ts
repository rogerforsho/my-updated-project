import { createClient as createServiceClient } from '@supabase/supabase-js';

/**
 * Returns a Supabase client with administrative service_role privileges.
 * Includes safe placeholder fallbacks for build-time static generation on CI/CD (e.g. Vercel).
 */
export function getServiceClient() {
  return createServiceClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co',
    process.env.SUPABASE_SERVICE_ROLE_KEY || 'placeholder-service-key',
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}
