-- Admin-managed checkout discounts. Validation and final totals are calculated
-- only in Edge Functions; buyers can read neither private redemption data nor
-- change a price in the browser.
create table if not exists public.promo_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  description text,
  discount_type text not null check (discount_type in ('percentage', 'fixed')),
  discount_value numeric(12,2) not null check (discount_value > 0),
  minimum_subtotal numeric(12,2) not null default 0 check (minimum_subtotal >= 0),
  maximum_discount numeric(12,2) check (maximum_discount is null or maximum_discount > 0),
  is_active boolean not null default true,
  starts_at timestamptz,
  ends_at timestamptz,
  usage_limit integer check (usage_limit is null or usage_limit > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.orders add column if not exists promo_code text;
alter table public.orders add column if not exists promo_discount numeric(12,2) not null default 0;

alter table public.promo_codes enable row level security;
drop policy if exists "Admins manage promo codes" on public.promo_codes;
create policy "Admins manage promo codes" on public.promo_codes
  for all using (exists (select 1 from public.admin_users where user_id = auth.uid()))
  with check (exists (select 1 from public.admin_users where user_id = auth.uid()));

comment on table public.promo_codes is 'Create checkout promotions here. Percentage values use 1–100; fixed values are NGN.';
