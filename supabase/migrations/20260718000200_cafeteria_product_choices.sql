create table if not exists public.cafeteria_product_options (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.cafeteria_products(id) on delete cascade,
  option_group text not null,
  name text not null,
  price_modifier numeric(12,2) not null default 0,
  is_available boolean not null default true,
  selection_mode text not null default 'single' check (selection_mode in ('single')),
  created_at timestamptz not null default now()
);

create index if not exists cafeteria_product_options_product_idx
  on public.cafeteria_product_options(product_id, option_group);

alter table public.cafeteria_product_options enable row level security;

create policy "Anyone can view cafeteria product choices"
on public.cafeteria_product_options for select
using (true);

create policy "Cafeteria managers manage product choices"
on public.cafeteria_product_options for all to authenticated
using (
  exists (
    select 1 from public.cafeteria_staff staff
    where staff.user_id = auth.uid() and staff.role = 'manager' and staff.is_active = true
  )
)
with check (
  exists (
    select 1 from public.cafeteria_staff staff
    where staff.user_id = auth.uid() and staff.role = 'manager' and staff.is_active = true
  )
);
