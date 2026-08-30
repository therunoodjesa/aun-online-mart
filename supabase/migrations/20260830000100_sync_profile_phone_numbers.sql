-- Buyer phone numbers were previously kept only in auth.users metadata.
-- Mirror them into public.profiles so they are visible to authorised AOM staff
-- in the Profiles Table Editor and usable in operational views.
alter table public.profiles
  add column if not exists phone text;

-- Backfill accounts that already have a number from password sign-up,
-- phone sign-in, or an earlier metadata update. Never overwrite a profile
-- number that has already been deliberately set.
update public.profiles profile
set phone = coalesce(
  nullif(trim(auth_user.phone), ''),
  nullif(trim(auth_user.raw_user_meta_data ->> 'phone'), '')
)
from auth.users auth_user
where profile.id = auth_user.id
  and nullif(trim(coalesce(profile.phone, '')), '') is null
  and coalesce(
    nullif(trim(auth_user.phone), ''),
    nullif(trim(auth_user.raw_user_meta_data ->> 'phone'), '')
  ) is not null;

create or replace function public.sync_profile_phone_from_auth()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  update public.profiles
  set phone = coalesce(
    nullif(trim(new.phone), ''),
    nullif(trim(new.raw_user_meta_data ->> 'phone'), '')
  )
  where id = new.id;

  return new;
end;
$$;

drop trigger if exists zz_sync_profile_phone_from_auth on auth.users;

-- The zz prefix lets the existing profile-creation trigger run first.
create trigger zz_sync_profile_phone_from_auth
after insert or update of phone, raw_user_meta_data on auth.users
for each row execute function public.sync_profile_phone_from_auth();
