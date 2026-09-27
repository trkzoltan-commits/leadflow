create table public.user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  accent_theme text not null default 'blue' check (accent_theme in ('blue', 'green', 'orange')),
  color_mode text not null default 'system' check (color_mode in ('light', 'dark', 'system')),
  updated_at timestamptz not null default now()
);

alter table public.user_preferences enable row level security;

create policy "Users can read own preferences"
on public.user_preferences for select
to authenticated
using (user_id = auth.uid());

create policy "Users can create own preferences"
on public.user_preferences for insert
to authenticated
with check (user_id = auth.uid());

create policy "Users can update own preferences"
on public.user_preferences for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

revoke all on public.user_preferences from public, anon;
grant select, insert, update on public.user_preferences to authenticated;

comment on table public.user_preferences is
  'Per-user LeadFlow display preferences. RLS restricts every row to its authenticated user.';
