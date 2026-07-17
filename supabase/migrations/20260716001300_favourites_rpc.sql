-- Keep favourite toggles atomic and independent of client-side table lookups.
-- The first favourites table was created before this app's shared favourite
-- model, so add these fields safely when that older table already exists.
alter table public.favourites
  add column if not exists entity_type text,
  add column if not exists entity_id uuid;

create unique index if not exists favourites_user_entity_unique
  on public.favourites (user_id, entity_type, entity_id)
  where entity_type is not null and entity_id is not null;

create or replace function public.is_favourited(
  p_entity_type text,
  p_entity_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
    and exists (
      select 1
      from public.favourites
      where user_id = auth.uid()
        and entity_type = p_entity_type
        and entity_id = p_entity_id
    );
$$;

create or replace function public.toggle_favourite(
  p_entity_type text,
  p_entity_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in to save favourites.';
  end if;

  if p_entity_type not in ('product', 'cafeteria_product', 'vendor') then
    raise exception 'This type of favourite is not supported.';
  end if;

  delete from public.favourites
  where user_id = auth.uid()
    and entity_type = p_entity_type
    and entity_id = p_entity_id;

  if found then
    return false;
  end if;

  insert into public.favourites (user_id, entity_type, entity_id)
  values (auth.uid(), p_entity_type, p_entity_id)
  on conflict do nothing;

  return true;
end;
$$;

grant execute on function public.is_favourited(text, uuid) to authenticated;
grant execute on function public.toggle_favourite(text, uuid) to authenticated;
