# Notification Web <-> Mobile Sync

The web and mobile apps use the same Supabase `public.notifications` table.

Realtime events synchronized:
- INSERT: new notification appears on both web and mobile.
- UPDATE: read state (`is_read`, `read_at`) updates on both sides.
- DELETE: notification disappears on both sides.

Run `NOTIFICATIONS_WEB_MOBILE_TWO_WAY_SYNC.sql` once in Supabase SQL Editor.
