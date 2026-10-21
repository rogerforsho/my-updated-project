import 'server-only';

import { getServiceClient } from '@/src/lib/supabase/service';

interface AuditEventInput {
  actor_user_id?: string | null;
  action: string;
  entity_type: string;
  entity_id?: string | null;
  details?: Record<string, unknown>;
  ip_address?: string | null;
}

// Internal writer, deliberately not a callable Server Action. Callers provide
// the authenticated actor when one exists; public requests use a null actor.
export async function recordAuditEvent(input: AuditEventInput): Promise<void> {
  try {
    const { error } = await getServiceClient().from('audit_logs').insert({
      actor_user_id: input.actor_user_id || null,
      action: input.action,
      entity_type: input.entity_type,
      entity_id: input.entity_id || null,
      details: input.details || {},
      ip_address: input.ip_address || null,
    });
    if (error) console.error(`[AUDIT] ${input.action} insert failed: ${error.message}`);
  } catch {
    console.error(`[AUDIT] ${input.action} insert threw an error`);
  }
}
