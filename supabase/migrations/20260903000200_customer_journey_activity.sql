-- Lightweight operational journey feed. This deliberately excludes delivery
-- addresses, payment details, free-text searches, and other sensitive input.
create table if not exists public.customer_journey_sessions (
  session_id text primary key,
  user_id uuid references auth.users(id) on delete set null,
  anonymous_id text,
  current_route text,
  last_event_name text,
  last_event_at timestamptz not null default now(),
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.customer_journey_events (
  id uuid primary key default gen_random_uuid(),
  session_id text not null references public.customer_journey_sessions(session_id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  event_name text not null check (char_length(event_name) between 1 and 80),
  route text,
  properties jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists customer_journey_sessions_last_event_idx
  on public.customer_journey_sessions (last_event_at desc);
create index if not exists customer_journey_events_session_created_idx
  on public.customer_journey_events (session_id, created_at desc);

alter table public.customer_journey_sessions enable row level security;
alter table public.customer_journey_events enable row level security;

drop policy if exists "AOM admins can read customer journey sessions" on public.customer_journey_sessions;
create policy "AOM admins can read customer journey sessions"
on public.customer_journey_sessions for select to authenticated
using (exists (select 1 from public.admin_users where user_id = auth.uid()));

drop policy if exists "AOM admins can read customer journey events" on public.customer_journey_events;
create policy "AOM admins can read customer journey events"
on public.customer_journey_events for select to authenticated
using (exists (select 1 from public.admin_users where user_id = auth.uid()));

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'customer_journey_events'
  ) then
    alter publication supabase_realtime add table public.customer_journey_events;
  end if;
end $$;
