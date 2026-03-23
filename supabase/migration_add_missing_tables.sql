-- Run this in the Supabase SQL editor to add missing tables and columns
-- Safe to run multiple times (uses IF NOT EXISTS / IF NOT EXISTS checks)

-- Add phone column to students if missing
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'students' AND column_name = 'phone') THEN
    ALTER TABLE public.students ADD COLUMN phone text NOT NULL DEFAULT '';
  END IF;
END $$;

-- ── Terms ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.terms (
  id          uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id    uuid    NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        text    NOT NULL,
  start       text    NOT NULL,
  "end"       text    NOT NULL,
  weeks       integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.terms ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'coaches_own_terms') THEN
    CREATE POLICY "coaches_own_terms" ON public.terms
      FOR ALL USING (auth.uid() = coach_id)
      WITH CHECK (auth.uid() = coach_id);
  END IF;
END $$;

-- ── Holidays ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.holidays (
  id          uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id    uuid    NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        text    NOT NULL,
  start       text    NOT NULL,
  "end"       text    NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.holidays ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'coaches_own_holidays') THEN
    CREATE POLICY "coaches_own_holidays" ON public.holidays
      FOR ALL USING (auth.uid() = coach_id)
      WITH CHECK (auth.uid() = coach_id);
  END IF;
END $$;
