-- Apply before provisioning any customer-owned Make connection.
-- Assumes public.companies.id is UUID; verify against the live schema first.
begin;

create table public.make_credentials (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

create index make_credentials_company_idx on public.make_credentials(company_id);
alter table public.make_credentials enable row level security;
revoke all on public.make_credentials from public, anon, authenticated;
grant select, insert, update, delete on public.make_credentials to service_role;

comment on table public.make_credentials is
  'Server-only Make credential hashes. No browser access or plaintext tokens.';

commit;
