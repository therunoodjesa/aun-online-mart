-- A payment intent is created before checkout. An order only exists after the
-- server has verified a successful Paystack transaction.
create table if not exists public.payment_intents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  reference text not null unique,
  amount_kobo bigint not null check (amount_kobo > 0),
  currency text not null default 'NGN',
  status text not null default 'initialized' check (status in ('initialized', 'pending', 'paid', 'failed', 'abandoned', 'refunded')),
  payment_channel text not null default 'paystack',
  fulfilment text not null check (fulfilment in ('delivery', 'pickup')),
  delivery_address text,
  delivery_slot text,
  cart jsonb not null,
  order_id uuid references public.orders(id) on delete set null,
  paystack_transaction_id bigint,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.orders
  add column if not exists user_id uuid references auth.users(id) on delete set null,
  add column if not exists payment_status text not null default 'pending',
  add column if not exists payment_reference text unique,
  add column if not exists amount_paid numeric,
  add column if not exists delivery_address text,
  add column if not exists delivery_slot text;

create index if not exists payment_intents_user_id_created_at_idx on public.payment_intents(user_id, created_at desc);
create index if not exists payment_intents_reference_idx on public.payment_intents(reference);

alter table public.payment_intents enable row level security;

drop policy if exists "Customers can view their payment intents" on public.payment_intents;
create policy "Customers can view their payment intents"
on public.payment_intents for select to authenticated
using (user_id = auth.uid());

drop policy if exists "Customers can view their own orders" on public.orders;
create policy "Customers can view their own orders"
on public.orders for select to authenticated
using (user_id = auth.uid());

drop policy if exists "Customers can view their own order items" on public.order_items;
create policy "Customers can view their own order items"
on public.order_items for select to authenticated
using (exists (select 1 from public.orders o where o.id = order_items.order_id and o.user_id = auth.uid()));

drop policy if exists "Customers can view their own order updates" on public.order_updates;
create policy "Customers can view their own order updates"
on public.order_updates for select to authenticated
using (exists (select 1 from public.orders o where o.id = order_updates.order_id and o.user_id = auth.uid()));
