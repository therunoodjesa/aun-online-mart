-- Vendor-managed catalogue stock. NULL is retained for older products until a
-- vendor sets a quantity; zero always means the product is sold out.
alter table public.products
  add column if not exists stock_quantity integer;

alter table public.products
  drop constraint if exists products_stock_quantity_check;

alter table public.products
  add constraint products_stock_quantity_check
  check (stock_quantity is null or stock_quantity >= 0);

alter table public.orders
  add column if not exists stock_deducted_at timestamptz;

create or replace function public.sync_product_stock_status()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.stock_quantity is null then
    return new;
  end if;

  if new.stock_quantity = 0 and new.status <> 'hidden' then
    new.status := 'sold_out';
  elsif tg_op = 'UPDATE'
    and old.stock_quantity = 0
    and new.stock_quantity > 0
    and old.status = 'sold_out' then
    new.status := 'available';
  end if;
  return new;
end;
$$;

drop trigger if exists products_sync_stock_status on public.products;
create trigger products_sync_stock_status
before insert or update of stock_quantity on public.products
for each row execute function public.sync_product_stock_status();

-- Stock is deducted only after a payment becomes paid. This keeps bank
-- transfers pending until an administrator approves them, and prevents a
-- Paystack callback/webhook retry from deducting the same stock twice.
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
    where order_id = new.id
    group by product_id
  loop
    select id, stock_quantity, status
    into product_row
    from public.products
    where id = line.product_id
    for update;

    if not found or product_row.status <> 'available' then
      raise exception 'One or more products are no longer available.';
    end if;

    if product_row.stock_quantity is not null then
      if product_row.stock_quantity < line.quantity then
        raise exception 'Insufficient stock for a product in this order.';
      end if;

      update public.products
      set stock_quantity = stock_quantity - line.quantity,
          status = case when stock_quantity - line.quantity = 0 then 'sold_out' else status end
      where id = product_row.id;
    end if;
  end loop;

  update public.orders
  set stock_deducted_at = now()
  where id = new.id
    and stock_deducted_at is null;
  return new;
end;
$$;

drop trigger if exists orders_deduct_paid_stock on public.orders;
create trigger orders_deduct_paid_stock
after update of payment_status on public.orders
for each row execute function public.deduct_stock_for_paid_order();

comment on column public.products.stock_quantity is
  'Vendor-managed stock. A value of zero automatically marks the product sold out; NULL means stock has not been entered yet.';

