-- Vendor-defined collection details for pickup orders.
alter table public.vendors
  add column if not exists pickup_location text,
  add column if not exists pickup_instructions text;
