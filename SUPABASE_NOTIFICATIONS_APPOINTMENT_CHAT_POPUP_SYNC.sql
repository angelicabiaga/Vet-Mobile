-- PawCruz: appointment/chat pop-up notification support (sound + pop-up feature)
-- Run once in the Supabase SQL Editor. Safe to run more than once.
--
-- Context: notifications, appointments, and messages already publish to
-- supabase_realtime via earlier migrations (SUPABASE_NOTIFICATIONS_REALTIME_SYNC.sql,
-- NOTIFICATIONS_WEB_MOBILE_TWO_WAY_SYNC.sql, SUPABASE_APPOINTMENT_REALTIME_SYNC.sql,
-- SUPABASE_MESSAGES_WEB_MOBILE_REALTIME_SYNC.sql). The block below is a defensive
-- no-op if those tables are already in the publication.
do $$
begin
  begin
    alter publication supabase_realtime add table public.notifications;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.appointments;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.messages;
  exception when duplicate_object then null;
  end;
end $$;

-- Extend the existing owner-notify trigger (defined in
-- SUPABASE_APPOINTMENT_REALTIME_SYNC.sql, trg_notify_owner_appointment_change)
-- so a staff-entered cancellation reason (stored in appointments.notes by the
-- mobile app's staffCancelAppointment) is surfaced in the notification message.
-- No new column or trigger is needed — CREATE OR REPLACE on the function is
-- enough since the existing trigger already calls it by name.
create or replace function public.notify_owner_appointment_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and old.status is distinct from new.status then
    insert into public.notifications (
      recipient_id, title, message, notification_type,
      related_module, related_record, created_by
    ) values (
      new.owner_id,
      'Appointment ' || new.status,
      'Your appointment on ' || to_char(new.appointment_date, 'Mon DD, YYYY') ||
      ' at ' || to_char(new.start_time, 'HH12:MI AM') ||
      ' is now ' || new.status || '.' ||
      case
        when new.status = 'Cancelled' and new.notes is not null and length(trim(new.notes)) > 0
          then ' (' || new.notes || ')'
        else ''
      end,
      'Appointment',
      'Appointments',
      new.id,
      new.created_by
    );
  end if;
  return new;
end;
$$;

notify pgrst, 'reload schema';
