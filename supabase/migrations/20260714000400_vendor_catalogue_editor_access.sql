-- Let a vendor manage options only for products in their own catalogue.
alter table public.product_options enable row level security;

drop policy if exists "Vendors can manage options for their products" on public.product_options;
create policy "Vendors can manage options for their products"
on public.product_options for all to authenticated
using (
  exists (
    select 1 from public.products p
    join public.vendors v on v.id = p.vendor_id
    where p.id = product_options.product_id and v.owner_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.products p
    join public.vendors v on v.id = p.vendor_id
    where p.id = product_options.product_id and v.owner_id = auth.uid()
  )
);
