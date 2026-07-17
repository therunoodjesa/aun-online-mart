-- Persist each vendor's weekly opening preferences and temporary availability actions.
create table if not exists public.vendor_schedules (
  vendor_id uuid primary key references public.vendors(id) on delete cascade,
  weekly_schedule jsonb not null default '{"Mon": true, "Tue": true, "Wed": true, "Thu": true, "Fri": true, "Sat": false, "Sun": false}'::jsonb,
  pause_until timestamptz,
  closed_for_day date,
  updated_at timestamptz not null default now()
);

alter table public.vendor_schedules enable row level security;

drop policy if exists "Vendors can view their own schedule" on public.vendor_schedules;
create policy "Vendors can view their own schedule"
on public.vendor_schedules for select to authenticated
using (exists (select 1 from public.vendors v where v.id = vendor_schedules.vendor_id and v.owner_id = auth.uid()));

drop policy if exists "Vendors can create their own schedule" on public.vendor_schedules;
create policy "Vendors can create their own schedule"
on public.vendor_schedules for insert to authenticated
with check (exists (select 1 from public.vendors v where v.id = vendor_schedules.vendor_id and v.owner_id = auth.uid()));

drop policy if exists "Vendors can update their own schedule" on public.vendor_schedules;
create policy "Vendors can update their own schedule"
on public.vendor_schedules for update to authenticated
using (exists (select 1 from public.vendors v where v.id = vendor_schedules.vendor_id and v.owner_id = auth.uid()))
with check (exists (select 1 from public.vendors v where v.id = vendor_schedules.vendor_id and v.owner_id = auth.uid()));
