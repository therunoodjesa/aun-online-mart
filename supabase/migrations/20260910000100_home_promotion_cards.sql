-- Today's Pick can now hold a small, intentional promotion rail rather than
-- a single global card. Three cards keeps the home screen focused on mobile.
create table if not exists public.home_promotion_cards (
  id uuid primary key default gen_random_uuid(),
  position smallint not null check (position between 1 and 3),
  heading text not null default 'TODAY''S PICK' check (char_length(trim(heading)) between 1 and 70),
  message text not null check (char_length(trim(message)) between 1 and 220),
  background_image_url text,
  background_color text not null default '#01193D',
  cta_label text not null default 'ORDER NOW' check (char_length(trim(cta_label)) between 1 and 32),
  cta_href text not null default '/(buyer)/marketplace/category/meals' check (char_length(trim(cta_href)) between 1 and 500),
  updated_at timestamptz not null default now(),
  unique (position)
);

insert into public.home_promotion_cards (position, heading, message, background_image_url, background_color, cta_label, cta_href, updated_at)
select 1, heading, message, background_image_url, background_color, cta_label, cta_href, updated_at
from public.home_promotions
where id = true
on conflict (position) do nothing;

alter table public.home_promotion_cards enable row level security;

drop policy if exists "Anyone can view home promotion cards" on public.home_promotion_cards;
create policy "Anyone can view home promotion cards"
on public.home_promotion_cards for select using (true);

comment on table public.home_promotion_cards is 'Up to three admin-managed cards displayed in the buyer Today''s Pick rail.';
