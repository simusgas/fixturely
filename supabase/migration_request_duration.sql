-- Run this in the Supabase SQL editor
-- Students choosing lesson options when requesting:
--   requested_dur   30m / 45m / 1h
--   requested_recur One-time / Weekly (required in the form)
--   requested_cal   which schedule the link shared (main / next-term / school-holidays)
-- Safe to run multiple times.

ALTER TABLE public.lesson_requests
  ADD COLUMN IF NOT EXISTS requested_dur text NOT NULL DEFAULT '1h';

ALTER TABLE public.lesson_requests
  ADD COLUMN IF NOT EXISTS requested_recur text NOT NULL DEFAULT 'One-time';

ALTER TABLE public.lesson_requests
  ADD COLUMN IF NOT EXISTS requested_cal text NOT NULL DEFAULT 'main';
