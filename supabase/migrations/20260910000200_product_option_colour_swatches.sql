-- Optional, exact display colour for a product option (for example a makeup shade).
-- Existing text-only options remain fully supported.
alter table public.product_options
  add column if not exists color_hex text;

alter table public.product_options
  drop constraint if exists product_options_color_hex_check;

alter table public.product_options
  add constraint product_options_color_hex_check
  check (color_hex is null or color_hex ~ '^#[0-9A-Fa-f]{6}$');

comment on column public.product_options.color_hex is
  'Optional six-digit HEX colour swatch for a product option, e.g. #E8954A.';
