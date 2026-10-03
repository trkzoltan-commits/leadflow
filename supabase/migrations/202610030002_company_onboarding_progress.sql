create table if not exists public.company_onboarding_progress (
  company_id uuid primary key references public.companies(id) on delete cascade,
  owner_login_verified_at timestamptz,
  new_lead_flow_verified_at timestamptz,
  approved_reply_flow_verified_at timestamptz,
  tenant_isolation_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.company_onboarding_progress enable row level security;

revoke all on table public.company_onboarding_progress from public, anon, authenticated;
grant all on table public.company_onboarding_progress to service_role;

comment on table public.company_onboarding_progress is
  'Operator-confirmed pilot onboarding milestones. Server-side access only.';

