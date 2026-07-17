-- Optional message shown prominently on a vendor storefront.
alter table public.vendors
  add column if not exists important_message text;

alter table public.vendors
  drop constraint if exists vendors_important_message_length_check;

alter table public.vendors
  add constraint vendors_important_message_length_check
  check (important_message is null or char_length(important_message) <= 280);

comment on column public.vendors.important_message is
  'Optional storefront notice for delivery schedules, closures, or other important vendor updates.';
