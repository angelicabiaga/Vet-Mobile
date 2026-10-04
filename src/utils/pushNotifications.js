import { Platform } from 'react-native';
import Notifications from './notificationsModule';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { supabase } from '../config/supabaseClient';

// Foreground behavior only: the existing realtime toast + sound already
// covers the foreground case instantly, so suppress the system banner to
// avoid a duplicate alert. This has no effect while backgrounded/killed —
// the OS shows the push regardless of this handler.
Notifications?.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: false,
    shouldShowList: false,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

let lastRegisteredToken = null;

export async function registerForPushNotificationsAsync(profileId) {
  if (!profileId || Platform.OS === 'web' || !Notifications) return null;
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.HIGH,
      });
    }

    if (!Device.isDevice) return null;

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let status = existingStatus;
    if (status !== 'granted') {
      const requested = await Notifications.requestPermissionsAsync();
      status = requested.status;
    }
    if (status !== 'granted') return null;

    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    const { data: token } = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    );
    if (!token) return null;

    // Saved where the shared send-push Edge Function looks, so this phone gets
    // the same pushes as the web (appointments, messages, admin broadcasts).
    // One row per phone; logging in as someone else re-points it to them.
    const { error } = await supabase.from('push_subscriptions').upsert(
      {
        profile_id: profileId,
        kind: 'expo',
        token,
        keys: null,
        user_agent: `${Platform.OS} ${Device.modelName || ''}`.trim().slice(0, 250),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'token' },
    );
    if (error) throw error;

    // Drop this phone from the old push_tokens table so the older
    // send-push-notification webhook (if still enabled) can't push it twice.
    await supabase.from('push_tokens').delete().eq('expo_push_token', token);

    lastRegisteredToken = token;
    return token;
  } catch (error) {
    console.warn('Unable to register for push notifications:', error?.message);
    return null;
  }
}

export async function clearPushTokenForThisDevice() {
  if (!lastRegisteredToken) return;
  const token = lastRegisteredToken;
  lastRegisteredToken = null;
  try {
    await supabase.from('push_subscriptions').delete().eq('token', token);
  } catch {
    // best-effort cleanup; a stale token is harmless (edge function prunes it on send)
  }
}
