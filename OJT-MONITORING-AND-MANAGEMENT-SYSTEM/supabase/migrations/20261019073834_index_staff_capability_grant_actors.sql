CREATE INDEX staff_capability_grants_granted_by_idx
  ON public.staff_capability_grants (granted_by_user_id);
CREATE INDEX staff_capability_grants_revoked_by_idx
  ON public.staff_capability_grants (revoked_by_user_id);
