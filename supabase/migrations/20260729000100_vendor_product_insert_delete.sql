-- Let a linked vendor create and remove only products belonging to their store.
-- Existing update/select policies remain in 20260714000200_vendor_portal_access.sql.
alter table public.products enable row level security;

drop policy if exists "Vendors can insert products for their own store" on public.products;
create policy "Vendors can insert products for their own store"
on public.products for insert to authenticated
with check (
  exists (
    select 1
    from public.vendors v
    where v.id = products.vendor_id
      and v.owner_id = auth.uid()
  )
);

drop policy if exists "Vendors can delete products from their own store" on public.products;
create policy "Vendors can delete products from their own store"
on public.products for delete to authenticated
using (
  exists (
    select 1
    from public.vendors v
    where v.id = products.vendor_id
      and v.owner_id = auth.uid()
  )
);
