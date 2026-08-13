-- PawCruz Veterinarian Notification Web <-> Mobile Realtime Sync
-- Run once in Supabase SQL Editor.

do $$
begin
  begin
    alter publication supabase_realtime add table public.notifications;
  exception when duplicate_object then null;
  end;
end $$;
