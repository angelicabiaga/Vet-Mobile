-- PawCruz: editable username + OTP-verified email change (Pet Owner Edit Profile)
-- Used by the mobile app and the `profile-email-change` Edge Function
-- (backend/supabase/functions/profile-email-change/index.ts).
--   1) Pending email-change codes, readable only by the Edge Function.
--   2) Usernames and emails are unique across all accounts (case-insensitive).
-- Run this in the Supabase SQL Editor. Safe to run more than once.
-- Existing data was checked on 2026-10-08: no duplicate usernames or emails.

-- 1) Email-change codes. Only a hash of the code is stored. RLS is on and the
--    public API roles get no access, so only the Edge Function (service role)
--    can read or write it. This is the one table that deliberately does NOT
--    follow the project's permissive-policy convention.
create table if not exists public.profile_email_change_challenges (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  sent_to text not null,          -- the CURRENT email the code was sent to
  new_email text not null,
  new_username text,              -- set when the username changes in the same save
  code_hash text not null,
  attempts integer not null default 0,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists profile_email_change_challenges_profile_idx
  on public.profile_email_change_challenges (profile_id, created_at desc);

alter table public.profile_email_change_challenges enable row level security;
revoke all on public.profile_email_change_challenges from anon, authenticated;

-- 2) No two accounts share a username or an email, whatever the letter case.
create unique index if not exists profiles_username_unique_ci
  on public.profiles (lower(btrim(username)))
  where username is not null and btrim(username) <> '';

create unique index if not exists profiles_email_unique_ci
  on public.profiles (lower(btrim(email)))
  where email is not null and btrim(email) <> '';
