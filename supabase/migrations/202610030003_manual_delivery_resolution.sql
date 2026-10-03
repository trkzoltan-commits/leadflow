alter table public.messages
  add column delivery_resolution_source text,
  add column delivery_resolved_by uuid;

alter table public.messages
  add constraint messages_delivery_resolution_source_valid
  check (delivery_resolution_source is null or delivery_resolution_source in ('make', 'manual'));

update public.messages
set delivery_resolution_source = 'make'
where delivery_confirmed_at is not null or delivery_failed_at is not null;

comment on column public.messages.delivery_resolution_source is
  'Whether the final delivery result came from the Make callback or manual verification.';
comment on column public.messages.delivery_resolved_by is
  'Authenticated user id that manually verified an uncertain delivery result.';

