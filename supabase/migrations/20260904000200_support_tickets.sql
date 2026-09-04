create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null default 'general' check (category in ('order', 'payment', 'delivery', 'account', 'vendor', 'general')),
  subject text not null check (char_length(trim(subject)) between 3 and 120),
  message text not null check (char_length(trim(message)) between 5 and 1200),
  status text not null default 'open' check (status in ('open', 'in_progress', 'resolved')),
  admin_reply text,
  replied_by uuid references auth.users(id) on delete set null,
  replied_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists support_tickets_user_updated_idx on public.support_tickets (user_id, updated_at desc);
create index if not exists support_tickets_status_updated_idx on public.support_tickets (status, updated_at asc);

alter table public.support_tickets enable row level security;

drop policy if exists "Customers can read their own support tickets" on public.support_tickets;
create policy "Customers can read their own support tickets" on public.support_tickets for select to authenticated using (auth.uid() = user_id);

drop policy if exists "Customers can create their own support tickets" on public.support_tickets;
create policy "Customers can create their own support tickets" on public.support_tickets for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "AOM admins manage support tickets" on public.support_tickets;
create policy "AOM admins manage support tickets" on public.support_tickets for all to authenticated
using (exists (select 1 from public.admin_users where user_id = auth.uid()))
with check (exists (select 1 from public.admin_users where user_id = auth.uid()));
