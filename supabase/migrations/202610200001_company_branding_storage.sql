insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'company-branding',
  'company-branding',
  true,
  2097152,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- Írás kizárólag a szerveroldali, service-role API-n keresztül történik.
-- A bucket nyilvános, mert a logó az ajánlatkérőn és a kimenő e-mailben is megjelenik.
