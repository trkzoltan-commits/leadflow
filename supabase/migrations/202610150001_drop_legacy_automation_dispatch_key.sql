begin;

-- Contract only after the application has been deployed with the
-- (company_id, event_type, entity_id) conflict target. Fail closed if the
-- tenant-scoped constraint is missing for any reason.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.automation_dispatches'::regclass
      and conname = 'automation_dispatches_company_event_entity_key'
  ) then
    raise exception 'Tenant-scoped automation dispatch key is missing.';
  end if;
end
$$;

alter table public.automation_dispatches
  drop constraint if exists automation_dispatches_event_type_entity_id_key;

commit;
