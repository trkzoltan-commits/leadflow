begin;

create table public.automation_dispatches (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  event_type text not null check (event_type in ('new_lead', 'approved_reply')),
  entity_id uuid not null,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'uncertain', 'failed', 'completed', 'unconfigured')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  last_attempt_at timestamptz,
  last_http_status integer check (last_http_status between 100 and 599),
  last_error_code text check (last_error_code in ('network', 'http', 'unconfigured', 'callback_failed')),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_type, entity_id)
);

create index automation_dispatches_company_status_idx
  on public.automation_dispatches (company_id, status, updated_at desc);

alter table public.automation_dispatches enable row level security;

-- Operational delivery records are server-only. Partner pages continue to read
-- the safe summary fields already present on leads and messages.
revoke all on public.automation_dispatches from public, anon, authenticated;

comment on table public.automation_dispatches is
  'Server-only audit trail for LeadFlow to Make dispatch attempts. Contains no webhook URL or message body.';

commit;
