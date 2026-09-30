alter table public.company_settings
  add column if not exists email_address text;

alter table public.company_settings
  drop constraint if exists company_settings_email_address_length;

alter table public.company_settings
  add constraint company_settings_email_address_length check (
    char_length(coalesce(email_address, '')) <= 254
  );
