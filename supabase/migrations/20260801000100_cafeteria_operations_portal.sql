-- Complete the cafeteria operations workspace without treating the cafeteria as a vendor.
-- Customer checkout can attach cafeteria lines to the existing orders table through
-- cafeteria_order_items, so buyer tracking and AOM administration remain shared.

alter table public.cafeteria_products
  add column if not exists stock_quantity integer;

alter table public.cafeteria_products
  drop constraint if exists cafeteria_products_stock_quantity_check;

alter table public.cafeteria_products
  add constraint cafeteria_products_stock_quantity_check
  check (stock_quantity is null or stock_quantity >= 0);

create or replace function public.sync_cafeteria_product_stock_status()
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
  elsif tg_op = 'UPDATE' and old.stock_quantity = 0 and new.stock_quantity > 0 and old.status = 'sold_out' then
    new.status := 'available';
  end if;
  return new;
end;
$$;

drop trigger if exists cafeteria_products_sync_stock_status on public.cafeteria_products;
create trigger cafeteria_products_sync_stock_status
before insert or update of stock_quantity on public.cafeteria_products
for each row execute function public.sync_cafeteria_product_stock_status();

create table if not exists public.cafeteria_settings (
  id boolean primary key default true check (id),
  is_accepting_orders boolean not null default true,
  snacks_open boolean not null default true,
  lunch_open boolean not null default true,
  dinner_open boolean not null default true,
  customer_notice text,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.cafeteria_settings (id)
values (true)
on conflict (id) do nothing;

create table if not exists public.cafeteria_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.cafeteria_products(id) on delete set null,
  product_name text not null,
  quantity integer not null default 1 check (quantity > 0),
  unit_price numeric(12,2) not null default 0 check (unit_price >= 0),
  options jsonb not null default '[]'::jsonb,
  notes text,
  meal_plan_credit numeric(12,2) not null default 0 check (meal_plan_credit >= 0),
  packaging_fee numeric(12,2) not null default 0 check (packaging_fee >= 0),
  created_at timestamptz not null default now()
);

create index if not exists cafeteria_order_items_order_idx
  on public.cafeteria_order_items(order_id);
create index if not exists cafeteria_order_items_product_idx
  on public.cafeteria_order_items(product_id);

alter table public.orders
  add column if not exists cafeteria_processed_at timestamptz;

create or replace function public.process_paid_cafeteria_order()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  line record;
  product_row record;
  total_credit numeric := 0;
  plans_used integer := 0;
  today_wat date := (now() at time zone 'Africa/Lagos')::date;
begin
  if new.payment_status <> 'paid' or old.payment_status = 'paid' or new.cafeteria_processed_at is not null then
    return new;
  end if;
  if not exists (select 1 from public.cafeteria_order_items where order_id = new.id) then
    return new;
  end if;

  for line in
    select product_id, sum(quantity)::integer as quantity
    from public.cafeteria_order_items
    where order_id = new.id and product_id is not null
    group by product_id
  loop
    select id, name, stock_quantity, status into product_row
    from public.cafeteria_products
    where id = line.product_id
    for update;
    if not found or product_row.status <> 'available' then
      raise exception 'A cafeteria item is no longer available.';
    end if;
    if product_row.stock_quantity is not null then
      if product_row.stock_quantity < line.quantity then
        raise exception 'There is not enough stock for %.', product_row.name;
      end if;
      update public.cafeteria_products
      set stock_quantity = stock_quantity - line.quantity,
          status = case when stock_quantity - line.quantity = 0 then 'sold_out' else status end
      where id = product_row.id;
    end if;
  end loop;

  select coalesce(sum(meal_plan_credit), 0) into total_credit
  from public.cafeteria_order_items where order_id = new.id;
  if total_credit > 0 and new.user_id is not null then
    plans_used := ceil(total_credit / 1800.0)::integer;
    update public.meal_plan_accounts
    set meals_used_today = case when last_used_on = today_wat then meals_used_today + plans_used else plans_used end,
        last_used_on = today_wat,
        updated_at = now()
    where user_id = new.user_id;
  end if;

  update public.orders set cafeteria_processed_at = now() where id = new.id;
  return new;
end;
$$;

drop trigger if exists orders_process_paid_cafeteria on public.orders;
create trigger orders_process_paid_cafeteria
after update of payment_status on public.orders
for each row execute function public.process_paid_cafeteria_order();

alter table public.cafeteria_settings enable row level security;
alter table public.cafeteria_order_items enable row level security;

drop policy if exists "Active cafeteria staff can view settings" on public.cafeteria_settings;
create policy "Active cafeteria staff can view settings"
on public.cafeteria_settings for select to authenticated
using (exists (
  select 1 from public.cafeteria_staff staff
  where staff.user_id = auth.uid() and staff.is_active
));

drop policy if exists "Authenticated customers can view cafeteria settings" on public.cafeteria_settings;
create policy "Authenticated customers can view cafeteria settings"
on public.cafeteria_settings for select to authenticated
using (true);

drop policy if exists "Cafeteria managers can update settings" on public.cafeteria_settings;
create policy "Cafeteria managers can update settings"
on public.cafeteria_settings for update to authenticated
using (exists (
  select 1 from public.cafeteria_staff staff
  where staff.user_id = auth.uid() and staff.is_active and staff.role = 'manager'
))
with check (exists (
  select 1 from public.cafeteria_staff staff
  where staff.user_id = auth.uid() and staff.is_active and staff.role = 'manager'
));

