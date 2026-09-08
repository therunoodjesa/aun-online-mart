-- Repair the single safe failure mode from the initial AOM Credit launch:
-- a payment-intent validation failure after a debit. The ledger remains
-- immutable, so return credit with a compensating reversal rather than edit.
insert into public.aom_wallet_transactions (user_id, amount, kind, description, order_id)
select
  transaction.user_id,
  abs(transaction.amount),
  'reversal',
  'Reversal for an incomplete AOM Credit order ' || coalesce(order_row.order_number, 'request'),
  transaction.order_id
from public.aom_wallet_transactions transaction
join public.orders order_row on order_row.id = transaction.order_id
where transaction.kind = 'order_payment'
  and transaction.amount < 0
  and order_row.payment_status = 'failed'
  and not exists (
    select 1 from public.aom_wallet_transactions reversal
    where reversal.order_id = transaction.order_id
      and reversal.kind = 'reversal'
      and reversal.amount = abs(transaction.amount)
  );
