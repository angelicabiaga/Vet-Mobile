# Push notifications (background/killed-app delivery)

Notifications now reach the device as real OS push notifications, not just the
in-app toast — they arrive even when PawCruz Mobile is backgrounded or fully
closed.

## Why Expo Go can't be used for this

Since Expo SDK 53, Expo Go no longer supports remote (push) notifications on
Android or iOS — only local notifications work there. This project is on SDK
54, so the same limitation applies. `expo-notifications` needs a native build,
the same kind already produced with `eas build` / the deployed APK. There is
no workaround for testing remote push inside Expo Go itself.

## What changed in the app

- `src/utils/pushNotifications.js` — registers the device for an Expo push
  token after login and stores it in `push_subscriptions` (kind `expo`), the
  same table the web's `send-push` Edge Function reads; clears it on logout.
  It also removes the token from the older `push_tokens` table so the old
  webhook can't send a duplicate.
- `src/providers/NotificationProvider.js` — registers the push token
  alongside the existing realtime subscription, and now also handles taps on
  a push notification (including cold-starting the app from a killed state)
  by reusing the existing route-resolution logic.
- `src/api/authService.js` — `logoutUser()` removes this device's token so a
  signed-out phone stops receiving that account's notifications.
- `app.json` — added the `expo-notifications` config plugin.

## Supabase setup — current (shared with web)

The backend now lives in the web project (`final-vet`):
`supabase/functions/send-push` plus `supabase/PUSH_NOTIFICATIONS_SETUP.sql`
(creates `push_subscriptions` and the `trg_pawcruz_queue_push` trigger).
Once that is deployed, delete the old `send-push-notification` webhook
(Database → Webhooks) so nothing is pushed twice.

## Old Supabase setup (superseded, kept for reference)

1. **Create the `push_tokens` table.** Paste `SUPABASE_PUSH_NOTIFICATIONS_SETUP.sql`
   into the Supabase SQL editor and run it.
2. **Deploy the edge function** that actually sends the push, from `backend/supabase`:
   ```
   supabase functions deploy send-push-notification
   ```
3. **Wire it to fire on every new notification.** In the Supabase Dashboard:
   Database → Webhooks → Create a new hook
   - Table: `notifications`
   - Events: `Insert`
   - Type: Supabase Edge Functions
   - Function: `send-push-notification`

   This is the same table both mobile and web already write to, so
   notifications created from the web admin also reach the phone.

## One-time app rebuild

`expo-notifications` is native code, so the app needs to be rebuilt once with
EAS (same as producing the current APK):

```
eas build --profile development   # or: preview / production
```

Install the result on a **physical device** — push notifications don't
reliably reach emulators/simulators. On the first Android build after adding
`expo-notifications`, EAS may offer to auto-generate/manage FCM push
credentials — accept the default unless you already run your own Firebase
project.

## Testing

1. Install the new build, log in, and confirm a row appears in `push_tokens`
   for that profile in Supabase.
2. Fully close the app, then trigger a notification (e.g. confirm/update an
   appointment as staff, or insert a row into `notifications` directly).
   A system push notification should appear.
3. Tap it — the app should open directly to the relevant appointment or
   messages screen.
4. Log out and confirm the device's row is removed from `push_tokens`.
