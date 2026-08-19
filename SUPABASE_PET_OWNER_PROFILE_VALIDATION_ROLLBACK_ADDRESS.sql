-- PawCruz: undo the pet-owner Address-required constraint
-- Run this in the Supabase SQL Editor. Safe to run more than once.

alter table public.profiles
  drop constraint if exists pet_owner_address_required;

notify pgrst, 'reload schema';
