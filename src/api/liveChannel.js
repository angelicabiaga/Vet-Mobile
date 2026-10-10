import { AppState } from 'react-native';
import { supabase } from '../config/supabaseClient';

// A Supabase Realtime channel that heals itself. On a phone the live
// connection drops whenever the app is backgrounded, the screen sleeps or the
// network changes (status CHANNEL_ERROR / TIMED_OUT / CLOSED). That's normal,
// so instead of warning, this reconnects quietly with a growing delay
// (2s -> 30s), and straight away when the app returns to the foreground.
//
//   const stop = openLiveChannel('pawcruz-messages', (channel) =>
//     channel.on('postgres_changes', { ... }, handler));
//   ...
//   stop();
//
// onReconnected (optional) runs after a successful reconnect so the screen
// can reload anything it missed while offline.

const RETRY_BASE_MS = 2000;
const RETRY_MAX_MS = 30000;
const LOG_AFTER_FAILURES = 3;

export function openLiveChannel(label, configure, { onReconnected } = {}) {
  let channel = null;
  let retryTimer = null;
  let failures = 0;
  let closed = false;

  const drop = () => {
    const old = channel;
    channel = null;
    if (old) void supabase.removeChannel(old);
  };

  const connect = () => {
    if (closed) return;
    drop();
    const name = `${label}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const next = configure(supabase.channel(name));
    next.subscribe((status) => {
      if (closed || next !== channel) return;
      if (status === 'SUBSCRIBED') {
        if (failures > 0) onReconnected?.();
        failures = 0;
        return;
      }
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        failures += 1;
        if (failures === LOG_AFTER_FAILURES) console.log(`${label}: live updates are reconnecting.`);
        drop();
        if (!retryTimer) {
          retryTimer = setTimeout(() => {
            retryTimer = null;
            connect();
          }, Math.min(RETRY_BASE_MS * 2 ** (failures - 1), RETRY_MAX_MS));
        }
      }
    });
    channel = next;
  };

  const appState = AppState.addEventListener?.('change', (state) => {
    if (state !== 'active' || closed || (channel && failures === 0)) return;
    clearTimeout(retryTimer);
    retryTimer = null;
    connect();
  });

  connect();

  return () => {
    if (closed) return;
    closed = true;
    clearTimeout(retryTimer);
    appState?.remove?.();
    drop();
  };
}
