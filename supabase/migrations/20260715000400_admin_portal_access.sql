-- Administrator allow-list. Only accounts inserted here can use the admin portal.
create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now()
);

alter table public.admin_users enable row level security;

drop policy if exists "Administrators can view their own access" on public.admin_users;
create policy "Administrators can view their own access"
on public.admin_users for select to authenticated
using (user_id = auth.uid());

-- No client-side insert, update, or delete policy: admin access is granted in SQL only.
