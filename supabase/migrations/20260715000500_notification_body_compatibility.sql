-- Keep the legacy notification body field alongside the app-facing message field.
alter table public.notifications add column if not exists body text;
update public.notifications set body = message where body is null;
alter table public.notifications alter column body set not null;
