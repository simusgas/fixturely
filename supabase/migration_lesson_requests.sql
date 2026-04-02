-- Run this in the Supabase SQL editor
-- Safe to run multiple times (uses IF NOT EXISTS)

CREATE TABLE IF NOT EXISTS public.lesson_requests (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  student_name   text NOT NULL,
  contact        text NOT NULL,
  message        text DEFAULT '',
  requested_date text NOT NULL,
  requested_time text NOT NULL,
  status         text NOT NULL DEFAULT 'pending',
  created_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.lesson_requests ENABLE ROW LEVEL SECURITY;

-- Anyone can insert (public page, no auth required)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'public_insert_requests') THEN
    CREATE POLICY "public_insert_requests" ON public.lesson_requests
      FOR INSERT WITH CHECK (true);
  END IF;
END $$;

-- Coaches can read/update/delete their own
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'coaches_manage_requests') THEN
    CREATE POLICY "coaches_manage_requests" ON public.lesson_requests
      FOR ALL USING (auth.uid() = coach_id);
  END IF;
END $$;
