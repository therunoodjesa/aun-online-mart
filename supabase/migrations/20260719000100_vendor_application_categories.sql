-- Vendor applications must carry the customer-facing category required by vendors.
alter table public.vendor_applications
  add column if not exists category text;

update public.vendor_applications
set category = case store_type
  when 'supermarket' then 'Supermarket'
  when 'service' then 'Services'
  else 'Marketplace'
end
where category is null or char_length(trim(category)) < 2;

alter table public.vendor_applications
  alter column category set not null;

alter table public.vendor_applications
  drop constraint if exists vendor_applications_category_check;

alter table public.vendor_applications
  add constraint vendor_applications_category_check
  check (char_length(trim(category)) between 2 and 80);

-- Store categories are vendor-defined labels such as Bakery, Native pot, or Groceries.
alter table public.vendors
  drop constraint if exists vendors_category_check;

update public.vendors
set category = 'Marketplace'
where category is null or char_length(trim(category)) < 2;

alter table public.vendors
  add constraint vendors_category_check
  check (char_length(trim(category)) between 2 and 80);

create or replace function public.link_approved_vendor_application()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'approved' and old.status is distinct from 'approved' then
    insert into public.vendors (name, owner_id, pickup_location, category)
    values (new.store_name, new.user_id, new.pickup_location, new.category)
    on conflict (owner_id) where owner_id is not null
    do update set
      name = excluded.name,
      category = excluded.category,
      pickup_location = coalesce(excluded.pickup_location, public.vendors.pickup_location);
    new.reviewed_at = coalesce(new.reviewed_at, now());
  end if;
  new.updated_at = now();
  return new;
end;
$$;
