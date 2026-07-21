-- Keep the kind of business on the vendor record, not only on its application.
-- This prevents service providers from being treated as Marketplace stores.
alter table public.vendors
  add column if not exists store_type text;

alter table public.vendors
  drop constraint if exists vendors_store_type_check;

alter table public.vendors
  add constraint vendors_store_type_check
  check (store_type is null or store_type in ('marketplace', 'supermarket', 'service'));

update public.vendors as vendor
set store_type = application.store_type
from public.vendor_applications as application
where application.user_id = vendor.owner_id
  and application.status = 'approved'
  and application.store_type in ('marketplace', 'supermarket', 'service');

-- The service catalogue belongs to a service-provider vendor. The nullable
-- fields preserve any earlier manually-created service records.
alter table public.services
  add column if not exists vendor_id uuid references public.vendors(id) on delete cascade,
  add column if not exists name text,
  add column if not exists category text,
  add column if not exists description text,
  add column if not exists starting_price numeric,
  add column if not exists image_url text,
  add column if not exists duration_minutes integer,
  add column if not exists is_available boolean not null default true,
  add column if not exists sort_order integer not null default 0,
  add column if not exists updated_at timestamptz not null default now();

create table if not exists public.service_options (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.services(id) on delete cascade,
  name text not null,
  price numeric not null check (price >= 0),
  duration_minutes integer,
  is_available boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists services_vendor_placement_idx
  on public.services (vendor_id, sort_order, name);
create index if not exists service_options_service_placement_idx
  on public.service_options (service_id, sort_order, name);

alter table public.services enable row level security;
alter table public.service_options enable row level security;

drop policy if exists "Public can read available services" on public.services;
create policy "Public can read available services"
on public.services for select
using (
  is_available = true
  or exists (
    select 1 from public.vendors
    where vendors.id = services.vendor_id and vendors.owner_id = auth.uid()
  )
);

drop policy if exists "Service vendors manage own services" on public.services;
create policy "Service vendors manage own services"
on public.services for all
using (
  exists (
    select 1 from public.vendors
    where vendors.id = services.vendor_id and vendors.owner_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.vendors
    where vendors.id = services.vendor_id and vendors.owner_id = auth.uid()
  )
);

drop policy if exists "Public can read available service options" on public.service_options;
create policy "Public can read available service options"
on public.service_options for select
using (
  is_available = true
  or exists (
    select 1 from public.services
    join public.vendors on vendors.id = services.vendor_id
    where services.id = service_options.service_id and vendors.owner_id = auth.uid()
  )
);

drop policy if exists "Service vendors manage own service options" on public.service_options;
create policy "Service vendors manage own service options"
on public.service_options for all
using (
  exists (
    select 1 from public.services
    join public.vendors on vendors.id = services.vendor_id
    where services.id = service_options.service_id and vendors.owner_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.services
    join public.vendors on vendors.id = services.vendor_id
    where services.id = service_options.service_id and vendors.owner_id = auth.uid()
  )
);

create or replace function public.link_approved_vendor_application()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'approved' and old.status is distinct from 'approved' then
    insert into public.vendors (name, owner_id, pickup_location, category, store_type, is_approved)
    values (new.store_name, new.user_id, new.pickup_location, new.category, new.store_type, true)
    on conflict (owner_id) where owner_id is not null
    do update set
      name = excluded.name,
      category = excluded.category,
      store_type = excluded.store_type,
      is_approved = true,
      pickup_location = coalesce(excluded.pickup_location, public.vendors.pickup_location);
    new.reviewed_at = coalesce(new.reviewed_at, now());
  end if;
  new.updated_at = now();
  return new;
end;
$$;
