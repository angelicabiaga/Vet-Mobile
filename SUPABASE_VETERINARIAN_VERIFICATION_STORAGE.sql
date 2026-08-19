-- PawCruz: Veterinarian PRC ID verification storage bucket
-- The `veterinarian_verifications` table already exists (one row per veterinarian,
-- created earlier). This migration only adds the storage bucket the mobile app
-- uploads PRC ID / live face photos into for that existing table.
-- Run this in the Supabase SQL Editor. Safe to run more than once.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'veterinarian-verifications',
  'veterinarian-verifications',
  true,
  26214400, -- 25 MB, same image-upload limit used across the app
  array['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Mirrors the access model already used by the profile-avatars and pet-photos
-- buckets: this app has no Supabase Auth session (login is custom, against the
-- profiles table), so storage access is scoped per-bucket via the anon key
-- rather than per-user via auth.uid(). Restrict this policy to only this bucket.
drop policy if exists "veterinarian_verifications_access" on storage.objects;
create policy "veterinarian_verifications_access"
on storage.objects
for all
to public
using (bucket_id = 'veterinarian-verifications')
with check (bucket_id = 'veterinarian-verifications');

notify pgrst, 'reload schema';
