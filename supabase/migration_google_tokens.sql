-- Run this in the Supabase SQL editor to add Google Calendar token storage
-- Safe to run multiple times (uses IF NOT EXISTS)

CREATE TABLE IF NOT EXISTS public.google_tokens (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  access_token  text NOT NULL,
  refresh_token text NOT NULL,
  expiry_date   bigint,
  calendar_id   text,
  calendar_name text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.google_tokens ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'coaches_own_tokens') THEN
    CREATE POLICY "coaches_own_tokens" ON public.google_tokens
      FOR ALL USING (auth.uid() = coach_id)
      WITH CHECK (auth.uid() = coach_id);
  END IF;
END $$;
