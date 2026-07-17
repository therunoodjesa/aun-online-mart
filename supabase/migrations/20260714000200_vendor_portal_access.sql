-- Each live store is assigned to exactly one vendor account.
alter table public.vendors add column if not exists owner_id uuid references auth.users(id) on delete set null;
create unique index if not exists vendors_owner_id_unique on public.vendors(owner_id) where owner_id is not null;

alter table public.vendors enable row level security;
alter table public.products enable row level security;

drop policy if exists "Vendors can manage their own store" on public.vendors;
create policy "Vendors can manage their own store"
on public.vendors for update to authenticated
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

drop policy if exists "Vendors can view their own store" on public.vendors;
create policy "Vendors can view their own store"
on public.vendors for select to authenticated
using (owner_id = auth.uid());

drop policy if exists "Vendors can view their own products" on public.products;
create policy "Vendors can view their own products"
on public.products for select to authenticated
using (exists (select 1 from public.vendors v where v.id = products.vendor_id and v.owner_id = auth.uid()));

drop policy if exists "Vendors can update their own products" on public.products;
create policy "Vendors can update their own products"
on public.products for update to authenticated
using (exists (select 1 from public.vendors v where v.id = products.vendor_id and v.owner_id = auth.uid()))
with check (exists (select 1 from public.vendors v where v.id = products.vendor_id and v.owner_id = auth.uid()));
