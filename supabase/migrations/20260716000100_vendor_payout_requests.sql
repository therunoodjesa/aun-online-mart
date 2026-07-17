create table if not exists public.vendor_payout_requests (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendors(id) on delete cascade,
  amount numeric(12,2) not null check (amount > 0),
  order_ids uuid[] not null default '{}',
  status text not null default 'requested' check (status in ('requested', 'processing', 'paid', 'rejected')),
  reference text,
  requested_at timestamptz not null default now(),
  processed_at timestamptz,
  note text
);

create index if not exists vendor_payout_requests_vendor_requested_idx
  on public.vendor_payout_requests (vendor_id, requested_at desc);

alter table public.vendor_payout_requests enable row level security;

drop policy if exists "Vendors can view their payout requests" on public.vendor_payout_requests;
create policy "Vendors can view their payout requests"
  on public.vendor_payout_requests for select to authenticated
  using (exists (select 1 from public.vendors v where v.id = vendor_payout_requests.vendor_id and v.owner_id = auth.uid()));

drop policy if exists "Vendors can create their payout requests" on public.vendor_payout_requests;
create policy "Vendors can create their payout requests"
  on public.vendor_payout_requests for insert to authenticated
  with check (exists (select 1 from public.vendors v where v.id = vendor_payout_requests.vendor_id and v.owner_id = auth.uid()));
