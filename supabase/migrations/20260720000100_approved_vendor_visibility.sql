-- An approved vendor application must create a store that is visible in buyer discovery.
create or replace function public.link_approved_vendor_application()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'approved' and old.status is distinct from 'approved' then
    insert into public.vendors (name, owner_id, pickup_location, category, is_approved)
    values (new.store_name, new.user_id, new.pickup_location, new.category, true)
    on conflict (owner_id) where owner_id is not null
    do update set
      name = excluded.name,
      category = excluded.category,
      is_approved = true,
      pickup_location = coalesce(excluded.pickup_location, public.vendors.pickup_location);
    new.reviewed_at = coalesce(new.reviewed_at, now());
  end if;
  new.updated_at = now();
  return new;
end;
$$;

-- Repair stores linked to applications that were already approved before this fix.
update public.vendors as vendor
set is_approved = true
from public.vendor_applications as application
where application.user_id = vendor.owner_id
  and application.status = 'approved'
  and vendor.is_approved is distinct from true;
