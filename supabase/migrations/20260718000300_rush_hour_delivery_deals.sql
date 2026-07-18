-- Central settings for the automated marketplace rush-hour delivery deal.
create table if not exists public.delivery_pricing_rules (
  id boolean primary key default true check (id),
  rush_hour_enabled boolean not null default true,
  qualifying_order_threshold integer not null default 5 check (qualifying_order_threshold > 0),
  rolling_window_minutes integer not null default 60 check (rolling_window_minutes between 15 and 240),
  standard_marketplace_delivery_fee numeric(12,2) not null default 2500 check (standard_marketplace_delivery_fee >= 0),
  rush_hour_marketplace_delivery_fee numeric(12,2) not null default 1000 check (rush_hour_marketplace_delivery_fee >= 0),
  updated_at timestamptz not null default now()
);

insert into public.delivery_pricing_rules (id)
values (true)
on conflict (id) do nothing;

alter table public.orders
  add column if not exists delivery_fee numeric(12,2) not null default 0,
  add column if not exists rush_hour_discount numeric(12,2) not null default 0;

-- Returns the live paid-order activity for a delivery slot. It counts only
-- marketplace products, so supermarket, cafeteria and pickup activity cannot
-- accidentally activate the promotion.
create or replace function public.get_marketplace_rush_hour_activity(p_delivery_slot text default null)
returns table (
  is_enabled boolean,
  qualifying_orders integer,
  qualifying_threshold integer,
  standard_delivery_fee numeric,
  rush_delivery_fee numeric
)
language sql
security definer
set search_path = public
as $$
  with rules as (
    select * from public.delivery_pricing_rules where id = true
  ), activity as (
    select count(*)::integer as order_count
    from public.orders orders
    cross join rules
    where orders.payment_status = 'paid'
      and orders.delivery_type = 'delivery'
      and orders.created_at >= now() - make_interval(mins => rules.rolling_window_minutes)
      and (p_delivery_slot is null or orders.delivery_slot = p_delivery_slot)
      and exists (
        select 1
        from public.order_items items
        join public.products products on products.id = items.product_id
        where items.order_id = orders.id
          and products.marketplace_category is not null
      )
  )
  select rules.rush_hour_enabled,
         activity.order_count,
         rules.qualifying_order_threshold,
         rules.standard_marketplace_delivery_fee,
         rules.rush_hour_marketplace_delivery_fee
  from rules cross join activity;
$$;

revoke all on function public.get_marketplace_rush_hour_activity(text) from public;
grant execute on function public.get_marketplace_rush_hour_activity(text) to service_role;