drop policy if exists "Active cafeteria staff can view cafeteria order items" on public.cafeteria_order_items;
create policy "Active cafeteria staff can view cafeteria order items"
on public.cafeteria_order_items for select to authenticated
using (exists (
  select 1 from public.cafeteria_staff staff
  where staff.user_id = auth.uid() and staff.is_active
));

drop policy if exists "Buyers can view their cafeteria order items" on public.cafeteria_order_items;
create policy "Buyers can view their cafeteria order items"
on public.cafeteria_order_items for select to authenticated
using (exists (
  select 1 from public.orders customer_order
  where customer_order.id = order_id and customer_order.user_id = auth.uid()
));

drop policy if exists "Active cafeteria staff can view cafeteria orders" on public.orders;
create policy "Active cafeteria staff can view cafeteria orders"
on public.orders for select to authenticated
using (
  exists (
    select 1 from public.cafeteria_staff staff
    where staff.user_id = auth.uid() and staff.is_active
  )
  and exists (
    select 1 from public.cafeteria_order_items item
    where item.order_id = orders.id
  )
);

drop policy if exists "Active cafeteria staff can view cafeteria updates" on public.order_updates;
create policy "Active cafeteria staff can view cafeteria updates"
on public.order_updates for select to authenticated
using (
  exists (
    select 1 from public.cafeteria_staff staff
    where staff.user_id = auth.uid() and staff.is_active
  )
  and exists (
    select 1 from public.cafeteria_order_items item
    where item.order_id = order_updates.order_id
  )
);

create or replace function public.update_cafeteria_order_status(
  p_order_id uuid,
  p_status text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_current text;
  v_user_id uuid;
  v_order_number text;
  v_message text;
begin
  select role into v_role
  from public.cafeteria_staff
  where user_id = auth.uid() and is_active
  limit 1;

  if v_role is null then
    raise exception 'Your account does not have active cafeteria access.';
  end if;

  if p_status not in ('accepted', 'preparing', 'ready', 'out_for_delivery', 'delivered', 'cancelled') then
    raise exception 'Choose a valid cafeteria order status.';
  end if;

  select customer_order.status, customer_order.user_id, customer_order.order_number
  into v_current, v_user_id, v_order_number
  from public.orders customer_order
  where customer_order.id = p_order_id
    and exists (
      select 1 from public.cafeteria_order_items item
      where item.order_id = customer_order.id
    )
  for update;

  if not found then
    raise exception 'This cafeteria order could not be found.';
  end if;

  if v_role <> 'manager' then
    if v_role = 'kitchen' and p_status not in ('accepted', 'preparing', 'ready') then
      raise exception 'Kitchen staff can accept, prepare, or mark an order ready.';
    elsif v_role = 'cashier' and p_status not in ('accepted', 'cancelled') then
      raise exception 'Cashiers can accept or cancel an order.';
    elsif v_role = 'server' and p_status not in ('ready', 'out_for_delivery', 'delivered') then
      raise exception 'Serving staff can mark orders ready, dispatched, or delivered.';
    end if;
  end if;

  if not (
    (v_current in ('pending', 'awaiting_confirmation', 'paid') and p_status in ('accepted', 'cancelled'))
    or (v_current = 'accepted' and p_status in ('preparing', 'cancelled'))
    or (v_current = 'preparing' and p_status in ('ready', 'cancelled'))
    or (v_current = 'ready' and p_status in ('out_for_delivery', 'delivered', 'cancelled'))
    or (v_current = 'out_for_delivery' and p_status = 'delivered')
    or v_current = p_status
  ) then
    raise exception 'Move this order through its next valid stage.';
  end if;

  update public.orders
  set status = p_status
  where id = p_order_id;

  v_message := case p_status
    when 'accepted' then 'Your cafeteria order has been accepted.'
    when 'preparing' then 'The cafeteria is preparing your order.'
    when 'ready' then 'Your cafeteria order is ready.'
    when 'out_for_delivery' then 'Your cafeteria order is on its way.'
    when 'delivered' then 'Your cafeteria order has been delivered.'
    else 'Your cafeteria order was cancelled. AOM will contact you about the next step.'
  end;

  insert into public.order_updates (order_id, message, update_type)
  values (p_order_id, v_message, 'system');

  insert into public.notifications (
    user_id, title, body, message, kind, action_label, action_href, is_read
  ) values (
    v_user_id,
    case when p_status = 'cancelled' then 'Cafeteria order update' else 'Cafeteria order ' || replace(p_status, '_', ' ') end,
    v_message,
    v_message,
    'cafeteria',
    'VIEW ORDER',
    '/(buyer)/order/' || p_order_id::text,
    false
  );

  return jsonb_build_object(
    'ok', true,
    'order_id', p_order_id,
    'order_number', v_order_number,
    'status', p_status
  );
end;
$$;

revoke all on function public.update_cafeteria_order_status(uuid, text) from public;
grant execute on function public.update_cafeteria_order_status(uuid, text) to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'cafeteria_order_items'
  ) then
    alter publication supabase_realtime add table public.cafeteria_order_items;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'cafeteria_settings'
  ) then
    alter publication supabase_realtime add table public.cafeteria_settings;
  end if;
end $$;
