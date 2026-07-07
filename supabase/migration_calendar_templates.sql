-- Calendar templates: organise a future term / school-holiday schedule
-- alongside the live calendar without affecting it.
-- calendar: 'main' = live calendar (default); 'next-term' / 'school-holidays' = templates.
-- Only the schedule grid respects this; dashboard, invoices, students, the shared
-- schedule and the public booking page always use 'main'.

alter table public.sessions
  add column if not exists calendar text not null default 'main';

create index if not exists sessions_coach_calendar_idx
  on public.sessions (coach_id, calendar);
