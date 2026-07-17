-- Records vendor order-email attempts so a paid order is never emailed twice.
create table if not exists public.vendor_order_alerts (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  vendor_id uuid not null references public.vendors(id) on delete cascade,
  channel text not null default 'email' check (channel in ('email', 'sms', 'whatsapp')),
  recipient text,
  status text not null default 'queued' check (status in ('queued', 'sent', 'failed', 'skipped')),
  payload jsonb not null default '{}'::jsonb,
  provider_message_id text,
  error_message text,
  attempts integer not null default 0,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (order_id, vendor_id, channel)
);

create index if not exists vendor_order_alerts_order_idx
  on public.vendor_order_alerts(order_id, created_at desc);

alter table public.vendor_order_alerts enable row level security;
