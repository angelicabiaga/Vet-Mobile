-- PawCruz: Pet Owner Profile validation (backend enforcement)
-- Matches the mobile + web app-level checks:
--   - Profile avatar and pet photo uploads: JPG/JPEG/PNG/WEBP only, 25 MB max.
--   - Pet Owner accounts: full name must include a first and last name,
--     contact number must be a valid Philippine mobile number
--     (09XXXXXXXXX or +639XXXXXXXXX), and address must not be empty.
-- Run this in the Supabase SQL Editor. Safe to run more than once.

-- 1) Storage: enforce image-only uploads up to 25 MB on the avatar and pet-photo buckets.
update storage.buckets
set file_size_limit = 26214400, -- 25 MB
    allowed_mime_types = array['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
where id in ('profile-avatars', 'pet-photos');

-- 2) Profiles: require first + last name and a valid PH mobile number, scoped to
--    role = pet_owner only, so Admin/Staff/Veterinarian profiles are unaffected.
--    NOT VALID skips checking existing rows (some pet owners never had a phone
--    number on file); it still applies to every future insert/update, which
--    matches the app-level rule that already blocks those saves client-side.
alter table public.profiles
  drop constraint if exists pet_owner_full_name_required;
alter table public.profiles
  add constraint pet_owner_full_name_required
  check (
    lower(role::text) <> 'pet_owner'
    or (full_name is not null and full_name ~ '\S+\s+\S+')
  ) not valid;

alter table public.profiles
  drop constraint if exists pet_owner_phone_format;
alter table public.profiles
  add constraint pet_owner_phone_format
  check (
    lower(role::text) <> 'pet_owner'
    or (phone is not null and phone ~ '^(09[0-9]{9}|\+639[0-9]{9})$')
  ) not valid;

alter table public.profiles
  drop constraint if exists pet_owner_address_required;
alter table public.profiles
  add constraint pet_owner_address_required
  check (
    lower(role::text) <> 'pet_owner'
    or (address is not null and length(trim(address)) > 0)
  ) not valid;

notify pgrst, 'reload schema';
