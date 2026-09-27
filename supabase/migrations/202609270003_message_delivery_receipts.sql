begin;

alter table public.messages
  add column provider_message_id text,
  add column delivery_confirmed_at timestamptz,
  add column delivery_failed_at timestamptz;

alter table public.messages
  add constraint messages_provider_message_id_format
  check (provider_message_id is null or provider_message_id ~ '^[A-Za-z0-9_-]{8,255}$');

create unique index messages_company_provider_message_id_unique
  on public.messages (company_id, provider_message_id)
  where provider_message_id is not null;

comment on column public.messages.provider_message_id is
  'Opaque Gmail message identifier returned by the customer-owned Make scenario. Never supplied by the browser.';
comment on column public.messages.delivery_confirmed_at is
  'Time when Make confirmed successful Gmail delivery submission.';
comment on column public.messages.delivery_failed_at is
  'Time when Make confirmed a definitive Gmail delivery failure.';

commit;
