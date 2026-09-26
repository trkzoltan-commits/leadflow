begin;

create or replace function public.provision_company(
  company_name text,
  company_slug text
)
returns table (id uuid, name text, public_slug text)
language plpgsql
security definer
set search_path = public
as $$
declare
  created_company public.companies%rowtype;
begin
  if company_name is null or length(btrim(company_name)) < 1 or length(btrim(company_name)) > 200 then
    raise exception 'invalid company name';
  end if;

  if company_slug is null
    or length(company_slug) < 3
    or length(company_slug) > 63
    or company_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
    raise exception 'invalid company slug';
  end if;

  insert into public.companies (name, public_slug)
  values (btrim(company_name), company_slug)
  returning * into created_company;

  insert into public.company_settings (company_id, auto_reply_mode)
  values (created_company.id, 'manual');

  insert into public.company_make_connections (company_id, mode, enabled)
  values (created_company.id, 'company', false);

  return query
  select created_company.id, created_company.name, created_company.public_slug;
end;
$$;

revoke all on function public.provision_company(text, text) from public, anon, authenticated;
grant execute on function public.provision_company(text, text) to service_role;

comment on function public.provision_company(text, text) is
  'Service-role-only atomic tenant provisioning. Creates company, manual settings and disabled company-owned Make routing.';

commit;
