begin;

alter table public.messages add column sending_started_at timestamptz;

-- Their original send start is unknown; start the warning clock at migration time.
update public.messages
set sending_started_at = now()
where status = 'sending' and sending_started_at is null;

create or replace function public.set_message_sending_started_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status = 'sending' then
    if tg_op = 'INSERT' then
      new.sending_started_at = now();
    elsif old.status is distinct from 'sending' then
      new.sending_started_at = now();
    end if;
  end if;
  return new;
end;
$$;

create trigger set_message_sending_started_at
before insert or update of status on public.messages
for each row execute function public.set_message_sending_started_at();

commit;
