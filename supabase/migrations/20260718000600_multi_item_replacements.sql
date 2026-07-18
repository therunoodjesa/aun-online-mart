-- A customer may replace an unavailable vendor order with more than one suggested item,
-- provided the replacement total stays within the original value for that vendor's items.
alter table public.order_rejection_requests
  add column if not exists replacement_budget numeric(12,2),
  add column if not exists selected_products jsonb not null default '[]'::jsonb,
  add column if not exists selected_subtotal numeric(12,2),
  add column if not exists refund_amount numeric(12,2) not null default 0;

-- Make currently-open requests usable under the new rule too.
update public.order_rejection_requests request
set replacement_budget = totals.vendor_subtotal
from (
  select request_row.id, coalesce(sum(item.total_price), 0) as vendor_subtotal
  from public.order_rejection_requests request_row
  join public.order_items item on item.order_id = request_row.order_id
  join public.products product on product.id = item.product_id
  where product.vendor_id = request_row.vendor_id
  group by request_row.id
) totals
where request.id = totals.id
  and request.replacement_budget is null;
