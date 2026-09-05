create table if not exists public.product_ratings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid references public.products(id) on delete cascade,
  cafeteria_product_id uuid references public.cafeteria_products(id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (num_nonnulls(product_id, cafeteria_product_id) = 1)
);

create unique index if not exists product_ratings_user_product_idx on public.product_ratings(user_id, product_id) where product_id is not null;
create unique index if not exists product_ratings_user_cafeteria_idx on public.product_ratings(user_id, cafeteria_product_id) where cafeteria_product_id is not null;
create index if not exists product_ratings_product_idx on public.product_ratings(product_id) where product_id is not null;
create index if not exists product_ratings_cafeteria_idx on public.product_ratings(cafeteria_product_id) where cafeteria_product_id is not null;

alter table public.product_ratings enable row level security;
drop policy if exists "Customers read product ratings" on public.product_ratings;
create policy "Customers read product ratings" on public.product_ratings for select using (true);

create or replace function public.product_catalogue_stats(p_product_id uuid)
returns table(order_count integer, average_rating numeric, rating_count integer)
language sql stable security definer set search_path = public as $$
  select coalesce((select count(distinct oi.order_id)::integer from public.order_items oi join public.orders o on o.id = oi.order_id where oi.product_id = p_product_id and o.payment_status = 'paid'), 0),
    coalesce((select round(avg(pr.rating)::numeric, 1) from public.product_ratings pr where pr.product_id = p_product_id), 0),
    coalesce((select count(*)::integer from public.product_ratings pr where pr.product_id = p_product_id), 0);
$$;

create or replace function public.cafeteria_catalogue_stats(p_product_id uuid)
returns table(order_count integer, average_rating numeric, rating_count integer)
language sql stable security definer set search_path = public as $$
  select coalesce((select count(distinct oi.order_id)::integer from public.cafeteria_order_items oi join public.orders o on o.id = oi.order_id where oi.product_id = p_product_id and o.payment_status = 'paid'), 0),
    coalesce((select round(avg(pr.rating)::numeric, 1) from public.product_ratings pr where pr.cafeteria_product_id = p_product_id), 0),
    coalesce((select count(*)::integer from public.product_ratings pr where pr.cafeteria_product_id = p_product_id), 0);
$$;

grant execute on function public.product_catalogue_stats(uuid), public.cafeteria_catalogue_stats(uuid) to anon, authenticated;

create or replace function public.product_recommendations(p_product_id uuid, p_limit integer default 8)
returns table(product_id uuid)
language sql stable security definer set search_path = public as $$
  with current_product as (select vendor_id, category from public.products where id = p_product_id),
  ranked as (
    select p.id, count(distinct o.id) filter (where o.payment_status = 'paid') as paid_orders
    from public.products p
    join current_product c on (p.vendor_id = c.vendor_id or (c.category is not null and p.category = c.category))
    left join public.order_items oi on oi.product_id = p.id
    left join public.orders o on o.id = oi.order_id
    where p.id <> p_product_id and p.status = 'available'
    group by p.id
  ) select id from ranked order by paid_orders desc, random() limit greatest(1, least(p_limit, 12));
$$;

create or replace function public.cafeteria_recommendations(p_product_id uuid, p_limit integer default 8)
returns table(product_id uuid)
language sql stable security definer set search_path = public as $$
  with current_product as (select category from public.cafeteria_products where id = p_product_id),
  ranked as (
    select p.id, count(distinct o.id) filter (where o.payment_status = 'paid') as paid_orders
    from public.cafeteria_products p
    join current_product c on p.category = c.category
    left join public.cafeteria_order_items oi on oi.product_id = p.id
    left join public.orders o on o.id = oi.order_id
    where p.id <> p_product_id and p.status = 'available'
    group by p.id
  ) select id from ranked order by paid_orders desc, random() limit greatest(1, least(p_limit, 12));
$$;
grant execute on function public.product_recommendations(uuid, integer), public.cafeteria_recommendations(uuid, integer) to anon, authenticated;
