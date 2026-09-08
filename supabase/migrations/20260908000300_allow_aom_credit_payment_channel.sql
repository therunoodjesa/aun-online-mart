-- Wallet-funded orders are paid orders, but have a distinct channel so that
-- reporting can distinguish AOM Credit from Paystack and bank transfers.
-- Some earlier environments created a payment-channel check outside the
-- tracked migration history; replace any such check with the complete set.
do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select constraint_entry.conname
    from pg_constraint constraint_entry
    join pg_class relation on relation.oid = constraint_entry.conrelid
    join pg_namespace schema_name on schema_name.oid = relation.relnamespace
    where schema_name.nspname = 'public'
      and relation.relname = 'payment_intents'
      and constraint_entry.contype = 'c'
      and pg_get_constraintdef(constraint_entry.oid) ilike '%payment_channel%'
  loop
    execute format('alter table public.payment_intents drop constraint %I', constraint_name);
  end loop;
end;
$$;

alter table public.payment_intents
  add constraint payment_intents_payment_channel_check
  check (payment_channel in ('paystack', 'bank_transfer', 'aom_credit'));
