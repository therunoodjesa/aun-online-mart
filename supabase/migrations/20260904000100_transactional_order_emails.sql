create table if not exists public.order_email_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  event_type text not null check (event_type in ('received', 'on_its_way', 'ready_for_pickup', 'delivered')),
  recipient text not null,
  status text not null default 'pending' check (status in ('pending', 'sending', 'sent', 'failed')),
  provider_message_id text,
  error_message text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (order_id, event_type)
);

create index if not exists order_email_events_status_idx on public.order_email_events (status, created_at desc);
alter table public.order_email_events enable row level security;

drop policy if exists "AOM admins can read order email events" on public.order_email_events;
create policy "AOM admins can read order email events" on public.order_email_events for select to authenticated
using (exists (select 1 from public.admin_users where user_id = auth.uid()));
