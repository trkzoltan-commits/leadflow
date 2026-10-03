alter table public.users
  add column if not exists is_active boolean not null default true;

create or replace function public.current_company_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select company_id
  from public.users
  where id = auth.uid()
    and is_active = true
$$;

revoke all on function public.current_company_id() from public;
grant execute on function public.current_company_id() to authenticated;

comment on column public.users.is_active is
  'Tenant membership access switch. Inactive members keep their history but cannot resolve a tenant.';
