-- Return paid cafeteria orders as one authorised, fully assembled feed. This
-- avoids client-side joins being affected by separate RLS checks or timing.
create or replace function public.get_cafeteria_operations_orders()
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  result jsonb;
begin
  if not exists (
    select 1 from public.cafeteria_staff
    where user_id = auth.uid() and is_active
  ) then
    raise exception 'Your account does not have active cafeteria access.';
  end if;

  select coalesce(jsonb_agg(to_jsonb(order_feed) order by order_feed.created_at desc), '[]'::jsonb)
  into result
  from (
    select
      customer_order.id,
      customer_order.order_number,
      customer_order.status,
      customer_order.payment_status,
      customer_order.total,
      customer_order.delivery_address,
      customer_order.delivery_instructions,
      customer_order.delivery_slot,
      customer_order.delivery_type,
      customer_order.rider_id,
      customer_order.rider_name,
      customer_order.rider_phone,
      customer_order.rider_assigned_at,
      customer_order.dispatch_status,
      customer_order.created_at,
      jsonb_agg(
        jsonb_build_object(
          'id', item.id,
          'order_id', item.order_id,
          'product_name', item.product_name,
          'quantity', item.quantity,
          'unit_price', item.unit_price,
          'options', item.options,
          'notes', item.notes,
          'meal_plan_credit', item.meal_plan_credit,
          'packaging_fee', item.packaging_fee
        ) order by item.created_at
      ) as items
    from public.orders customer_order
    join public.cafeteria_order_items item on item.order_id = customer_order.id
    where customer_order.payment_status = 'paid'
    group by customer_order.id
  ) order_feed;

  return result;
end;
$$;

revoke all on function public.get_cafeteria_operations_orders() from public;
grant execute on function public.get_cafeteria_operations_orders() to authenticated;
