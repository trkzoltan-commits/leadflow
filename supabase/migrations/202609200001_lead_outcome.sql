begin;

-- Existing processed leads keep an unknown outcome until someone records it.
alter table public.leads
  add column outcome text
  constraint leads_outcome_check check (outcome in ('won', 'lost'));

create or replace function public.require_lead_outcome_on_close()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status = 'processed' and new.outcome is null then
    if tg_op = 'INSERT' then
      raise exception 'A lezáráshoz meg kell adni az eredményt.';
    elsif old.status is distinct from 'processed' or old.outcome is not null then
      raise exception 'A lezáráshoz meg kell adni az eredményt.';
    end if;
  end if;
  return new;
end;
$$;

create trigger require_lead_outcome_on_close
before insert or update on public.leads
for each row execute function public.require_lead_outcome_on_close();

commit;
