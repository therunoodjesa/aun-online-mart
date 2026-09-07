-- Reorder a vendor's entire catalogue in one transaction. Updating the rows
-- one-by-one from the portal could leave a partially reordered list whenever
-- an individual request failed or arrived out of order.
create or replace function public.reorder_vendor_product(
  p_product_id uuid,
  p_target_position integer
)
returns table (id uuid, sort_order integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_vendor_id uuid;
begin
  select vendor_id into v_vendor_id
  from public.products
  where id = p_product_id;

  if v_vendor_id is null or not exists (
    select 1
    from public.vendors
    where id = v_vendor_id
      and owner_id = auth.uid()
  ) then
    raise exception 'You can only reorder products in your own store.';
  end if;

  return query
  with ordered as (
    select
      product.id,
      row_number() over (
        order by coalesce(product.sort_order, 2147483647), product.name, product.id
      )::integer as current_position
    from public.products as product
    where product.vendor_id = v_vendor_id
  ), positions as (
    select
      current_position as from_position,
      greatest(
        1,
        least(coalesce(p_target_position, current_position), (select count(*)::integer from ordered))
      ) as target_position
    from ordered
    where id = p_product_id
  ), reordered as (
    select
      ordered.id,
      case
        when ordered.id = p_product_id then positions.target_position
        when positions.from_position < positions.target_position
          and ordered.current_position > positions.from_position
          and ordered.current_position <= positions.target_position then ordered.current_position - 1
        when positions.from_position > positions.target_position
          and ordered.current_position >= positions.target_position
          and ordered.current_position < positions.from_position then ordered.current_position + 1
        else ordered.current_position
      end::integer as next_position
    from ordered
    cross join positions
  )
  update public.products as product
  set sort_order = reordered.next_position
  from reordered
  where product.id = reordered.id
  returning product.id, product.sort_order;
end;
$$;

grant execute on function public.reorder_vendor_product(uuid, integer) to authenticated;
