alter table public.payment_intents
  add column if not exists delivery_instructions text;

alter table public.orders
  add column if not exists delivery_instructions text;

create or replace function public.deduct_stock_for_paid_order()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  line record;
  product_row record;
begin
  if new.payment_status <> 'paid'
    or old.payment_status = 'paid'
    or new.stock_deducted_at is not null then
    return new;
  end if;

  for line in
    select product_id, sum(quantity)::integer as quantity
    from public.order_items
    where order_id = new.id and product_id is not null
    group by product_id
  loop
    select id, stock_quantity, status into product_row
    from public.products where id = line.product_id for update;

    if not found or product_row.status <> 'available' then
      raise exception 'One or more marketplace products are no longer available.';
    end if;
    if product_row.stock_quantity is not null then
      if product_row.stock_quantity < line.quantity then
        raise exception 'There is not enough marketplace stock for this order.';
      end if;
      update public.products
      set stock_quantity = stock_quantity - line.quantity,
          status = case when stock_quantity - line.quantity = 0 then 'sold_out' else status end
      where id = product_row.id;
    end if;
  end loop;

  update public.orders set stock_deducted_at = now()
  where id = new.id and stock_deducted_at is null;
  return new;
end;
$$;

comment on column public.orders.delivery_instructions is
  'Customer-provided room number, landmark or delivery directions.';
