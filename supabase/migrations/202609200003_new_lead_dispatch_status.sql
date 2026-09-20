begin;

-- Historical leads remain null because their Make dispatch result is unknown.
alter table public.leads
  add column new_lead_dispatch_status text
  constraint leads_new_lead_dispatch_status_check
  check (new_lead_dispatch_status in ('pending', 'accepted', 'unconfigured', 'uncertain'));

comment on column public.leads.new_lead_dispatch_status is
  'Server-recorded Make dispatch result for a public lead. Accepted means Make acknowledged the webhook, not that processing completed.';

commit;
