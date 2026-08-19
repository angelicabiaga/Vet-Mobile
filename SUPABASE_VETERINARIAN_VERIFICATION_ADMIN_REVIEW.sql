-- PawCruz: Veterinarian PRC verification — private storage for Administrator review
-- Builds on SUPABASE_VETERINARIAN_VERIFICATION_STORAGE.sql (run that first if you
-- haven't already). This migration only tightens the storage bucket from public
-- to private now that an Administrator review screen reads these images.
-- Run this in the Supabase SQL Editor. Safe to run more than once.

update storage.buckets
set public = false
where id = 'veterinarian-verifications';

-- IMPORTANT LIMITATION: this app authenticates against the `profiles` table with
-- a custom username/password check, not Supabase Auth — every request (Pet Owner,
-- Veterinarian, Staff, Admin) reaches Supabase through the same shared anon API
-- key, so Postgres/Storage RLS has no per-user identity (auth.uid()) to key a true
-- "only the Admin role" policy on. Making this bucket private stops the files from
-- being reachable via a permanent public URL (the mobile app now uses short-lived
-- signed URLs instead), which is a real improvement, but it is NOT the same as
-- database-enforced role-based access control. The "Staff/other roles cannot
-- access verification files or controls" requirement is enforced at the app layer
-- instead: no Staff/Pet Owner/Veterinarian screen fetches, links to, or displays
-- these files or the approve/reject actions — only the new Administrator review
-- screen does. Achieving real per-role storage security would require adopting
-- Supabase Auth sessions app-wide, which is a larger change than this task covers.
drop policy if exists "veterinarian_verifications_access" on storage.objects;
create policy "veterinarian_verifications_access"
on storage.objects
for all
to public
using (bucket_id = 'veterinarian-verifications')
with check (bucket_id = 'veterinarian-verifications');

notify pgrst, 'reload schema';
