-- PawCruz: block email changes that skip OTP verification
-- After this runs, a profile's email can only be changed by the
-- `profile-email-change` Edge Function (after a correct OTP sent to the current
-- email) or by an administrator in the Supabase dashboard / SQL Editor.
-- A direct API update of `profiles.email` with the public key is rejected.
--
-- BEFORE RUNNING:
--   * Deploy the `profile-email-change` Edge Function and run
--     SUPABASE_PROFILE_USERNAME_EMAIL.sql first.
--   * The PawCruz WEB app shares this database. If the web app changes emails by
--     updating `profiles` directly, that will stop working until the web app
--     also uses the `profile-email-change` function. Registration (insert) is
--     not affected.
-- Safe to run more than once. To undo:
--   drop trigger if exists pawcruz_lock_profile_email on public.profiles;

create or replace function public.pawcruz_lock_profile_email()
returns trigger
language plpgsql
as $$
begin
  if lower(btrim(coalesce(new.email, ''))) is distinct from lower(btrim(coalesce(old.email, '')))
     and current_user in ('anon', 'authenticated') then
    raise exception 'Email address changes need verification. Use Edit Profile to change your email.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists pawcruz_lock_profile_email on public.profiles;
create trigger pawcruz_lock_profile_email
  before update of email on public.profiles
  for each row execute function public.pawcruz_lock_profile_email();
