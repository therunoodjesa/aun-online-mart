create table if not exists public.order_rejection_requests (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders(id) on delete cascade,
  vendor_id uuid not null references public.vendors(id) on delete cascade,
  reason text not null check (reason in ('out_of_stock', 'store_closed', 'cannot_meet_request', 'preparation_time', 'other')),
  other_reason text,
  alternative_products jsonb not null default '[]'::jsonb,
  selected_product_id uuid references public.products(id) on delete set null,
  selected_product_name text,
  status text not null default 'pending_customer' check (status in ('pending_customer', 'replacement_selected', 'cancelled')),
  created_at timestamptz not null default now(),
  responded_at timestamptz
);

create index if not exists order_rejection_requests_vendor_idx
  on public.order_rejection_requests (vendor_id, status, created_at desc);

alter table public.order_rejection_requests enable row level security;

drop policy if exists "Buyers can view their order replacement requests" on public.order_rejection_requests;
create policy "Buyers can view their order replacement requests"
on public.order_rejection_requests for select to authenticated
using (exists (select 1 from public.orders o where o.id = order_rejection_requests.order_id and o.user_id = auth.uid()));

drop policy if exists "Vendors can view their replacement requests" on public.order_rejection_requests;
create policy "Vendors can view their replacement requests"
on public.order_rejection_requests for select to authenticated
using (exists (select 1 from public.vendors v where v.id = order_rejection_requests.vendor_id and v.owner_id = auth.uid()));

comment on table public.order_rejection_requests is
  'Vendor rejection reasons and buyer replacement choices. A cancelled request requires the AOM team to process a manual refund.';
