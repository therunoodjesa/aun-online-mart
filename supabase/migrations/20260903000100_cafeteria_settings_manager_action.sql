-- Give cafeteria managers one reliable, audited path for changing buyer-facing
-- availability.  The portal calls this RPC instead of relying on a browser RLS
-- table update, which can fail silently when a policy/session changes.
create or replace function public.update_cafeteria_settings(
  p_is_accepting_orders boolean,
  p_snacks_open boolean,
  p_lunch_open boolean,
  p_dinner_open boolean,
  p_customer_notice text default null
)
returns public.cafeteria_settings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_settings public.cafeteria_settings;
begin
  if not exists (
    select 1
    from public.cafeteria_staff staff
    where staff.user_id = auth.uid()
      and staff.is_active
      and staff.role = 'manager'
  ) then
    raise exception 'Only an active cafeteria manager can change availability.';
  end if;

  insert into public.cafeteria_settings (
    id, is_accepting_orders, snacks_open, lunch_open, dinner_open,
    customer_notice, updated_by, updated_at
  ) values (
    true, p_is_accepting_orders, p_snacks_open, p_lunch_open, p_dinner_open,
    nullif(trim(coalesce(p_customer_notice, '')), ''), auth.uid(), now()
  )
  on conflict (id) do update set
    is_accepting_orders = excluded.is_accepting_orders,
    snacks_open = excluded.snacks_open,
    lunch_open = excluded.lunch_open,
    dinner_open = excluded.dinner_open,
    customer_notice = excluded.customer_notice,
    updated_by = auth.uid(),
    updated_at = now()
  returning * into v_settings;

  return v_settings;
end;
$$;

revoke all on function public.update_cafeteria_settings(boolean, boolean, boolean, boolean, text) from public;
grant execute on function public.update_cafeteria_settings(boolean, boolean, boolean, boolean, text) to authenticated;
