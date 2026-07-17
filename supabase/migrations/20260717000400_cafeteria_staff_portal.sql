create table if not exists public.cafeteria_staff (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('manager', 'kitchen', 'cashier', 'server')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.cafeteria_staff enable row level security;

drop policy if exists "Cafeteria staff can view their access" on public.cafeteria_staff;
create policy "Cafeteria staff can view their access"
on public.cafeteria_staff for select to authenticated
using (user_id = auth.uid());

drop policy if exists "AOM admins manage cafeteria staff" on public.cafeteria_staff;
create policy "AOM admins manage cafeteria staff"
on public.cafeteria_staff for all to authenticated
using (exists (select 1 from public.admin_users a where a.user_id = auth.uid()))
with check (exists (select 1 from public.admin_users a where a.user_id = auth.uid()));

drop policy if exists "Cafeteria managers manage the catalogue" on public.cafeteria_products;
create policy "Cafeteria managers manage the catalogue"
on public.cafeteria_products for all to authenticated
using (exists (select 1 from public.cafeteria_staff s where s.user_id = auth.uid() and s.role = 'manager' and s.is_active))
with check (exists (select 1 from public.cafeteria_staff s where s.user_id = auth.uid() and s.role = 'manager' and s.is_active));

comment on table public.cafeteria_staff is
  'Internal AOM cafeteria operations access. Cafeteria staff are not vendors and are excluded from vendor payouts.';
