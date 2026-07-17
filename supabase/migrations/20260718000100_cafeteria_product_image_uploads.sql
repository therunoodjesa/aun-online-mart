-- Allow only active cafeteria managers to add product photos to the existing public product-images bucket.
create policy "Cafeteria managers can upload product images"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'product-images'
  and exists (
    select 1
    from public.cafeteria_staff staff
    where staff.user_id = auth.uid()
      and staff.role = 'manager'
      and staff.is_active = true
  )
);
