-- AOM-managed rider directory for manual dispatch; riders do not require app accounts.
create table if not exists public.delivery_riders (
  id uuid primary key default gen_random_uuid(),
  full_name text not null check (char_length(trim(full_name)) between 2 and 120),
  phone text not null unique check (char_length(trim(phone)) between 7 and 30),
  accepts_calls boolean not null default true,
  accepts_whatsapp boolean not null default true,
  coverage_area text,
  availability text not null default 'active' check (availability in ('active', 'off_duty', 'unavailable')),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.delivery_riders enable row level security;

insert into public.delivery_riders (full_name, phone, accepts_calls, accepts_whatsapp, coverage_area, availability)
values ('Abba Abdulazeez', '08144059807', true, true, 'All AUN dorms and locations in Adamawa', 'active')
on conflict (phone) do update set
  full_name = excluded.full_name,
  accepts_calls = excluded.accepts_calls,
  accepts_whatsapp = excluded.accepts_whatsapp,
  coverage_area = excluded.coverage_area,
  availability = excluded.availability,
  updated_at = now();
