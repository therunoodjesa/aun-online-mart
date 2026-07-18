-- Let the buyer tracking screen and vendor orders page receive replacement
-- changes immediately, without requiring a manual refresh.
alter table public.order_rejection_requests replica identity full;

do $$
begin
  if not exists (
    select 1
    from pg_publication_rel publication_relation
    join pg_publication publication on publication.oid = publication_relation.prpubid
    where publication.pubname = 'supabase_realtime'
      and publication_relation.prrelid = 'public.order_rejection_requests'::regclass
  ) then
    alter publication supabase_realtime add table public.order_rejection_requests;
  end if;
end;
$$;
