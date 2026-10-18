begin;

alter table public.leads
  add column if not exists anonymized_at timestamptz,
  add column if not exists closed_at timestamptz;

alter table public.company_settings
  add column if not exists privacy_retention_last_run_at timestamptz;

create index if not exists leads_company_retention_idx
  on public.leads (company_id, status, closed_at)
  where anonymized_at is null;

update public.leads
  set closed_at = coalesce(updated_at, created_at)
  where status = 'processed' and closed_at is null;

create or replace function public.track_lead_closed_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status = 'processed' and old.status is distinct from 'processed' then
    new.closed_at := now();
  elsif new.status is distinct from 'processed' and old.status = 'processed' then
    new.closed_at := null;
  end if;
  return new;
end;
$$;

revoke all on function public.track_lead_closed_at() from public;

drop trigger if exists track_lead_closed_at on public.leads;
create trigger track_lead_closed_at
before update of status on public.leads
for each row execute function public.track_lead_closed_at();

create or replace function public.protect_anonymized_lead()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.anonymized_at is not null then
    raise exception 'An anonymized lead is immutable.' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.protect_anonymized_lead() from public;

drop trigger if exists protect_anonymized_lead on public.leads;
create trigger protect_anonymized_lead
before update on public.leads
for each row execute function public.protect_anonymized_lead();

create or replace function public.reject_anonymized_lead_child_write()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if exists (
    select 1 from public.leads
      where company_id = new.company_id
        and id = new.lead_id
        and anonymized_at is not null
  ) then
    raise exception 'An anonymized lead cannot receive new content.' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.reject_anonymized_lead_child_write() from public;

drop trigger if exists reject_anonymized_message_write on public.messages;
create trigger reject_anonymized_message_write
before insert or update on public.messages
for each row execute function public.reject_anonymized_lead_child_write();

drop trigger if exists reject_anonymized_note_write on public.lead_notes;
create trigger reject_anonymized_note_write
before insert or update on public.lead_notes
for each row execute function public.reject_anonymized_lead_child_write();

create or replace function public.preview_company_data_retention(
  p_company_id uuid,
  p_now timestamptz default now()
)
returns table (
  cutoff_at timestamptz,
  retention_months integer,
  eligible_closed_count integer,
  active_review_count integer,
  anonymized_count integer,
  last_run_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_months integer;
  v_cutoff timestamptz;
  v_eligible integer;
  v_active integer;
  v_last_run timestamptz;
begin
  select privacy_retention_months, privacy_retention_last_run_at
    into v_months, v_last_run
    from public.company_settings
    where company_id = p_company_id;
  if v_months is null then
    raise exception 'Company retention settings are unavailable.' using errcode = 'P0002';
  end if;

  v_cutoff := p_now - make_interval(months => v_months);
  select count(*)::integer into v_eligible
    from public.leads
    where company_id = p_company_id
      and anonymized_at is null
      and status = 'processed'
      and coalesce(closed_at, created_at) < v_cutoff;
  select count(*)::integer into v_active
    from public.leads
    where company_id = p_company_id
      and anonymized_at is null
      and status is distinct from 'processed'
      and created_at < v_cutoff;

  return query select v_cutoff, v_months, v_eligible, v_active, 0, v_last_run;
end;
$$;

create or replace function public.apply_company_data_retention(
  p_company_id uuid,
  p_now timestamptz default now()
)
returns table (
  cutoff_at timestamptz,
  retention_months integer,
  eligible_closed_count integer,
  active_review_count integer,
  anonymized_count integer,
  last_run_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_months integer;
  v_cutoff timestamptz;
  v_lead_ids uuid[];
  v_eligible integer;
  v_active integer;
begin
  select privacy_retention_months
    into v_months
    from public.company_settings
    where company_id = p_company_id
    for update;
  if v_months is null then
    raise exception 'Company retention settings are unavailable.' using errcode = 'P0002';
  end if;

  v_cutoff := p_now - make_interval(months => v_months);
  select coalesce(array_agg(target.id), '{}'::uuid[])
    into v_lead_ids
    from (
      select id
        from public.leads
        where company_id = p_company_id
          and anonymized_at is null
          and status = 'processed'
          and coalesce(closed_at, created_at) < v_cutoff
        for update
    ) as target;
  v_eligible := cardinality(v_lead_ids);

  select count(*)::integer into v_active
    from public.leads
    where company_id = p_company_id
      and anonymized_at is null
      and status is distinct from 'processed'
      and created_at < v_cutoff;

  if v_eligible > 0 then
    delete from public.lead_notes
      where company_id = p_company_id and lead_id = any(v_lead_ids);
    delete from public.messages
      where company_id = p_company_id and lead_id = any(v_lead_ids);

    update public.leads
      set name = 'Anonimizált érdeklődő',
          email = null,
          phone = null,
          service = null,
          description = null,
          location = null,
          priority = null,
          assigned_user_id = null,
          next_action = null,
          next_action_due_date = null,
          ai_summary = null,
          ai_safe_to_send = null,
          ai_requires_human_review = null,
          ai_risk_level = null,
          ai_risk_reason = null,
          new_lead_dispatch_status = null,
          public_submission_id = null,
          privacy_notice_acknowledged_at = null,
          privacy_notice_version = null,
          anonymized_at = p_now,
          updated_at = p_now
      where company_id = p_company_id and id = any(v_lead_ids);
  end if;

  update public.company_settings
    set privacy_retention_last_run_at = p_now,
        updated_at = p_now
    where company_id = p_company_id;

  return query select v_cutoff, v_months, v_eligible, v_active, v_eligible, p_now;
end;
$$;

revoke all on function public.preview_company_data_retention(uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.apply_company_data_retention(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.preview_company_data_retention(uuid, timestamptz) to service_role;
grant execute on function public.apply_company_data_retention(uuid, timestamptz) to service_role;

comment on column public.leads.anonymized_at is
  'Timestamp when personal lead data, messages and notes were removed under the tenant retention policy.';
comment on column public.leads.closed_at is
  'Timestamp when the lead most recently entered the processed state; retention starts from this date.';
comment on function public.apply_company_data_retention(uuid, timestamptz) is
  'Server-only retention operation. Keeps aggregate reporting fields while removing expired personal data from closed leads.';

commit;
