-- AOM staff assign and track riders manually; riders do not need portal accounts.
alter table public.orders
  add column if not exists rider_name text,
  add column if not exists rider_phone text,
  add column if not exists rider_assigned_at timestamptz,
  add column if not exists dispatch_status text;

alter table public.orders
  drop constraint if exists orders_dispatch_status_check;

alter table public.orders
  add constraint orders_dispatch_status_check
  check (dispatch_status is null or dispatch_status in ('assigned', 'picked_up', 'delivered'));

create index if not exists orders_dispatch_queue_idx
  on public.orders (payment_status, status, dispatch_status, created_at desc);
