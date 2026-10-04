alter table public.leads
  add column if not exists assigned_user_id uuid;

alter table public.leads
  drop constraint if exists leads_company_assignee_fk;

drop index if exists public.users_company_id_id_unique;
create unique index users_company_id_id_unique
  on public.users (company_id, id);

alter table public.leads
  add constraint leads_company_assignee_fk
  foreign key (company_id, assigned_user_id)
  references public.users (company_id, id)
  on update restrict
  on delete restrict
  not valid;

alter table public.leads
  validate constraint leads_company_assignee_fk;

drop index if exists public.leads_company_assignee_idx;
create index leads_company_assignee_idx
  on public.leads (company_id, assigned_user_id)
  where assigned_user_id is not null;

create or replace function public.validate_lead_assignee_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  actor_role text := auth.role();
  assignment_changed boolean;
  company_changed boolean;
begin
  if tg_op = 'INSERT' then
    assignment_changed := new.assigned_user_id is not null;
    company_changed := false;
  else
    assignment_changed := new.assigned_user_id is distinct from old.assigned_user_id;
    company_changed := new.company_id is distinct from old.company_id;
  end if;

  if new.assigned_user_id is not null and not exists (
    select 1
    from public.users target
    where target.id = new.assigned_user_id
      and target.company_id = new.company_id
      and target.is_active = true
  ) then
    raise exception 'The selected lead assignee is unavailable.' using errcode = '23514';
  end if;

  if company_changed and coalesce(actor_role, '') <> 'service_role' then
    raise exception 'A lead tenant cannot be changed by an authenticated client.' using errcode = '42501';
  end if;

  if assignment_changed then
    if actor_id is null then
      if coalesce(actor_role, '') <> 'service_role' then
        raise exception 'A lead assignment requires an authenticated actor.' using errcode = '42501';
      end if;
    elsif not exists (
        select 1
        from public.users actor
        where actor.id = actor_id
          and actor.company_id = new.company_id
          and actor.is_active = true
          and actor.role in ('owner', 'admin')
      )
    then
      raise exception 'Only an owner or administrator can assign leads.' using errcode = '42501';
    end if;
  end if;

  return new;
end
$$;

revoke all on function public.validate_lead_assignee_change() from public;

drop trigger if exists validate_lead_assignee_change on public.leads;
create trigger validate_lead_assignee_change
before insert or update of assigned_user_id, company_id on public.leads
for each row execute function public.validate_lead_assignee_change();

comment on column public.leads.assigned_user_id is
  'Active tenant member responsible for the lead. Existing assignments remain when a member is deactivated.';
