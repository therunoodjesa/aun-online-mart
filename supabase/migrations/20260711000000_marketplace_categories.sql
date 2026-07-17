-- Shared marketplace grouping for buyer discovery and vendor product management.
alter table public.products
  add column if not exists marketplace_category text,
  add column if not exists marketplace_subcategory text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'products_marketplace_category_check'
  ) then
    alter table public.products
      add constraint products_marketplace_category_check
      check (marketplace_category is null or marketplace_category in (
        'meals', 'cakes', 'fast-food', 'ice-cream', 'dairy'
      ));
  end if;
end $$;

create index if not exists products_marketplace_category_idx
  on public.products (marketplace_category, marketplace_subcategory);

comment on column public.products.marketplace_category is
  'Vendor-selected buyer marketplace category: meals, cakes, fast-food, ice-cream, or dairy.';
comment on column public.products.marketplace_subcategory is
  'Optional vendor-selected category-specific label, e.g. cupcakes, bentos, or birthdays.';
