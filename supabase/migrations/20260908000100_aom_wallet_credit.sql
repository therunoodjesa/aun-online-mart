-- AOM Credit is a closed-loop store credit ledger. It is never a cash balance:
-- only AOM's server-side functions may create or spend transactions.
create table if not exists public.aom_wallet_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  balance numeric(12,2) not null default 0 check (balance >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.aom_wallet_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  amount numeric(12,2) not null check (amount <> 0),
  kind text not null check (kind in ('refund_credit', 'goodwill_credit', 'promotion_credit', 'order_payment', 'reversal', 'expiry')),
  description text not null check (char_length(description) between 2 and 240),
  order_id uuid references public.orders(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz
);

alter table public.orders add column if not exists wallet_credit_applied numeric(12,2) not null default 0 check (wallet_credit_applied >= 0);

create index if not exists aom_wallet_transactions_user_created_idx on public.aom_wallet_transactions(user_id, created_at desc);
create index if not exists aom_wallet_transactions_order_idx on public.aom_wallet_transactions(order_id) where order_id is not null;

create or replace function public.apply_aom_wallet_transaction()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  next_balance numeric(12,2);
begin
  if new.amount > 0 and new.expires_at is not null and new.expires_at <= now() then
    raise exception 'Wallet credit expiry must be in the future.';
  end if;

  insert into public.aom_wallet_accounts (user_id, balance, updated_at)
  values (new.user_id, new.amount, now())
  on conflict (user_id) do update
    set balance = public.aom_wallet_accounts.balance + excluded.balance,
        updated_at = now()
    where public.aom_wallet_accounts.balance + excluded.balance >= 0
  returning balance into next_balance;

  if next_balance is null then
    raise exception 'AOM Credit balance is not enough for this order.';
  end if;
  return new;
end;
$$;

drop trigger if exists apply_aom_wallet_transaction on public.aom_wallet_transactions;
create trigger apply_aom_wallet_transaction
before insert on public.aom_wallet_transactions
for each row execute function public.apply_aom_wallet_transaction();

-- The ledger is append-only. Balances must always reconcile to its entries.
create or replace function public.block_aom_wallet_transaction_changes()
returns trigger language plpgsql as $$
begin
  raise exception 'AOM Credit transactions are immutable.';
end;
$$;
drop trigger if exists block_aom_wallet_transaction_changes on public.aom_wallet_transactions;
create trigger block_aom_wallet_transaction_changes
before update or delete on public.aom_wallet_transactions
for each row execute function public.block_aom_wallet_transaction_changes();

alter table public.aom_wallet_accounts enable row level security;
alter table public.aom_wallet_transactions enable row level security;

drop policy if exists "Customers can view their AOM Credit balance" on public.aom_wallet_accounts;
create policy "Customers can view their AOM Credit balance"
on public.aom_wallet_accounts for select to authenticated using (user_id = auth.uid());
drop policy if exists "Customers can view their AOM Credit history" on public.aom_wallet_transactions;
create policy "Customers can view their AOM Credit history"
on public.aom_wallet_transactions for select to authenticated using (user_id = auth.uid());

revoke insert, update, delete on public.aom_wallet_accounts from anon, authenticated;
revoke insert, update, delete on public.aom_wallet_transactions from anon, authenticated;

comment on table public.aom_wallet_transactions is 'Closed-loop AOM Credit history. Credits can be used on AOM only and cannot be withdrawn or transferred.';
