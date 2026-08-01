-- Schedule and assign AUN student walking agents from the cafeteria workspace.
-- The existing delivery_riders directory remains the shared source of truth for
-- both the AOM admin dispatch desk and cafeteria operations.

alter table public.delivery_riders
  add column if not exists campus_zones text[] not null default '{}'::text[],
  add column if not exists current_zone text,
  add column if not exists max_orders_per_run integer not null default 4,
  add column if not exists walking_status text not null default 'available';

alter table public.delivery_riders
  drop constraint if exists delivery_riders_max_orders_per_run_check,
  drop constraint if exists delivery_riders_walking_status_check;

alter table public.delivery_riders
  add constraint delivery_riders_max_orders_per_run_check
    check (max_orders_per_run between 1 and 12),
  add constraint delivery_riders_walking_status_check
    check (walking_status in ('available', 'in_class', 'on_run', 'off_duty'));

alter table public.orders
  add column if not exists rider_id uuid references public.delivery_riders(id) on delete set null;

update public.orders customer_order
set rider_id = rider.id
from public.delivery_riders rider
where customer_order.rider_id is null
  and customer_order.rider_phone is not null
  and regexp_replace(customer_order.rider_phone, '\D', '', 'g') = regexp_replace(rider.phone, '\D', '', 'g');

create table if not exists public.delivery_rider_schedules (
  id uuid primary key default gen_random_uuid(),
  rider_id uuid not null references public.delivery_riders(id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 0 and 6),
  starts_at time not null,
  ends_at time not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (starts_at < ends_at),
  unique (rider_id, day_of_week, starts_at, ends_at)
);

create table if not exists public.delivery_rider_schedule_exceptions (
  id uuid primary key default gen_random_uuid(),
  rider_id uuid not null references public.delivery_riders(id) on delete cascade,
  service_date date not null,
  starts_at time,
  ends_at time,
  is_available boolean not null default false,
  note text,
  created_at timestamptz not null default now(),
  check (
    (starts_at is null and ends_at is null)
    or (starts_at is not null and ends_at is not null and starts_at < ends_at)
  )
);

