-- A cafeteria item may be served in more than one service period, for example
-- both lunch and dinner. Keep the legacy category column populated for older
-- clients while new clients use this array for filtering.
alter table public.cafeteria_products
  add column if not exists categories text[];

update public.cafeteria_products
set categories = array[category]
where categories is null and category is not null;

alter table public.cafeteria_products
  alter column categories set default array['lunch']::text[];

create index if not exists cafeteria_products_categories_status_idx
  on public.cafeteria_products using gin (categories);

-- Store owners control their own catalogue placement. Existing menus retain a
-- stable oldest-to-newest order until a manager changes it from their portal.
alter table public.products
  add column if not exists sort_order integer;

alter table public.cafeteria_products
  add column if not exists sort_order integer;

with ranked_products as (
  select id, row_number() over (partition by vendor_id order by created_at asc, id asc) as position
  from public.products
  where sort_order is null
)
update public.products product
set sort_order = ranked_products.position
from ranked_products
where product.id = ranked_products.id;

with ranked_products as (
  select id, row_number() over (order by created_at asc, id asc) as position
  from public.cafeteria_products
  where sort_order is null
)
update public.cafeteria_products product
set sort_order = ranked_products.position
from ranked_products
where product.id = ranked_products.id;

create index if not exists products_vendor_sort_order_idx
  on public.products (vendor_id, sort_order);

create index if not exists cafeteria_products_sort_order_idx
  on public.cafeteria_products (sort_order);

-- One centrally managed promotion powers Today's Pick on the buyer home page.
create table if not exists public.home_promotions (
  id boolean primary key default true check (id),
  heading text not null default 'TODAY''S PICK',
  message text not null default 'Sholly''s jollof is extra smoky today.',
  background_image_url text,
  background_color text not null default '#01193D',
  cta_label text not null default 'ORDER NOW',
  cta_href text not null default '/(buyer)/marketplace/category/meals',
  updated_at timestamptz not null default now()
);

insert into public.home_promotions (id)
values (true)
on conflict (id) do nothing;

alter table public.home_promotions enable row level security;

drop policy if exists "Anyone can view the active home promotion" on public.home_promotions;
create policy "Anyone can view the active home promotion"
on public.home_promotions for select
using (true);

comment on table public.home_promotions is
  'Single admin-managed Today''s Pick promotion for the buyer home screen.';

-- Vendors can upload their own product photos into an isolated folder within
-- the existing public product-images bucket.
drop policy if exists "Vendors can upload their product images" on storage.objects;
create policy "Vendors can upload their product images"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'product-images'
  and (storage.foldername(name))[1] = 'vendors'
  and (storage.foldername(name))[2] = auth.uid()::text
  and exists (select 1 from public.vendors vendor where vendor.owner_id = auth.uid())
);
