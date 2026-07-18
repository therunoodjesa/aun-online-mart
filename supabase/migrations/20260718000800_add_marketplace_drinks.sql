-- Drinks is available in the vendor editor, so it must be accepted by the database too.
alter table public.products
  drop constraint if exists products_marketplace_category_check;

alter table public.products
  add constraint products_marketplace_category_check
  check (marketplace_category is null or marketplace_category in (
    'meals', 'cakes', 'fast-food', 'ice-cream', 'dairy', 'drinks'
  ));
