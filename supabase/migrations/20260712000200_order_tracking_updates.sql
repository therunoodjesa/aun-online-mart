-- Vendor and system messages displayed in the buyer's live order-tracking feed.
create table if not exists public.order_updates (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  vendor_id uuid references public.vendors(id) on delete set null,
  message text not null check (char_length(message) between 1 and 280),
  update_type text not null default 'vendor' check (update_type in ('system', 'vendor')),
  created_at timestamptz not null default now()
);

create index if not exists order_updates_order_id_created_at_idx on public.order_updates(order_id, created_at desc);
alter table public.order_updates enable row level security;
