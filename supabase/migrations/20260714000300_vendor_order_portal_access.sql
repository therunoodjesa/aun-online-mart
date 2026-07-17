-- Allows a vendor to see only orders that contain one of their products,
-- together with the relevant purchased line items and tracking updates.
create or replace function public.vendor_has_order(p_order_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.order_items oi
    join public.products p on p.id = oi.product_id
    join public.vendors v on v.id = p.vendor_id
    where oi.order_id = p_order_id
      and v.owner_id = auth.uid()
  );
$$;

grant execute on function public.vendor_has_order(uuid) to authenticated;

alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.order_updates enable row level security;

drop policy if exists "Vendors can view their order line items" on public.order_items;
create policy "Vendors can view their order line items"
on public.order_items for select to authenticated
using (
  exists (
    select 1 from public.products p
    join public.vendors v on v.id = p.vendor_id
    where p.id = order_items.product_id and v.owner_id = auth.uid()
  )
);

drop policy if exists "Vendors can view their orders" on public.orders;
create policy "Vendors can view their orders"
on public.orders for select to authenticated
using (public.vendor_has_order(id));

drop policy if exists "Vendors can update their orders" on public.orders;
create policy "Vendors can update their orders"
on public.orders for update to authenticated
using (public.vendor_has_order(id))
with check (public.vendor_has_order(id));

drop policy if exists "Vendors can view updates for their orders" on public.order_updates;
create policy "Vendors can view updates for their orders"
on public.order_updates for select to authenticated
using (public.vendor_has_order(order_id));

drop policy if exists "Vendors can send order updates" on public.order_updates;
create policy "Vendors can send order updates"
on public.order_updates for insert to authenticated
with check (
  public.vendor_has_order(order_id)
  and exists (select 1 from public.vendors v where v.id = vendor_id and v.owner_id = auth.uid())
);
