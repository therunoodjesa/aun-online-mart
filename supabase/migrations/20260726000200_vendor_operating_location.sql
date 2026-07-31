-- Record whether a vendor operates on or off the AUN campus. Existing vendor
-- rows intentionally remain null so AOM can classify them manually.
alter table public.vendors
  add column if not exists operating_location text;

alter table public.vendors
  drop constraint if exists vendors_operating_location_check;
alter table public.vendors
  add constraint vendors_operating_location_check
  check (operating_location is null or operating_location in ('on_campus', 'off_campus'));

alter table public.vendor_applications
  add column if not exists operating_location text;

alter table public.vendor_applications
  drop constraint if exists vendor_applications_operating_location_check;
alter table public.vendor_applications
  add constraint vendor_applications_operating_location_check
  check (operating_location is null or operating_location in ('on_campus', 'off_campus'));

-- New submissions must include the selection. Historical rows are preserved,
-- but must be classified before a pending application can be approved.
create or replace function public.require_vendor_application_operating_location()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.operating_location is null and new.status <> 'rejected' then
    raise exception 'Choose whether the vendor operates on campus or off campus.';
  end if;
  return new;
end;
$$;

drop trigger if exists require_vendor_application_operating_location on public.vendor_applications;
create trigger require_vendor_application_operating_location
before insert or update on public.vendor_applications
for each row execute function public.require_vendor_application_operating_location();

create or replace function public.link_approved_vendor_application()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'approved' and old.status is distinct from 'approved' then
    insert into public.vendors (name, owner_id, pickup_location, category, store_type, operating_location, is_approved)
    values (new.store_name, new.user_id, new.pickup_location, new.category, new.store_type, new.operating_location, true)
    on conflict (owner_id) where owner_id is not null
    do update set
      name = excluded.name,
      category = excluded.category,
      store_type = excluded.store_type,
      operating_location = excluded.operating_location,
      is_approved = true,
      pickup_location = coalesce(excluded.pickup_location, public.vendors.pickup_location);
    new.reviewed_at = coalesce(new.reviewed_at, now());
  end if;
  new.updated_at = now();
  return new;
end;
$$;
