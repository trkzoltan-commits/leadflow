-- Company-wide settings are written through the authenticated server route.
-- The route enforces owner/admin roles and resolves company_id from the user profile.
revoke update on table public.company_settings from authenticated;

comment on table public.company_settings is
  'Tenant settings. Authenticated clients may read their RLS-scoped row; writes use the server API with owner/admin authorization.';
