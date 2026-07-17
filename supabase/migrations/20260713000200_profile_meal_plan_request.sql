alter table public.profiles add column if not exists age integer check (age between 14 and 100);
alter table public.profiles add column if not exists school_year text;

alter table public.meal_plan_accounts add column if not exists requested_plan_count smallint check (requested_plan_count between 0 and 3);
alter table public.meal_plan_accounts add column if not exists request_status text not null default 'not_requested' check (request_status in ('not_requested', 'pending', 'approved', 'declined'));

create or replace function public.request_meal_plan(
  p_full_name text,
  p_age integer,
  p_school_year text,
  p_student_id text,
  p_requested_plan_count smallint
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if p_requested_plan_count not between 0 and 3 then raise exception 'Plan count must be between 0 and 3'; end if;

  update public.profiles
  set full_name = nullif(trim(p_full_name), ''), age = p_age, school_year = nullif(trim(p_school_year), ''), student_id = nullif(trim(p_student_id), '')
  where id = auth.uid();

  insert into public.meal_plan_accounts (user_id, requested_plan_count, request_status)
  values (auth.uid(), p_requested_plan_count, case when p_requested_plan_count > 0 then 'pending' else 'not_requested' end)
  on conflict (user_id) do update set
    requested_plan_count = excluded.requested_plan_count,
    request_status = case when excluded.requested_plan_count > 0 then 'pending' else 'not_requested' end,
    updated_at = now();
end;
$$;

grant execute on function public.request_meal_plan(text, integer, text, text, smallint) to authenticated;
