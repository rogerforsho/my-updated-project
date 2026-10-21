-- Migration: 016_password_reset_otps.sql
-- Description: Creates secure password_reset_otps table for 6-digit verification code recovery flow.
-- Protects against automated URL pre-fetching / Defender SafeLinks token burnouts.

CREATE TABLE IF NOT EXISTS public.password_reset_otps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    otp_hash TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    used BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for fast active token lookups by email
CREATE INDEX IF NOT EXISTS idx_password_reset_otps_lookup
    ON public.password_reset_otps (email, used, expires_at);

-- Enable Row Level Security (RLS)
ALTER TABLE public.password_reset_otps ENABLE ROW LEVEL SECURITY;

-- Deny direct client-side reads/writes.
-- All operations are performed exclusively via Server Actions using the Supabase Service Role client.
CREATE POLICY "Service role manages password reset otps"
    ON public.password_reset_otps
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);
