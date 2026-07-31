-- Keep vendor onboarding resilient when an older cached portal submits without
-- the newer customer-facing category field. Current clients still require the
-- vendor to enter a category; this only prevents an opaque database failure.
create or replace function public.require_vendor_application_operating_location()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.category is null or char_length(trim(new.category)) < 2 then
    new.category := case new.store_type
      when 'supermarket' then 'Supermarket'
      when 'service' then 'Services'
      else 'Marketplace'
    end;
  end if;

  if new.operating_location is null and new.status <> 'rejected' then
    raise exception 'Choose whether the vendor operates on campus or off campus.';
  end if;

  return new;
end;
$$;
