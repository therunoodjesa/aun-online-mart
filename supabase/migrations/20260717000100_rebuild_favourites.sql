-- Replace the legacy favourites table with one clean, consistent model.
drop table if exists public.favourites cascade;

create table public.favourites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  entity_type text not null check (entity_type in ('product', 'cafeteria_product', 'vendor')),
  entity_id uuid not null,
  created_at timestamptz not null default now(),
  unique (user_id, entity_type, entity_id)
);

create index favourites_user_created_idx on public.favourites (user_id, created_at desc);
alter table public.favourites enable row level security;

create policy "Users can view their own favourites"
  on public.favourites for select to authenticated
  using (auth.uid() = user_id);

create or replace function public.favourite_status(p_entity_type text, p_entity_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.favourites
    where user_id = auth.uid()
      and entity_type = p_entity_type
      and entity_id = p_entity_id
  );
$$;

create or replace function public.toggle_favourite(p_entity_type text, p_entity_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in to save favourites.';
  end if;

  delete from public.favourites
  where user_id = auth.uid()
    and entity_type = p_entity_type
    and entity_id = p_entity_id;

  if found then return false; end if;

  insert into public.favourites (user_id, entity_type, entity_id)
  values (auth.uid(), p_entity_type, p_entity_id);
  return true;
end;
$$;

grant execute on function public.favourite_status(text, uuid) to authenticated;
grant execute on function public.toggle_favourite(text, uuid) to authenticated;
