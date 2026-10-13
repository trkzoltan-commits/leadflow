begin;

create or replace function public.current_company_lead_note_counts()
returns table (lead_id uuid, note_count bigint)
language sql
stable
security invoker
set search_path = pg_catalog
set row_security = on
as $$
  select ln.lead_id, count(*) as note_count
  from public.lead_notes as ln
  where ln.company_id = public.current_company_id()
  group by ln.lead_id
$$;

revoke all on function public.current_company_lead_note_counts() from public, anon, authenticated;
grant execute on function public.current_company_lead_note_counts() to authenticated;

comment on function public.current_company_lead_note_counts() is
  'Returns RLS-protected note counts for leads in the caller active tenant without exposing note contents.';

commit;
