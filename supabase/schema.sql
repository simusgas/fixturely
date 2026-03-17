-- Run this in the Supabase SQL editor: https://supabase.com/dashboard

-- ── Students ──────────────────────────────────────────────────────────────────
create table if not exists public.students (
  id          uuid    primary key default gen_random_uuid(),
  coach_id    uuid    not null references auth.users(id) on delete cascade,
  name        text    not null,
  level       text    not null default '',
  credits     integer not null default 0,
  sessions    integer not null default 0,
  owing       numeric not null default 0,
  created_at  timestamptz not null default now()
);

alter table public.students enable row level security;

create policy "coaches_own_students" on public.students
  for all using (auth.uid() = coach_id)
  with check (auth.uid() = coach_id);

-- ── Sessions ──────────────────────────────────────────────────────────────────
create table if not exists public.sessions (
  id          uuid    primary key default gen_random_uuid(),
  coach_id    uuid    not null references auth.users(id) on delete cascade,
  student     text    not null,
  level       text    not null default '',
  time        text    not null,
  dur         text    not null,
  court       text    not null default '',
  recur       text    not null default 'One-time',
  date        text    not null,       -- stored as YYYY-MM-DD string to match app format
  pay_status  text    not null default 'unpaid',
  notes       text    not null default '',
  created_at  timestamptz not null default now()
);

alter table public.sessions enable row level security;

create policy "coaches_own_sessions" on public.sessions
  for all using (auth.uid() = coach_id)
  with check (auth.uid() = coach_id);

-- ── Invoices ──────────────────────────────────────────────────────────────────
create table if not exists public.invoices (
  id             uuid    primary key default gen_random_uuid(),
  coach_id       uuid    not null references auth.users(id) on delete cascade,
  invoice_number text    not null,
  student        text    not null,
  amount         numeric not null,
  status         text    not null default 'Pending',  -- 'Paid' | 'Pending' | 'Overdue'
  date           text    not null,
  items          text    not null default '',
  created_at     timestamptz not null default now()
);

alter table public.invoices enable row level security;

create policy "coaches_own_invoices" on public.invoices
  for all using (auth.uid() = coach_id)
  with check (auth.uid() = coach_id);
