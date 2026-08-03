-- Buyer profile statistics should be based on the verified payments and saved
-- favourites that belong to the signed-in customer.  Some early checkout
-- records were created before orders.user_id was consistently populated, so
-- safely repair orders that can be linked through their payment intent.

update public.orders as customer_order
set user_id = payment.user_id
from public.payment_intents as payment
where customer_order.user_id is null
  and payment.user_id is not null
  and (
    payment.order_id = customer_order.id
    or (
      customer_order.payment_reference is not null
      and customer_order.payment_reference = payment.reference
    )
  );

create or replace function public.get_buyer_profile_activity()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with paid_orders as (
    select
      customer_order.id,
      max(coalesce(customer_order.total, customer_order.amount_paid, payment.amount_kobo / 100.0, 0)) as total
    from public.orders as customer_order
    left join public.payment_intents as payment
      on payment.order_id = customer_order.id
      and payment.user_id = auth.uid()
      and payment.status = 'paid'
    where customer_order.user_id = auth.uid()
      and (customer_order.payment_status = 'paid' or payment.id is not null)
    group by customer_order.id
  )
  select jsonb_build_object(
    'orders_placed', (select count(*) from paid_orders),
    'amount_spent', (select coalesce(sum(total), 0) from paid_orders),
    'favourites', (select count(*) from public.favourites where user_id = auth.uid())
  );
$$;

revoke all on function public.get_buyer_profile_activity() from public;
grant execute on function public.get_buyer_profile_activity() to authenticated;
