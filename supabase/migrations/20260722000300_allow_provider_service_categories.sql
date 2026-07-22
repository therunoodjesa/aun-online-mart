-- Service providers define their own customer-facing categories (for example,
-- Lashes, Nails, Repairs, or Photography). The original fixed category check
-- predates the vendor portal and incorrectly rejects those valid values.
alter table public.services
  drop constraint if exists services_category_check;

-- Transactional smoke test for the complete authenticated save path. The test
-- service and cascading option are removed before this migration finishes.
do $$
declare
  test_service_id uuid;
begin
  perform set_config('request.jwt.claim.sub', 'd9e97b1b-5a68-41b4-9c77-2f82c0fb441a', true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);

  test_service_id := public.save_service_catalogue(
    null,
    '__AOM service save check__',
    'Lashes',
    'Removed automatically after validation.',
    1,
    5,
    '',
    false,
    '[{"name":"Test choice","price":1,"duration_minutes":5,"is_available":true}]'::jsonb
  );

  if test_service_id is null then
    raise exception 'Service catalogue smoke test did not return an id.';
  end if;

  delete from public.services where id = test_service_id;
end;
$$;
