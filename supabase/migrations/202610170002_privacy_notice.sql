begin;

alter table public.company_settings
  add column if not exists privacy_notice_enabled boolean not null default false,
  add column if not exists privacy_contact_email text,
  add column if not exists privacy_company_address text,
  add column if not exists privacy_retention_months integer not null default 24,
  add column if not exists privacy_notice_updated_at timestamptz;

alter table public.leads
  add column if not exists privacy_notice_acknowledged_at timestamptz,
  add column if not exists privacy_notice_version text;

alter table public.company_settings
  drop constraint if exists company_settings_privacy_contact_email_length,
  add constraint company_settings_privacy_contact_email_length
    check (privacy_contact_email is null or char_length(privacy_contact_email) <= 254),
  drop constraint if exists company_settings_privacy_company_address_length,
  add constraint company_settings_privacy_company_address_length
    check (privacy_company_address is null or char_length(privacy_company_address) between 3 and 300),
  drop constraint if exists company_settings_privacy_retention_months_range,
  add constraint company_settings_privacy_retention_months_range
    check (privacy_retention_months between 1 and 120);

comment on column public.company_settings.privacy_notice_enabled is
  'Enables the tenant-specific public privacy notice and mandatory acknowledgement on the public lead form.';
comment on column public.leads.privacy_notice_version is
  'Snapshot identifier of the privacy notice acknowledged with this public submission.';

commit;
