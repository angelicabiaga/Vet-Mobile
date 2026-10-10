import { AppState } from 'react-native';
import { supabase } from '../config/supabaseClient';

export async function getNotifications(profileId) {
  if (!profileId) return [];

  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .or(`recipient_id.eq.${profileId},recipient_id.is.null`)
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) throw new Error(`Unable to load notifications: ${error.message}`);
  return data || [];
}

export async function markNotificationRead(id) {
  if (!id) return;
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq('id', id);

  if (error) throw new Error(`Unable to mark notification as read: ${error.message}`);
}

export async function markAllNotificationsRead(profileId) {
  if (!profileId) return;
  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true, read_at: new Date().toISOString() })
    .or(`recipient_id.eq.${profileId},recipient_id.is.null`);

  if (error) throw new Error(`Unable to mark notifications as read: ${error.message}`);
}

export async function createNotification({
  recipientId,
  type,
  title,
  message,
  relatedModule = null,
  relatedRecord = null,
  createdBy = null,
}) {
  if (!recipientId || !title) return null;
  const { data, error } = await supabase
    .from('notifications')
    .insert({
      recipient_id: recipientId,
      notification_type: type,
      title,
      message,
      related_module: relatedModule,
      related_record: relatedRecord,
      created_by: createdBy,
    })
    .select('*')
    .maybeSingle();

  if (error) {
    console.warn('Unable to create notification:', error.message);
    return null;
  }
  return data;
}

export async function notificationExists({ recipientId, type, relatedRecord }) {
  if (!recipientId || !relatedRecord) return false;
  const { data, error } = await supabase
    .from('notifications')
    .select('id')
    .eq('recipient_id', recipientId)
    .eq('notification_type', type)
    .eq('related_record', relatedRecord)
    .limit(1)
    .maybeSingle();

  if (error) return true;
  return Boolean(data);
}

function uniqueChannelName(profileId) {
  return `mobile-notifications-${profileId}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// The live connection drops whenever the phone switches network, sleeps, or the
// app is backgrounded (status CHANNEL_ERROR / TIMED_OUT). That's expected on
// mobile: reconnect quietly with a growing delay (2s → 30s max), straight away
// when the app comes back to the foreground, and refresh once reconnected so
// nothing missed while offline is lost.
const RETRY_BASE_MS = 2000;
const RETRY_MAX_MS = 30000;
// Only mention it in the log when reconnecting keeps failing.
const LOG_AFTER_FAILURES = 3;

// One shared live channel per user. Every screen that subscribes (the header
// badge, the notifications list, the in-app popups) adds its handlers to it,
// instead of opening its own channel to the same table.
const liveFeeds = new Map();

function createFeed(profileId) {
  const feed = { listeners: new Set(), channel: null, retryTimer: null, failures: 0, appState: null, closed: false };

  const dispatch = (payload) => {
    feed.listeners.forEach((handlers) => {
      try {
        if (payload.eventType === 'INSERT') handlers.onInsert?.(payload.new);
        if (payload.eventType === 'UPDATE') handlers.onUpdate?.(payload.new);
        if (payload.eventType === 'DELETE') handlers.onDelete?.(payload.old);
        handlers.onChange?.(payload);
      } catch (error) {
        console.warn('Notification handler failed:', error?.message || error);
      }
    });
  };

  const scheduleReconnect = (delay) => {
    if (feed.closed || feed.retryTimer) return;
    feed.retryTimer = setTimeout(() => {
      feed.retryTimer = null;
      connect();
    }, delay);
  };

  const dropChannel = () => {
    const old = feed.channel;
    feed.channel = null;
    if (old) void supabase.removeChannel(old);
  };

  const connect = () => {
    if (feed.closed) return;
    dropChannel();
    const channel = supabase
      .channel(uniqueChannelName(profileId))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications' }, (payload) => {
        const item = payload.new || payload.old;
        if (!item) return;
        if (item.recipient_id && item.recipient_id !== profileId) return;
        dispatch(payload);
      })
      .subscribe((status) => {
        if (feed.closed || channel !== feed.channel) return;
        if (status === 'SUBSCRIBED') {
          if (feed.failures > 0) dispatch({ eventType: 'RECONNECTED' });
          feed.failures = 0;
          return;
        }
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          feed.failures += 1;
          if (feed.failures === LOG_AFTER_FAILURES) {
            console.log('Notification live updates are reconnecting; the list still refreshes in the background.');
          }
          dropChannel();
          scheduleReconnect(Math.min(RETRY_BASE_MS * 2 ** (feed.failures - 1), RETRY_MAX_MS));
        }
      });
    feed.channel = channel;
  };

  // Back in the foreground: reconnect now instead of waiting for the timer.
  feed.appState = AppState.addEventListener?.('change', (state) => {
    if (state !== 'active' || feed.closed) return;
    if (!feed.channel || feed.failures > 0) {
      clearTimeout(feed.retryTimer);
      feed.retryTimer = null;
      connect();
    }
  });

  feed.close = () => {
    feed.closed = true;
    clearTimeout(feed.retryTimer);
    feed.appState?.remove?.();
    dropChannel();
  };

  connect();
  return feed;
}

export function subscribeNotifications(profileId, handlers = {}) {
  if (!profileId) return () => {};
  const key = String(profileId);
  let feed = liveFeeds.get(key);
  if (!feed) {
    feed = createFeed(profileId);
    liveFeeds.set(key, feed);
  }
  const listener = { ...handlers };
  feed.listeners.add(listener);

  let removed = false;
  return () => {
    if (removed) return;
    removed = true;
    feed.listeners.delete(listener);
    if (!feed.listeners.size) {
      feed.close();
      liveFeeds.delete(key);
    }
  };
}

export function formatNotificationTime(value) {
  if (!value) return 'Just now';
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return 'Just now';
  const diff = Math.max(0, Date.now() - time);
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (diff < minute) return 'Just now';
  if (diff < hour) return `${Math.floor(diff / minute)}m ago`;
  if (diff < day) return `${Math.floor(diff / hour)}h ago`;
  if (diff < 7 * day) return `${Math.floor(diff / day)}d ago`;
  return new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function notificationAccent(type) {
  const value = String(type || '').toLowerCase();
  if (value.includes('queue')) return '#39b36b';
  if (value.includes('message')) return '#3a7ab8';
  if (value.includes('appointment')) return '#2f9af0';
  if (value.includes('stock') || value.includes('inventory')) return '#f2a65a';
  if (value.includes('alert') || value.includes('security')) return '#f47c6b';
  if (value.includes('broadcast') || value.includes('announcement')) return '#7b8fc7';
  return '#2c6ba3';
}
