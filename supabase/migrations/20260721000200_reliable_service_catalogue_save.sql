-- Save a service and its booking choices atomically. This avoids relying on
-- browser-side table policies for the service-provider workspace.
create or replace function public.save_service_catalogue(
  p_service_id uuid,
  p_name text,
  p_category text,
  p_description text,
  p_starting_price numeric,
  p_duration_minutes integer,
  p_image_url text,
  p_is_available boolean,
  p_options jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_vendor_id uuid;
  v_service_id uuid;
  v_next_sort integer;
begin
  select id into v_vendor_id
  from public.vendors
  where owner_id = auth.uid()
    and store_type = 'service'
    and is_approved = true;

  if v_vendor_id is null then
    raise exception 'Your account is not linked to an approved service store.';
  end if;

  if coalesce(length(trim(p_name)), 0) < 2 or coalesce(length(trim(p_category)), 0) < 2 then
    raise exception 'A service name and category are required.';
  end if;

  if p_starting_price is null or p_starting_price < 0 then
    raise exception 'Enter a valid starting price.';
  end if;

  if p_service_id is null then
    select coalesce(max(sort_order), 0) + 1 into v_next_sort
    from public.services where vendor_id = v_vendor_id;
    insert into public.services (vendor_id, name, category, description, starting_price, duration_minutes, image_url, is_available, sort_order, updated_at)
    values (v_vendor_id, trim(p_name), trim(p_category), nullif(trim(p_description), ''), p_starting_price, greatest(1, coalesce(p_duration_minutes, 60)), nullif(trim(p_image_url), ''), coalesce(p_is_available, true), v_next_sort, now())
    returning id into v_service_id;
  else
    update public.services
    set name = trim(p_name), category = trim(p_category), description = nullif(trim(p_description), ''),
        starting_price = p_starting_price, duration_minutes = greatest(1, coalesce(p_duration_minutes, 60)),
        image_url = nullif(trim(p_image_url), ''), is_available = coalesce(p_is_available, true), updated_at = now()
    where id = p_service_id and vendor_id = v_vendor_id
    returning id into v_service_id;
    if v_service_id is null then
      raise exception 'That service does not belong to your store.';
    end if;
  end if;

  delete from public.service_options where service_id = v_service_id;
  insert into public.service_options (service_id, name, price, duration_minutes, is_available, sort_order)
  select v_service_id, trim(option.name), option.price, greatest(1, coalesce(option.duration_minutes, p_duration_minutes, 60)), coalesce(option.is_available, true), option.position
  from jsonb_to_recordset(coalesce(p_options, '[]'::jsonb)) with ordinality as option(name text, price numeric, duration_minutes integer, is_available boolean, position integer)
  where coalesce(length(trim(option.name)), 0) > 0 and option.price >= 0;

  return v_service_id;
end;
$$;

grant execute on function public.save_service_catalogue(uuid, text, text, text, numeric, integer, text, boolean, jsonb) to authenticated;
