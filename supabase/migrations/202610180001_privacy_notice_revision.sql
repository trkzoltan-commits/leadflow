begin;

create or replace function public.set_privacy_notice_revision_timestamp()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.privacy_notice_updated_at = now();
  elsif new.privacy_notice_enabled is distinct from old.privacy_notice_enabled
     or new.privacy_contact_email is distinct from old.privacy_contact_email
     or new.privacy_company_address is distinct from old.privacy_company_address
     or new.privacy_retention_months is distinct from old.privacy_retention_months then
    new.privacy_notice_updated_at = now();
  end if;
  return new;
end;
$$;

drop trigger if exists set_privacy_notice_revision_timestamp on public.company_settings;
create trigger set_privacy_notice_revision_timestamp
before insert or update of
  privacy_notice_enabled,
  privacy_contact_email,
  privacy_company_address,
  privacy_retention_months
on public.company_settings
for each row execute function public.set_privacy_notice_revision_timestamp();

create or replace function public.touch_privacy_notice_on_company_name_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.name is distinct from old.name then
    update public.company_settings
      set privacy_notice_updated_at = now()
      where company_id = new.id;
  end if;
  return new;
end;
$$;

revoke all on function public.touch_privacy_notice_on_company_name_change() from public;
revoke all on function public.touch_privacy_notice_on_company_name_change() from anon;
revoke all on function public.touch_privacy_notice_on_company_name_change() from authenticated;

drop trigger if exists touch_privacy_notice_on_company_name_change on public.companies;
create trigger touch_privacy_notice_on_company_name_change
after update of name on public.companies
for each row execute function public.touch_privacy_notice_on_company_name_change();

commit;
