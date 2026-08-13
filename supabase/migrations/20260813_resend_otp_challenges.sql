create extension if not exists pgcrypto;

create table if not exists public.auth_otp_challenges (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  purpose text not null check (purpose in ('register','login','forgot_password','change_password','change_email')),
  code_hash text not null,
  payload jsonb not null default '{}'::jsonb,
  attempts integer not null default 0,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists auth_otp_challenges_lookup_idx
  on public.auth_otp_challenges (email, purpose, created_at desc);

alter table public.auth_otp_challenges enable row level security;
revoke all on public.auth_otp_challenges from anon, authenticated;
