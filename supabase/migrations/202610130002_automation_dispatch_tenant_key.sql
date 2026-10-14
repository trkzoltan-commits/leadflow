begin;

-- Expand first: keep the legacy key while the previously deployed application
-- still uses it as its upsert conflict target. Re-running this migration also
-- restores that key if an earlier draft of the migration removed it.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.automation_dispatches'::regclass
      and conname = 'automation_dispatches_event_type_entity_id_key'
  ) then
    alter table public.automation_dispatches
      add constraint automation_dispatches_event_type_entity_id_key
      unique (event_type, entity_id);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.automation_dispatches'::regclass
      and conname = 'automation_dispatches_company_event_entity_key'
  ) then
    alter table public.automation_dispatches
      add constraint automation_dispatches_company_event_entity_key
      unique (company_id, event_type, entity_id);
  end if;
end
$$;

create index if not exists automation_dispatches_company_event_status_completed_idx
  on public.automation_dispatches (company_id, event_type, status, completed_at desc);

create index if not exists leads_company_status_created_idx
  on public.leads (company_id, status, created_at, id);

create index if not exists messages_company_direction_lead_created_idx
  on public.messages (company_id, direction, lead_id, created_at, id);

comment on constraint automation_dispatches_company_event_entity_key
  on public.automation_dispatches is
  'Dispatch identity is scoped to one tenant before event and entity identifiers are compared.';

commit;
