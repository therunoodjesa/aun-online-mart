-- Service catalogue entries remain single-select booking choices by default.
-- Add-ons share the same ownership/RLS model but are rendered as multi-select
-- extras and priced on top of the selected booking choice.
alter table public.service_options
  add column if not exists option_type text not null default 'booking';

alter table public.service_options
  drop constraint if exists service_options_option_type_check;

alter table public.service_options
  add constraint service_options_option_type_check
  check (option_type in ('booking', 'addon'));

drop function if exists public.save_service_catalogue(uuid, text, text, text, numeric, integer, text, boolean, jsonb);

create or replace function public.save_service_catalogue(
  p_service_id uuid, p_name text, p_category text, p_description text,
  p_starting_price numeric, p_duration_minutes integer, p_image_url text,
  p_is_available boolean, p_options jsonb default '[]'::jsonb,
  p_addons jsonb default '[]'::jsonb
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

  if v_vendor_id is null then raise exception 'Your account is not linked to an approved service store.'; end if;
  if coalesce(length(trim(p_name)), 0) < 2 or coalesce(length(trim(p_category)), 0) < 2 then raise exception 'A service name and category are required.'; end if;
  if p_starting_price is null or p_starting_price < 0 then raise exception 'Enter a valid starting price.'; end if;

  if p_service_id is null then
    select coalesce(max(sort_order), 0) + 1 into v_next_sort
    from public.services where vendor_id = v_vendor_id;
    insert into public.services (
      vendor_id, name, category, description, price, starting_price,
      duration_minutes, image_url, is_available, sort_order, updated_at
    ) values (
      v_vendor_id, trim(p_name), trim(p_category), nullif(trim(p_description), ''),
      p_starting_price, p_starting_price, greatest(1, coalesce(p_duration_minutes, 60)),
      nullif(trim(p_image_url), ''), coalesce(p_is_available, true), v_next_sort, now()
    ) returning id into v_service_id;
  else
    update public.services
    set name = trim(p_name), category = trim(p_category), description = nullif(trim(p_description), ''),
        price = p_starting_price, starting_price = p_starting_price,
        duration_minutes = greatest(1, coalesce(p_duration_minutes, 60)),
        image_url = nullif(trim(p_image_url), ''), is_available = coalesce(p_is_available, true),
        updated_at = now()
    where id = p_service_id and vendor_id = v_vendor_id
    returning id into v_service_id;
    if v_service_id is null then raise exception 'That service does not belong to your store.'; end if;
  end if;

  delete from public.service_options where service_id = v_service_id;

  insert into public.service_options (service_id, name, price, duration_minutes, is_available, sort_order, option_type)
  select v_service_id, trim(entry.value->>'name'), (entry.value->>'price')::numeric,
    greatest(1, coalesce((entry.value->>'duration_minutes')::integer, p_duration_minutes, 60)),
    coalesce((entry.value->>'is_available')::boolean, true), entry.ordinality::integer, 'booking'
  from jsonb_array_elements(coalesce(p_options, '[]'::jsonb)) with ordinality as entry(value, ordinality)
  where coalesce(length(trim(entry.value->>'name')), 0) > 0
    and coalesce((entry.value->>'price')::numeric, -1) >= 0;

  insert into public.service_options (service_id, name, price, duration_minutes, is_available, sort_order, option_type)
  select v_service_id, trim(entry.value->>'name'), (entry.value->>'price')::numeric,
    null, coalesce((entry.value->>'is_available')::boolean, true), entry.ordinality::integer, 'addon'
  from jsonb_array_elements(coalesce(p_addons, '[]'::jsonb)) with ordinality as entry(value, ordinality)
  where coalesce(length(trim(entry.value->>'name')), 0) > 0
    and coalesce((entry.value->>'price')::numeric, -1) >= 0;

  return v_service_id;
end;
$$;

grant execute on function public.save_service_catalogue(uuid, text, text, text, numeric, integer, text, boolean, jsonb, jsonb) to authenticated;
