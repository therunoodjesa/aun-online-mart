create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null default 'general' check (kind in ('order', 'delivery', 'promotion', 'cafeteria', 'booking', 'service', 'general')),
  title text not null check (char_length(title) between 1 and 140),
  message text not null check (char_length(message) between 1 and 500),
  action_label text,
  action_href text,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_id_created_at_idx
  on public.notifications (user_id, created_at desc);

alter table public.notifications enable row level security;

drop policy if exists "Customers can read their notifications" on public.notifications;
create policy "Customers can read their notifications"
  on public.notifications for select
  using (auth.uid() = user_id);

drop policy if exists "Customers can update their notifications" on public.notifications;
create policy "Customers can update their notifications"
  on public.notifications for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

alter table public.notifications replica identity full;
do $$
begin
  if not exists (
    select 1
    from pg_publication_rel publication_relation
    join pg_publication publication on publication.oid = publication_relation.prpubid
    where publication.pubname = 'supabase_realtime'
      and publication_relation.prrelid = 'public.notifications'::regclass
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end;
$$;
