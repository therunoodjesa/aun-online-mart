-- Live tracking depends on all three order-related tables being published.
alter table public.orders replica identity full;
alter table public.order_updates replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'orders'
  ) then
    alter publication supabase_realtime add table public.orders;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'order_updates'
  ) then
    alter publication supabase_realtime add table public.order_updates;
  end if;
end $$;
