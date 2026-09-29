alter table public.company_settings
  add column if not exists email_signature_enabled boolean not null default true,
  add column if not exists email_signature_show_logo boolean not null default true,
  add column if not exists email_signoff text not null default 'Üdvözlettel,',
  add column if not exists email_signer_name text,
  add column if not exists email_signer_role text,
  add column if not exists email_phone text,
  add column if not exists email_website text,
  add column if not exists email_legal_text text;

alter table public.company_settings
  drop constraint if exists company_settings_email_signature_lengths;

alter table public.company_settings
  add constraint company_settings_email_signature_lengths check (
    char_length(email_signoff) between 1 and 100
    and char_length(coalesce(email_signer_name, '')) <= 120
    and char_length(coalesce(email_signer_role, '')) <= 120
    and char_length(coalesce(email_phone, '')) <= 80
    and char_length(coalesce(email_website, '')) <= 300
    and char_length(coalesce(email_legal_text, '')) <= 1000
  );
