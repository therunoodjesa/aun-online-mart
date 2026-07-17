-- Customer-saved products and vendors.
create table if not exists public.favourites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  entity_type text not null check (entity_type in ('product', 'cafeteria_product', 'vendor')),
  entity_id uuid not null,
  created_at timestamptz not null default now(),
  unique (user_id, entity_type, entity_id)
);

create index if not exists favourites_user_created_idx on public.favourites (user_id, created_at desc);
alter table public.favourites enable row level security;

drop policy if exists "Users can view their own favourites" on public.favourites;
create policy "Users can view their own favourites"
  on public.favourites for select to authenticated using (auth.uid() = user_id);
drop policy if exists "Users can save their own favourites" on public.favourites;
create policy "Users can save their own favourites"
  on public.favourites for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "Users can remove their own favourites" on public.favourites;
create policy "Users can remove their own favourites"
  on public.favourites for delete to authenticated using (auth.uid() = user_id);
