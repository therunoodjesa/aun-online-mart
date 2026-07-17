-- Vendor accounts apply once; approval automatically creates and links their store.
create table if not exists public.vendor_applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  store_name text not null check (char_length(trim(store_name)) between 2 and 100),
  contact_name text not null check (char_length(trim(contact_name)) between 2 and 100),
  phone text not null check (char_length(trim(phone)) between 7 and 30),
  store_type text not null check (store_type in ('marketplace', 'supermarket', 'service')),
  description text,
  address text,
  pickup_location text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewer_note text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.vendor_applications enable row level security;

drop policy if exists "Applicants can view their own application" on public.vendor_applications;
create policy "Applicants can view their own application"
on public.vendor_applications for select to authenticated
using (user_id = auth.uid());

drop policy if exists "Applicants can submit their own application" on public.vendor_applications;
create policy "Applicants can submit their own application"
on public.vendor_applications for insert to authenticated
with check (user_id = auth.uid() and status = 'pending');

drop policy if exists "Applicants can update pending applications" on public.vendor_applications;
create policy "Applicants can update pending applications"
on public.vendor_applications for update to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid() and status = 'pending');

create or replace function public.link_approved_vendor_application()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'approved' and old.status is distinct from 'approved' then
    insert into public.vendors (name, owner_id, pickup_location)
    values (new.store_name, new.user_id, new.pickup_location)
    on conflict (owner_id) where owner_id is not null
    do update set
      name = excluded.name,
      pickup_location = coalesce(excluded.pickup_location, public.vendors.pickup_location);
    new.reviewed_at = coalesce(new.reviewed_at, now());
  end if;
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists link_approved_vendor_application on public.vendor_applications;
create trigger link_approved_vendor_application
before update on public.vendor_applications
for each row execute function public.link_approved_vendor_application();

-- A reviewer approves by updating status to 'approved' in Supabase or a future AOM admin portal.
-- The trigger above creates or links the vendors row in the same transaction.
