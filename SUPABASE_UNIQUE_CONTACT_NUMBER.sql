-- PawCruz: one account per contact number (backend enforcement)
-- Blocks two profiles from sharing the same mobile number, for web and mobile alike.
-- 09XXXXXXXXX and +639XXXXXXXXX count as the same number.
-- Empty/null phones are ignored (Admin/Staff accounts may have none).
-- Run this in the Supabase SQL Editor (same project used by web and mobile).
-- Safe to run more than once.
--
-- If some existing accounts already share a number, nothing is changed:
-- the script lists those numbers under "Messages" instead. Fix or clear the
-- duplicate numbers on those accounts, then run this script again.

do $$
declare
  dup record;
  dup_count int := 0;
begin
  for dup in
    select regexp_replace(btrim(phone), '^\+63', '0') as contact_number,
           string_agg(coalesce(username, id::text), ', ') as accounts
    from public.profiles
    where phone is not null and btrim(phone) <> ''
    group by 1
    having count(*) > 1
  loop
    dup_count := dup_count + 1;
    raise notice 'Contact number % is used by: %', dup.contact_number, dup.accounts;
  end loop;

  if dup_count > 0 then
    raise notice '% contact number(s) are shared by more than one account. Unique rule NOT applied yet. Fix those accounts, then run this script again.', dup_count;
    return;
  end if;

  create unique index if not exists profiles_phone_unique
    on public.profiles (regexp_replace(btrim(phone), '^\+63', '0'))
    where phone is not null and btrim(phone) <> '';

  raise notice 'Done: each contact number can now belong to only one account.';
end $$;

notify pgrst, 'reload schema';
