-- Buyer-facing availability needs approved vendors' published opening hours.
alter table public.vendor_schedules
  add column if not exists force_open_until timestamptz;

drop policy if exists "Public can read approved service availability" on public.vendor_schedules;
drop policy if exists "Public can read approved vendor availability" on public.vendor_schedules;
create policy "Public can read approved vendor availability"
on public.vendor_schedules for select
using (
  exists (
    select 1
    from public.vendors
    where vendors.id = vendor_schedules.vendor_id
      and vendors.is_approved = true
  )
);
