begin;

alter table public.leads
  add column if not exists next_action text,
  add column if not exists next_action_due_date date;

alter table public.leads
  drop constraint if exists leads_next_action_pair_valid;
alter table public.leads
  add constraint leads_next_action_pair_valid
  check ((next_action is null) = (next_action_due_date is null))
  not valid;

alter table public.leads
  drop constraint if exists leads_next_action_length_valid;
alter table public.leads
  add constraint leads_next_action_length_valid
  check (next_action is null or char_length(btrim(next_action)) between 1 and 300)
  not valid;

alter table public.leads validate constraint leads_next_action_pair_valid;
alter table public.leads validate constraint leads_next_action_length_valid;

drop index if exists public.leads_company_next_action_due_idx;
create index leads_company_next_action_due_idx
  on public.leads (company_id, next_action_due_date)
  where next_action_due_date is not null and status is distinct from 'processed';

create or replace function public.validate_lead_next_action_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  actor_role text := auth.role();
  task_changed boolean;
begin
  if new.status = 'processed' then
    new.next_action := null;
    new.next_action_due_date := null;
  end if;

  if new.next_action is not null then
    new.next_action := btrim(new.next_action);
  end if;

  if (new.next_action is null) <> (new.next_action_due_date is null) then
    raise exception 'A next action and its due date must be stored together.' using errcode = '23514';
  end if;

  if new.next_action is not null and char_length(new.next_action) not between 1 and 300 then
    raise exception 'The next action must contain between 1 and 300 characters.' using errcode = '23514';
  end if;

  if tg_op = 'INSERT' then
    task_changed := new.next_action is not null;
  else
    task_changed := new.next_action is distinct from old.next_action
      or new.next_action_due_date is distinct from old.next_action_due_date;
  end if;

  if task_changed then
    if actor_id is null then
      if coalesce(actor_role, '') <> 'service_role' then
        raise exception 'A next action change requires an authenticated actor.' using errcode = '42501';
      end if;
    elsif not exists (
      select 1
      from public.users actor
      where actor.id = actor_id
        and actor.company_id = new.company_id
        and actor.is_active = true
        and (actor.role in ('owner', 'admin') or new.assigned_user_id = actor_id)
    ) then
      raise exception 'Only the assignee, owner or administrator can change the next action.' using errcode = '42501';
    end if;
  end if;

  return new;
end
$$;

revoke all on function public.validate_lead_next_action_change() from public;

drop trigger if exists validate_lead_next_action_change on public.leads;
create trigger validate_lead_next_action_change
before insert or update of status, next_action, next_action_due_date on public.leads
for each row execute function public.validate_lead_next_action_change();

comment on column public.leads.next_action is
  'Current operational next step for an open lead. Cleared automatically when the lead is closed.';
comment on column public.leads.next_action_due_date is
  'Budapest business-calendar due date for next_action, without a time-of-day.';

commit;
