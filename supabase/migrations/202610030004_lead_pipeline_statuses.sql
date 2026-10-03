alter table public.leads
  add constraint leads_pipeline_status_valid
  check (status in ('new', 'contacted', 'waiting', 'offer_sent', 'decision', 'processed'))
  not valid;

alter table public.leads validate constraint leads_pipeline_status_valid;

comment on constraint leads_pipeline_status_valid on public.leads is
  'Allowed stages shared by the lead list, detail page and pipeline.';

