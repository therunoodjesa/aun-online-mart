-- A product keeps its primary category on public.products and may be promoted
-- into up to two additional discovery categories without being duplicated.
create table if not exists public.product_category_placements (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  section text not null check (section in ('marketplace', 'supermarket')),
  category text not null check (char_length(trim(category)) between 2 and 80),
  subcategory text,
  created_at timestamptz not null default now(),
  unique (product_id, section, category)
);

create index if not exists product_category_placements_browse_idx
  on public.product_category_placements (section, category, product_id);

create or replace function public.limit_product_extra_categories()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if (select count(*) from public.product_category_placements where product_id = new.product_id) >= 2 then
    raise exception 'A product can be placed in at most two additional categories.';
  end if;
  return new;
end;
$$;

drop trigger if exists product_category_placements_limit on public.product_category_placements;
create trigger product_category_placements_limit
before insert on public.product_category_placements
for each row execute function public.limit_product_extra_categories();

alter table public.product_category_placements enable row level security;

drop policy if exists "Anyone can browse product category placements" on public.product_category_placements;
create policy "Anyone can browse product category placements"
on public.product_category_placements for select using (true);

drop policy if exists "Vendors manage their product category placements" on public.product_category_placements;
create policy "Vendors manage their product category placements"
on public.product_category_placements for all
using (exists (select 1 from public.products p join public.vendors v on v.id = p.vendor_id where p.id = product_id and v.owner_id = auth.uid()))
with check (exists (select 1 from public.products p join public.vendors v on v.id = p.vendor_id where p.id = product_id and v.owner_id = auth.uid()));
