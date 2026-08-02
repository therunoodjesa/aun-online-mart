-- Cafeteria delivery agents are hired and managed explicitly by cafeteria managers.
-- They remain in the shared rider directory for order history, but general AOM riders
-- are not automatically exposed to cafeteria operations.

alter table public.delivery_riders
  add column if not exists is_cafeteria_agent boolean not null default false,
  add column if not exists hired_by uuid references auth.users(id) on delete set null,
  add column if not exists hired_at timestamptz,
  add column if not exists cafeteria_note text;

create index if not exists delivery_riders_cafeteria_roster_idx
  on public.delivery_riders (is_cafeteria_agent, availability, full_name)
  where is_cafeteria_agent;

drop policy if exists "Cafeteria managers register agents" on public.delivery_riders;
create policy "Cafeteria managers register agents"
on public.delivery_riders for insert to authenticated
with check (
  is_cafeteria_agent
  and exists (
    select 1 from public.cafeteria_staff staff
    where staff.user_id = auth.uid() and staff.is_active and staff.role = 'manager'
  )
);

drop policy if exists "Cafeteria managers update agents" on public.delivery_riders;
create policy "Cafeteria managers update agents"
on public.delivery_riders for update to authenticated
using (
  is_cafeteria_agent
  and exists (
    select 1 from public.cafeteria_staff staff
    where staff.user_id = auth.uid() and staff.is_active and staff.role = 'manager'
  )
)
with check (
  is_cafeteria_agent
  and exists (
    select 1 from public.cafeteria_staff staff
    where staff.user_id = auth.uid() and staff.is_active and staff.role = 'manager'
  )
);

-- Preserve the already deployed recommendation implementation and expose a filtered
-- wrapper under its original API name.
alter function public.recommend_cafeteria_walking_agents(uuid, timestamptz)
  rename to recommend_cafeteria_walking_agents_unfiltered;

create function public.recommend_cafeteria_walking_agents(
  p_order_id uuid,
  p_pickup_at timestamptz default now()
)
returns table (
  rider_id uuid,
  full_name text,
  phone text,
  current_zone text,
  campus_zones text[],
  max_orders_per_run integer,
  active_orders bigint,
  runs_today bigint,
  schedule_added boolean,
  recommendation_score integer
)
language sql
security definer
set search_path = public
as $$
  select recommendation.*
  from public.recommend_cafeteria_walking_agents_unfiltered(p_order_id, p_pickup_at) recommendation
  join public.delivery_riders rider on rider.id = recommendation.rider_id
  where rider.is_cafeteria_agent
    and rider.availability = 'active';
$$;

alter function public.assign_cafeteria_walking_agent(uuid, uuid, timestamptz)
  rename to assign_cafeteria_walking_agent_unfiltered;

create function public.assign_cafeteria_walking_agent(
  p_order_id uuid,
  p_rider_id uuid,
  p_pickup_at timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.delivery_riders rider
    where rider.id = p_rider_id
      and rider.is_cafeteria_agent
      and rider.availability = 'active'
  ) then
    raise exception 'Choose an active delivery agent registered by the cafeteria manager.';
  end if;

  return public.assign_cafeteria_walking_agent_unfiltered(p_order_id, p_rider_id, p_pickup_at);
end;
$$;

grant execute on function public.recommend_cafeteria_walking_agents(uuid, timestamptz) to authenticated;
grant execute on function public.assign_cafeteria_walking_agent(uuid, uuid, timestamptz) to authenticated;

comment on column public.delivery_riders.is_cafeteria_agent is
  'True only after a cafeteria manager explicitly registers this hired delivery agent.';
comment on column public.delivery_riders.cafeteria_note is
  'Private cafeteria-management note about the hired agent.';

-- Include the buyer identity cafeteria staff need to match a physical handoff to
-- the correct order. The function remains restricted to active cafeteria staff.
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
      coalesce(nullif(trim(profile.full_name), ''), nullif(trim(auth_user.raw_user_meta_data->>'full_name'), ''), 'Customer') as customer_name,
      coalesce(nullif(trim(auth_user.phone), ''), nullif(trim(auth_user.raw_user_meta_data->>'phone'), '')) as customer_phone,
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
    left join public.profiles profile on profile.id = customer_order.user_id
    left join auth.users auth_user on auth_user.id = customer_order.user_id
    where customer_order.payment_status = 'paid'
    group by customer_order.id, profile.full_name, auth_user.phone, auth_user.raw_user_meta_data
  ) order_feed;

  return result;
end;
$$;

revoke all on function public.get_cafeteria_operations_orders() from public;
grant execute on function public.get_cafeteria_operations_orders() to authenticated;
