-- PawCruz Mobile push notifications (works when the app is backgrounded/closed)
-- Run once in Supabase SQL Editor. See PUSH_NOTIFICATIONS_SETUP.md for the full setup.

create table if not exists public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  expo_push_token text not null unique,
  platform text,
  device_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index if not exists push_tokens_profile_id_idx on public.push_tokens (profile_id);

-- This project uses its own `profiles` login/session rather than Supabase Auth
-- (see SUPABASE_MESSAGES_ALL_USERS_LIVE_SYNC_FIX.sql), so access is scoped
-- through the shared anon API key like the rest of the schema.
alter table public.push_tokens enable row level security;

drop policy if exists pawcruz_push_tokens_all_api on public.push_tokens;
create policy pawcruz_push_tokens_all_api on public.push_tokens
for all to anon, authenticated using (true) with check (true);

grant select, insert, update, delete on public.push_tokens to anon, authenticated;
