import { Platform } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';

// Expo Go on Android no longer supports push notifications (removed in SDK 53),
// and on SDK 57 merely importing expo-notifications there throws at startup.
// So the module is only loaded where it works: installed/development builds,
// iOS, and web. Everywhere else this is null and push features are skipped.
// (In-app notification popups use Supabase realtime and keep working.)
const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
export const pushNotificationsSupported = !(isExpoGo && Platform.OS === 'android');

// eslint-disable-next-line global-require
const Notifications = pushNotificationsSupported ? require('expo-notifications') : null;

export default Notifications;
