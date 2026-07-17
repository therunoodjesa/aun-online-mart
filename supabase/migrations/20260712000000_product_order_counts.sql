-- Purchased line items support fulfilment and live product-order counts.
create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  product_name text not null,
  unit_price numeric not null check (unit_price >= 0),
  quantity integer not null check (quantity > 0),
  total_price numeric not null check (total_price >= 0),
  options jsonb not null default '[]'::jsonb,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists order_items_product_id_idx on public.order_items(product_id);
create index if not exists order_items_order_id_idx on public.order_items(order_id);

alter table public.order_items enable row level security;

create or replace function public.get_product_order_count(p_product_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(distinct oi.order_id)::integer
  from public.order_items oi
  join public.orders o on o.id = oi.order_id
  where oi.product_id = p_product_id
    and (o.payment_status = 'paid' or o.status = 'delivered');
$$;

grant execute on function public.get_product_order_count(uuid) to anon, authenticated;
