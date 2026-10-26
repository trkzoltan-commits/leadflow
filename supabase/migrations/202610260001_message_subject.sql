begin;

alter table public.messages
  add column if not exists subject text;

alter table public.messages
  drop constraint if exists messages_subject_valid;

alter table public.messages
  add constraint messages_subject_valid check (
    subject is null
    or (
      char_length(btrim(subject)) between 1 and 200
      and subject !~ E'[\\r\\n]'
    )
  );

comment on column public.messages.subject is
  'Optional tenant-scoped outgoing e-mail subject. Legacy rows fall back to the company default at send time.';

commit;
