begin;

create table public.company_make_connections (
  company_id uuid primary key references public.companies(id) on delete cascade,
  mode text not null default 'company' check (mode in ('company', 'legacy')),
  enabled boolean not null default false,
  new_lead_webhook_url text,
  approved_reply_webhook_url text,
  created_at timestamptz not null default now()
);

alter table public.company_make_connections enable row level security;
revoke all on public.company_make_connections from public, anon, authenticated;
grant select, insert, update, delete on public.company_make_connections to service_role;

-- Preserve current pilot routing only for companies present at migration time.
-- New companies must be explicitly configured; there is no shared fallback.
insert into public.company_make_connections (company_id, mode, enabled)
select id, 'legacy', true from public.companies;

comment on table public.company_make_connections is
  'Server-only Make webhook routing. URLs are secrets; never expose to browsers or logs.';

commit;
