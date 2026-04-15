-- Add columns for recurring lesson cancellation support
-- cancelled_dates: JSON array of YYYY-MM-DD strings for single-occurrence cancellations
-- recur_end: YYYY-MM-DD string — recurring lesson stops after this date

alter table public.sessions
  add column if not exists cancelled_dates jsonb default '[]'::jsonb,
  add column if not exists recur_end text;
