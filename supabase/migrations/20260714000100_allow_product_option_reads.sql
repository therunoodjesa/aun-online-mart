-- Customers need read-only access to the available choices attached to a product.
-- Vendor/admin write permissions remain separate from this public policy.
alter table public.product_options enable row level security;

drop policy if exists "Customers can view available product options" on public.product_options;

create policy "Customers can view available product options"
on public.product_options
for select
to anon, authenticated
using (is_available = true);
