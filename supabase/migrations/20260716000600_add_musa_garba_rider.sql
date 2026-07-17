insert into public.delivery_riders (full_name, phone, accepts_calls, accepts_whatsapp, coverage_area, availability)
values (
  'Musa Garba',
  '08039419089',
  true,
  false,
  'All AUN dorms, NLS Yola, Jimeta, and locations in Adamawa',
  'active'
)
on conflict (phone) do update set
  full_name = excluded.full_name,
  accepts_calls = excluded.accepts_calls,
  accepts_whatsapp = excluded.accepts_whatsapp,
  coverage_area = excluded.coverage_area,
  availability = excluded.availability,
  updated_at = now();
