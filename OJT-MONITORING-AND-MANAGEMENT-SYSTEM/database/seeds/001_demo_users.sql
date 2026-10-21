-- Demo accounts with shared fixed passwords are intentionally disabled.
-- This file previously created a publicly guessable active administrator and deleted
-- fixed Auth identities, so it must never be replayed against staging or production.
-- Create test users through Supabase Auth Admin API in a disposable isolated project,
-- using one-time random passwords stored outside the repository.
DO $$ BEGIN
  RAISE EXCEPTION 'Demo seed disabled: it contains no executable demo-account setup. Use isolated staging and unique credentials.';
END $$;