create table if not exists public.cafeteria_delivery_runs (
  id uuid primary key default gen_random_uuid(),
  rider_id uuid not null references public.delivery_riders(id) on delete restrict,
  campus_zone text,
  scheduled_pickup_at timestamptz not null,
  status text not null default 'assigned'
    check (status in ('assigned', 'picked_up', 'completed', 'cancelled')),
  assigned_by uuid references auth.users(id) on delete set null,
  assigned_at timestamptz not null default now(),
  picked_up_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.cafeteria_delivery_run_orders (
  run_id uuid not null references public.cafeteria_delivery_runs(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (run_id, order_id),
  unique (order_id)
);

create index if not exists rider_schedules_lookup_idx
  on public.delivery_rider_schedules (rider_id, day_of_week, starts_at, ends_at)
  where is_active;

create index if not exists cafeteria_delivery_runs_active_idx
  on public.cafeteria_delivery_runs (rider_id, scheduled_pickup_at)
  where status in ('assigned', 'picked_up');

alter table public.delivery_rider_schedules enable row level security;
alter table public.delivery_rider_schedule_exceptions enable row level security;
alter table public.cafeteria_delivery_runs enable row level security;
alter table public.cafeteria_delivery_run_orders enable row level security;

drop policy if exists "Cafeteria dispatch staff view riders" on public.delivery_riders;
create policy "Cafeteria dispatch staff view riders"
on public.delivery_riders for select to authenticated
using (
  exists (
    select 1 from public.cafeteria_staff staff
    where staff.user_id = auth.uid()
      and staff.is_active
      and staff.role in ('manager', 'server')
  )
);

drop policy if exists "Cafeteria staff view rider schedules" on public.delivery_rider_schedules;
create policy "Cafeteria staff view rider schedules"
on public.delivery_rider_schedules for select to authenticated
using (
  exists (
    select 1 from public.cafeteria_staff staff
    where staff.user_id = auth.uid()
      and staff.is_active
      and staff.role in ('manager', 'server')
  )
);

drop policy if exists "Cafeteria managers manage rider schedules" on public.delivery_rider_schedules;
create policy "Cafeteria managers manage rider schedules"
on public.delivery_rider_schedules for all to authenticated
using (
  exists (
    select 1 from public.cafeteria_staff staff
    where staff.user_id = auth.uid() and staff.is_active and staff.role = 'manager'
  )
)
with check (
  exists (
    select 1 from public.cafeteria_staff staff
    where staff.user_id = auth.uid() and staff.is_active and staff.role = 'manager'
  )
);

drop policy if exists "Cafeteria staff view schedule exceptions" on public.delivery_rider_schedule_exceptions;
create policy "Cafeteria staff view schedule exceptions"
on public.delivery_rider_schedule_exceptions for select to authenticated
using (
  exists (
    select 1 from public.cafeteria_staff staff
    where staff.user_id = auth.uid()
      and staff.is_active
      and staff.role in ('manager', 'server')
  )
);

drop policy if exists "Cafeteria managers manage schedule exceptions" on public.delivery_rider_schedule_exceptions;
create policy "Cafeteria managers manage schedule exceptions"
on public.delivery_rider_schedule_exceptions for all to authenticated
using (
  exists (
    select 1 from public.cafeteria_staff staff
    where staff.user_id = auth.uid() and staff.is_active and staff.role = 'manager'
  )
)
with check (
  exists (
    select 1 from public.cafeteria_staff staff
    where staff.user_id = auth.uid() and staff.is_active and staff.role = 'manager'
  )
);

drop policy if exists "Cafeteria dispatch staff view runs" on public.cafeteria_delivery_runs;
create policy "Cafeteria dispatch staff view runs"
on public.cafeteria_delivery_runs for select to authenticated
using (
  exists (
    select 1 from public.cafeteria_staff staff
    where staff.user_id = auth.uid()
      and staff.is_active
      and staff.role in ('manager', 'server')
  )
);

drop policy if exists "Cafeteria dispatch staff view run orders" on public.cafeteria_delivery_run_orders;
create policy "Cafeteria dispatch staff view run orders"
on public.cafeteria_delivery_run_orders for select to authenticated
using (
  exists (
    select 1 from public.cafeteria_staff staff
    where staff.user_id = auth.uid()
      and staff.is_active
      and staff.role in ('manager', 'server')
  )
);

create or replace function public.recommend_cafeteria_walking_agents(
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
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_zone text;
  v_local timestamp;
begin
  select staff.role into v_role
  from public.cafeteria_staff staff
  where staff.user_id = auth.uid() and staff.is_active
  limit 1;

  if v_role not in ('manager', 'server') then
    raise exception 'Only cafeteria managers and serving staff can view walking-agent recommendations.';
  end if;

  select customer_order.delivery_address into v_zone
  from public.orders customer_order
  where customer_order.id = p_order_id
    and customer_order.payment_status = 'paid'
    and customer_order.delivery_type <> 'pickup'
    and exists (
      select 1 from public.cafeteria_order_items item
      where item.order_id = customer_order.id
    );

  if not found then
    raise exception 'Choose a paid cafeteria delivery order.';
  end if;

  v_local := p_pickup_at at time zone 'Africa/Lagos';

  return query
  with workloads as (
    select
      rider.id,
      count(distinct run_order.order_id) filter (
        where run.status in ('assigned', 'picked_up')
      ) as active_orders,
      count(distinct run.id) filter (
        where run.created_at >= date_trunc('day', now() at time zone 'Africa/Lagos') at time zone 'Africa/Lagos'
      ) as runs_today
    from public.delivery_riders rider
    left join public.cafeteria_delivery_runs run on run.rider_id = rider.id
    left join public.cafeteria_delivery_run_orders run_order on run_order.run_id = run.id
    group by rider.id
  )
  select
    rider.id,
    rider.full_name,
    rider.phone,
    rider.current_zone,
    rider.campus_zones,
    rider.max_orders_per_run,
    coalesce(workload.active_orders, 0),
    coalesce(workload.runs_today, 0),
    exists (
      select 1 from public.delivery_rider_schedules schedule
      where schedule.rider_id = rider.id and schedule.is_active
    ),
    (
      coalesce(workload.active_orders, 0) * 100
      + coalesce(workload.runs_today, 0) * 10
      + case when rider.current_zone is not null and v_zone ilike '%' || rider.current_zone || '%' then -20 else 0 end
      + case when cardinality(rider.campus_zones) > 0 and not exists (
          select 1 from unnest(rider.campus_zones) zone where v_zone ilike '%' || zone || '%'
        ) then 40 else 0 end
      + case when not exists (
          select 1 from public.delivery_rider_schedules schedule
          where schedule.rider_id = rider.id and schedule.is_active
        ) then 25 else 0 end
    )::integer
  from public.delivery_riders rider
  join workloads workload on workload.id = rider.id
  where rider.availability = 'active'
    and rider.walking_status = 'available'
    and coalesce(workload.active_orders, 0) < rider.max_orders_per_run
    and (
      not exists (
        select 1 from public.delivery_rider_schedules schedule
        where schedule.rider_id = rider.id and schedule.is_active
      )
      or exists (
        select 1 from public.delivery_rider_schedules schedule
        where schedule.rider_id = rider.id
          and schedule.is_active
          and schedule.day_of_week = extract(dow from v_local)::integer
          and v_local::time >= schedule.starts_at
          and v_local::time < schedule.ends_at
      )
      or exists (
        select 1 from public.delivery_rider_schedule_exceptions exception
        where exception.rider_id = rider.id
          and exception.service_date = v_local::date
          and exception.is_available
          and (
            exception.starts_at is null
            or (v_local::time >= exception.starts_at and v_local::time < exception.ends_at)
          )
      )
    )
    and not exists (
      select 1 from public.delivery_rider_schedule_exceptions exception
      where exception.rider_id = rider.id
        and exception.service_date = v_local::date
        and not exception.is_available
        and (
          exception.starts_at is null
          or (v_local::time >= exception.starts_at and v_local::time < exception.ends_at)
        )
    )
  order by recommendation_score, workload.active_orders, workload.runs_today, rider.full_name;
end;
$$;

create or replace function public.assign_cafeteria_walking_agent(
  p_order_id uuid,
  p_rider_id uuid,
  p_pickup_at timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_order public.orders%rowtype;
  v_rider public.delivery_riders%rowtype;
  v_run_id uuid;
  v_run_count integer;
begin
  select staff.role into v_role
  from public.cafeteria_staff staff
  where staff.user_id = auth.uid() and staff.is_active
  limit 1;

  if v_role not in ('manager', 'server') then
    raise exception 'Only cafeteria managers and serving staff can assign walking agents.';
  end if;

  select * into v_order from public.orders
  where id = p_order_id and payment_status = 'paid'
  for update;

  if not found or v_order.delivery_type = 'pickup' or not exists (
    select 1 from public.cafeteria_order_items where order_id = p_order_id
  ) then
    raise exception 'Choose a paid cafeteria delivery order.';
  end if;

  if v_order.status not in ('accepted', 'preparing', 'ready') then
    raise exception 'Assign a walking agent after the order is accepted and before it leaves the cafeteria.';
  end if;

  select * into v_rider from public.delivery_riders
  where id = p_rider_id and availability = 'active' and walking_status = 'available'
  for update;

  if not found then
    raise exception 'This student agent is not available right now.';
  end if;

  select count(*) into v_run_count
  from public.cafeteria_delivery_run_orders run_order
  join public.cafeteria_delivery_runs run on run.id = run_order.run_id
  where run.rider_id = p_rider_id and run.status in ('assigned', 'picked_up');

  if v_run_count >= v_rider.max_orders_per_run then
    raise exception 'This student agent has reached their walking-run capacity.';
  end if;

  select run.id into v_run_id
  from public.cafeteria_delivery_runs run
  where run.rider_id = p_rider_id
    and run.status = 'assigned'
    and run.scheduled_pickup_at between p_pickup_at - interval '30 minutes' and p_pickup_at + interval '30 minutes'
    and coalesce(run.campus_zone, '') = coalesce(v_order.delivery_address, '')
  order by run.created_at
  limit 1;

  if v_run_id is null then
    insert into public.cafeteria_delivery_runs (
      rider_id, campus_zone, scheduled_pickup_at, assigned_by
    ) values (
      p_rider_id, v_order.delivery_address, p_pickup_at, auth.uid()
    ) returning id into v_run_id;
  end if;

  insert into public.cafeteria_delivery_run_orders (run_id, order_id)
  values (v_run_id, p_order_id)
  on conflict (order_id) do update set run_id = excluded.run_id, added_at = now();

  update public.orders set
    rider_id = v_rider.id,
    rider_name = v_rider.full_name,
    rider_phone = v_rider.phone,
    rider_assigned_at = now(),
    dispatch_status = 'assigned'
  where id = p_order_id;

  insert into public.order_updates (order_id, message, update_type)
  values (p_order_id, v_rider.full_name || ' has been assigned to deliver your cafeteria order on foot.', 'system');

  insert into public.notifications (
    user_id, title, body, message, kind, action_label, action_href, is_read
  ) values (
    v_order.user_id,
    'Student delivery agent assigned',
    v_rider.full_name || ' will deliver order #' || v_order.order_number || ' to your campus location.',
    v_rider.full_name || ' will deliver order #' || v_order.order_number || ' to your campus location.',
    'cafeteria',
    'TRACK ORDER',
    '/(buyer)/order/' || p_order_id::text,
    false
  );

  return jsonb_build_object(
    'ok', true,
    'run_id', v_run_id,
    'order_id', p_order_id,
    'rider_id', v_rider.id,
    'rider_name', v_rider.full_name
  );
end;
$$;

create or replace function public.sync_cafeteria_delivery_run_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run_id uuid;
  v_rider_id uuid;
begin
  if new.status not in ('out_for_delivery', 'delivered', 'cancelled') then
    return new;
  end if;

  select run_order.run_id, run.rider_id into v_run_id, v_rider_id
  from public.cafeteria_delivery_run_orders run_order
  join public.cafeteria_delivery_runs run on run.id = run_order.run_id
  where run_order.order_id = new.id
  limit 1;

  if v_run_id is null then return new; end if;

  if new.status = 'out_for_delivery' then
    update public.cafeteria_delivery_runs
    set status = 'picked_up', picked_up_at = coalesce(picked_up_at, now())
    where id = v_run_id and status = 'assigned';
    update public.delivery_riders set walking_status = 'on_run', updated_at = now()
    where id = v_rider_id;
  elsif not exists (
    select 1
    from public.cafeteria_delivery_run_orders run_order
    join public.orders run_order_record on run_order_record.id = run_order.order_id
    where run_order.run_id = v_run_id
      and run_order_record.status not in ('delivered', 'cancelled')
  ) then
    update public.cafeteria_delivery_runs
    set status = 'completed', completed_at = coalesce(completed_at, now())
    where id = v_run_id;
    if not exists (
      select 1 from public.cafeteria_delivery_runs other_run
      where other_run.rider_id = v_rider_id
        and other_run.id <> v_run_id
        and other_run.status = 'picked_up'
    ) then
      update public.delivery_riders set walking_status = 'available', updated_at = now()
      where id = v_rider_id;
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.require_cafeteria_walking_agent_before_dispatch()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status = 'out_for_delivery'
    and old.status is distinct from new.status
    and new.delivery_type <> 'pickup'
    and new.rider_id is null
    and exists (select 1 from public.cafeteria_order_items item where item.order_id = new.id)
  then
    raise exception 'Assign a student walking agent before dispatching this cafeteria order.';
  end if;
  return new;
end;
$$;

drop trigger if exists orders_require_cafeteria_walking_agent on public.orders;
create trigger orders_require_cafeteria_walking_agent
before update of status on public.orders
for each row execute function public.require_cafeteria_walking_agent_before_dispatch();

drop trigger if exists orders_sync_cafeteria_delivery_run on public.orders;
create trigger orders_sync_cafeteria_delivery_run
after update of status on public.orders
for each row
when (old.status is distinct from new.status)
execute function public.sync_cafeteria_delivery_run_status();

grant execute on function public.recommend_cafeteria_walking_agents(uuid, timestamptz) to authenticated;
grant execute on function public.assign_cafeteria_walking_agent(uuid, uuid, timestamptz) to authenticated;

comment on table public.delivery_rider_schedules is
  'Recurring WAT free periods supplied by AUN student walking agents.';
comment on table public.cafeteria_delivery_runs is
  'Campus walking runs that may group cafeteria orders with a shared agent, pickup window, and destination zone.';
