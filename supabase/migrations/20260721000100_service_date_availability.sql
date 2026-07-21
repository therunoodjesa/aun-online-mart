-- Service providers can optionally publish the specific dates they are
-- available this month. An empty list means their weekly hours apply.
alter table public.vendor_schedules
  add column if not exists service_available_dates date[] not null default '{}';

drop policy if exists "Public can read approved service availability" on public.vendor_schedules;
create policy "Public can read approved service availability"
on public.vendor_schedules for select
using (
  exists (
    select 1 from public.vendors
    where vendors.id = vendor_schedules.vendor_id
      and vendors.store_type = 'service'
      and vendors.is_approved = true
  )
);
