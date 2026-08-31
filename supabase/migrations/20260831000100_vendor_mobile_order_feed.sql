-- A single, authorised vendor order feed. This avoids relying on separate
-- browser-side reads of products, order_items and orders, which can be
-- evaluated at different times on installed mobile web apps.
create or replace function public.get_vendor_orders(p_vendor_id uuid)
returns table (
  id uuid,
  order_number text,
  status text,
  delivery_type text,
  created_at timestamptz,
  items jsonb,
  replacement jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  select
    customer_order.id,
    customer_order.order_number,
    customer_order.status::text,
    customer_order.delivery_type::text,
    customer_order.created_at,
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'product_name', item.product_name,
          'quantity', item.quantity,
          'unit_price', item.unit_price,
          'notes', item.notes
        ) order by item.id
      ) filter (where item.id is not null),
      '[]'::jsonb
    ) as items,
    case when replacement_request.id is null then null else jsonb_build_object(
      'status', replacement_request.status,
      'selected_product_name', replacement_request.selected_product_name,
      'selected_subtotal', replacement_request.selected_subtotal,
      'refund_amount', replacement_request.refund_amount
    ) end as replacement
  from public.vendors vendor
  join public.products product on product.vendor_id = vendor.id
  join public.order_items item on item.product_id = product.id
  join public.orders customer_order on customer_order.id = item.order_id
  left join public.order_rejection_requests replacement_request on replacement_request.order_id = customer_order.id
  where vendor.id = p_vendor_id
    and vendor.owner_id = auth.uid()
    and customer_order.payment_status = 'paid'
  group by
    customer_order.id,
    customer_order.order_number,
    customer_order.status,
    customer_order.delivery_type,
    customer_order.created_at,
    replacement_request.id,
    replacement_request.status,
    replacement_request.selected_product_name,
    replacement_request.selected_subtotal,
    replacement_request.refund_amount
  order by customer_order.created_at desc;
$$;

revoke all on function public.get_vendor_orders(uuid) from public;
grant execute on function public.get_vendor_orders(uuid) to authenticated;
