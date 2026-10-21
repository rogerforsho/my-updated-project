import { getServiceClient } from '@/src/lib/supabase/service';
export const dynamic = 'force-dynamic';
export async function GET() {
  const unavailable = () => Response.json({ status: 'unavailable' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  if (!(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL) || !process.env.SUPABASE_SERVICE_ROLE_KEY) return unavailable();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const service = getServiceClient();
    const checks = async () => {
      const [revision, storage] = await Promise.all([
        service.rpc('ojt_security_revision').abortSignal(AbortSignal.timeout(3000)),
        service.storage.getBucket('attendance-selfies'),
      ]);
      if (revision.error || revision.data < 44 || storage.error || storage.data?.public !== false) throw new Error('Dependency unavailable');
    };
    await Promise.race([checks(), new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(new Error('Readiness deadline exceeded')), 4000); })]);
    return Response.json({ status: 'ready' }, { headers: { 'Cache-Control': 'no-store' } });
  } catch { return unavailable(); }
  finally { if (timeout) clearTimeout(timeout); }
}
