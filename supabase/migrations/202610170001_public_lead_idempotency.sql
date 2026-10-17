begin;

alter table public.leads
  add column if not exists public_submission_id uuid;

create unique index if not exists leads_company_public_submission_key
  on public.leads (company_id, public_submission_id)
  where public_submission_id is not null;

comment on column public.leads.public_submission_id is
  'Browser-generated idempotency key. Repeated delivery of one public form submission must reuse the original lead.';

commit;
