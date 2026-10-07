begin;

create unique index if not exists leads_company_id_id_unique
  on public.leads (company_id, id);

create table if not exists public.lead_notes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  lead_id uuid not null,
  author_user_id uuid not null,
  content text not null,
  created_at timestamptz not null default now(),
  constraint lead_notes_content_valid
    check (char_length(btrim(content)) between 1 and 2000),
  constraint lead_notes_company_lead_fk
    foreign key (company_id, lead_id)
    references public.leads (company_id, id)
    on update restrict
    on delete restrict,
  constraint lead_notes_company_author_fk
    foreign key (company_id, author_user_id)
    references public.users (company_id, id)
    on update restrict
    on delete restrict
);

create index if not exists lead_notes_company_lead_created_idx
  on public.lead_notes (company_id, lead_id, created_at desc);

create or replace function public.prepare_lead_note()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_company_id uuid;
begin
  new.content := btrim(new.content);

  if char_length(new.content) not between 1 and 2000 then
    raise exception 'A note must contain between 1 and 2000 characters.' using errcode = '23514';
  end if;

  if auth.role() = 'authenticated' then
    actor_company_id := public.current_company_id();
    if actor_company_id is null or auth.uid() is null then
      raise exception 'An active tenant membership is required.' using errcode = '42501';
    end if;

    new.company_id := actor_company_id;
    new.author_user_id := auth.uid();
    new.created_at := now();
  elsif coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'An authenticated actor is required.' using errcode = '42501';
  end if;

  return new;
end
$$;

revoke all on function public.prepare_lead_note() from public;

drop trigger if exists prepare_lead_note on public.lead_notes;
create trigger prepare_lead_note
before insert on public.lead_notes
for each row execute function public.prepare_lead_note();

alter table public.lead_notes enable row level security;

drop policy if exists "Active tenant members can read lead notes" on public.lead_notes;
create policy "Active tenant members can read lead notes"
on public.lead_notes
for select
to authenticated
using (company_id = public.current_company_id());

drop policy if exists "Active tenant members can create lead notes" on public.lead_notes;
create policy "Active tenant members can create lead notes"
on public.lead_notes
for insert
to authenticated
with check (
  company_id = public.current_company_id()
  and author_user_id = auth.uid()
);

revoke all on table public.lead_notes from public, anon, authenticated;
grant select, insert on table public.lead_notes to authenticated;

comment on table public.lead_notes is
  'Immutable tenant-internal lead notes. They are never included in AI, Make or customer email payloads.';

commit;
