# Appointment Realtime + Dashboard Track Activities Fix

Fixed:
- Appointment Realtime channel no longer reuses the same subscribed channel while form state changes.
- Appointment subscription is now stable for the logged-in owner.
- All Pet Owner module Appointment routes use `PetOwnerAppointment`.
- Dashboard queries load independently so one unavailable optional table cannot reset every Track Activities card to zero.
- Track Activities refresh from Supabase Realtime and also every 15 seconds as a fallback.
- Dashboard Realtime channels are safely removed with `supabase.removeChannel`.
