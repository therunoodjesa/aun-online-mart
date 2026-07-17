-- One clearly labelled dispatch test order for the AOM administrator workspace.
do $$
declare
  test_user_id uuid;
  test_order_id uuid;
begin
  select user_id into test_user_id from public.admin_users order by created_at asc nulls last limit 1;
  if test_user_id is null then
    return;
  end if;

  select id into test_order_id from public.orders where payment_reference = 'AOM-TRIAL-DISPATCH-001' limit 1;
  if test_order_id is null then
    insert into public.orders (
      order_number, user_id, status, delivery_type, payment_status, payment_reference,
      amount_paid, subtotal, total, delivery_address, delivery_slot
    ) values (
      'AOM-TRIAL-001', test_user_id, 'ready', 'delivery', 'paid', 'AOM-TRIAL-DISPATCH-001',
      0, 0, 0, 'AUN Campus — Rosaria Volpi Girls Hall', '9:00 AM – 11:00 AM'
    ) returning id into test_order_id;

    insert into public.order_updates (order_id, message, update_type)
    values (test_order_id, 'Trial order is ready for manual dispatch', 'system');
  end if;
end $$;
