-- Browser push subscriptions for installed vendor and admin portals.
-- The private VAPID key stays only in Supabase Edge Function secrets.
create table if not exists public.web_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  enabled boolean not null default true,
  last_sent_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, endpoint)
);

alter table public.web_push_subscriptions enable row level security;

drop policy if exists "Users manage their own portal push subscriptions" on public.web_push_subscriptions;
create policy "Users manage their own portal push subscriptions"
  on public.web_push_subscriptions
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists web_push_subscriptions_user_id_idx
  on public.web_push_subscriptions (user_id)
  where enabled = true;
