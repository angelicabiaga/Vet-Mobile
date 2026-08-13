# Vet Notification + Dashboard Alignment

- Veterinarian Notifications use the same `public.notifications` table as web and Pet Owner mobile.
- INSERT / UPDATE / DELETE changes refresh the Vet notification list from Supabase.
- The Vet header bell unread badge is now driven by the same realtime notifications.
- Mark one / Mark all read writes back to the shared database.
- Vet Dashboard now uses the same Pet Owner Dashboard visual system for:
  - hero card
  - Track Activities section
  - activity statistic cards
  - section titles/subtitles
  - service grid cards
  - colors, radius, spacing, icons and typography
- Vet-specific data and realtime functions remain unchanged.
