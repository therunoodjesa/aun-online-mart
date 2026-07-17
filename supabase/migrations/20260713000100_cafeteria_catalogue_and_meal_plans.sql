create table if not exists public.cafeteria_products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  category text not null check (category in ('snacks', 'lunch', 'dinner')),
  price numeric(12,2) not null check (price >= 0),
  image_url text,
  status text not null default 'available' check (status in ('available', 'sold_out', 'hidden')),
  meal_plan_eligible boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists cafeteria_products_category_status_idx
  on public.cafeteria_products (category, status);

create table if not exists public.meal_plan_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  semester text,
  plan_count smallint not null default 0 check (plan_count between 0 and 3),
  daily_allowance numeric(12,2) not null default 1800 check (daily_allowance >= 0),
  meals_used_today smallint not null default 0,
  last_used_on date,
  updated_at timestamptz not null default now()
);

alter table public.cafeteria_products enable row level security;
alter table public.meal_plan_accounts enable row level security;

drop policy if exists "Anyone can view cafeteria products" on public.cafeteria_products;
create policy "Anyone can view cafeteria products" on public.cafeteria_products for select using (true);

drop policy if exists "Students can view their meal plan" on public.meal_plan_accounts;
create policy "Students can view their meal plan" on public.meal_plan_accounts for select using (auth.uid() = user_id);

-- Payment rule to apply at checkout:
-- plan credit = min(eligible cafeteria subtotal, plan_count * daily_allowance)
-- payable = non-eligible subtotal + packaging (₦200 × meals) + delivery (₦600 × meals) + any amount above plan credit.
