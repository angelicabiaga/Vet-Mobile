import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { supabase } from '../config/supabaseClient';

// Foreground behavior only: the existing realtime toast + sound already
// covers the foreground case instantly, so suppress the system banner to
// avoid a duplicate alert. This has no effect while backgrounded/killed —
// the OS shows the push regardless of this handler.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: false,
    shouldShowList: false,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

let lastRegisteredToken = null;

export async function registerForPushNotificationsAsync(profileId) {
  if (!profileId) return null;
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

    lastRegisteredToken = token;
    const now = new Date().toISOString();
    await supabase.from('push_tokens').upsert(
      {
        profile_id: profileId,
        expo_push_token: token,
        platform: Platform.OS,
        device_name: Device.deviceName || null,
        updated_at: now,
        last_seen_at: now,
      },
      { onConflict: 'expo_push_token' },
    );
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
    await supabase.from('push_tokens').delete().eq('expo_push_token', token);
  } catch {
    // best-effort cleanup; a stale token is harmless (edge function prunes it on send)
  }
}
