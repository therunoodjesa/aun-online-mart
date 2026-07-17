-- Clear Sholly's Restaurant test commerce history before ownership handover.
-- The vendor record, catalogue, schedule, settings, and owner account are preserved.
-- Mixed-vendor orders are retained for the other vendors; only Sholly's line items
-- are removed from those orders.
do $$
declare
  sholly_vendor_id uuid;
  sholly_only_order_ids uuid[] := '{}';
begin
  select id
    into sholly_vendor_id
  from public.vendors
  where lower(name) = lower('Sholly''s Restaurant')
  order by created_at asc
  limit 1;

  if sholly_vendor_id is null then
    raise exception 'Sholly''s Restaurant vendor record was not found; no data was changed.';
  end if;

  -- Entire orders can be removed only when every item belongs to Sholly's catalogue.
  select coalesce(array_agg(order_id), '{}')
    into sholly_only_order_ids
  from (
    select oi.order_id
    from public.order_items oi
    join public.products p on p.id = oi.product_id
    group by oi.order_id
    having bool_or(p.vendor_id = sholly_vendor_id)
       and bool_and(p.vendor_id = sholly_vendor_id)
  ) sholly_only_orders;

  -- Remove Sholly's operational records, including alerts that may belong to a
  -- mixed-vendor order.
  delete from public.vendor_payout_requests
  where vendor_id = sholly_vendor_id;

  delete from public.vendor_order_alerts
  where vendor_id = sholly_vendor_id;

  delete from public.order_updates
  where vendor_id = sholly_vendor_id;

  -- For mixed-vendor orders, detach Sholly's lines so they no longer appear in
  -- Sholly's workspace but the other vendor's sale remains untouched.
  delete from public.order_items oi
  using public.products p
  where oi.product_id = p.id
    and p.vendor_id = sholly_vendor_id
    and not (oi.order_id = any(sholly_only_order_ids));

  -- Payment records are deleted before their orders so no orphan test intent is
  -- left behind. Deleting orders cascades their items, receipts, and tracking
  -- updates.
  delete from public.payment_intents
  where order_id = any(sholly_only_order_ids);

  delete from public.orders
  where id = any(sholly_only_order_ids);
end;
$$;
