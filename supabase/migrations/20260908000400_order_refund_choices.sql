-- Customers choose how a confirmed cancellation should be refunded. Wallet
-- refunds are credited immediately; bank refunds remain a secure AOM task.
create table if not exists public.order_refund_requests (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  amount numeric(12,2) not null check (amount > 0),
  destination text not null check (destination in ('aom_credit', 'bank_transfer')),
  bank_name text,
  account_name text,
  account_number text,
  status text not null check (status in ('credited', 'pending_bank_transfer', 'paid', 'rejected')),
  created_at timestamptz not null default now(),
  processed_at timestamptz,
  processed_by uuid references auth.users(id) on delete set null,
  admin_note text
);

create index if not exists order_refund_requests_status_idx on public.order_refund_requests(status, created_at);
create index if not exists order_refund_requests_user_idx on public.order_refund_requests(user_id, created_at desc);

alter table public.order_refund_requests enable row level security;

drop policy if exists "Customers can view their refund requests" on public.order_refund_requests;
create policy "Customers can view their refund requests"
on public.order_refund_requests for select to authenticated
using (user_id = auth.uid());

drop policy if exists "Admins can manage refund requests" on public.order_refund_requests;
create policy "Admins can manage refund requests"
on public.order_refund_requests for all to authenticated
using (exists (select 1 from public.admin_users where user_id = auth.uid()))
with check (exists (select 1 from public.admin_users where user_id = auth.uid()));

comment on table public.order_refund_requests is 'Customer-selected refund destination. Bank details are visible only to the customer and authorised AOM administrators.';
