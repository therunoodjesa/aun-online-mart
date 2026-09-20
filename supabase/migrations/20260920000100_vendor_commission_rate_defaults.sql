-- AOM's standard commission applies automatically unless an administrator
-- sets a different percentage for an individual vendor in the table editor.
alter table public.vendors
  alter column commission_rate set default 10;

update public.vendors
set commission_rate = 10
where commission_rate is null;

alter table public.vendors
  alter column commission_rate set not null;

alter table public.vendors
  drop constraint if exists vendors_commission_rate_range;

alter table public.vendors
  add constraint vendors_commission_rate_range
  check (commission_rate >= 0 and commission_rate <= 100);
