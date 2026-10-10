import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import VetShell, { getVetUser } from './VetShell';
import { useLowerHeaderMotion } from './useLowerHeaderMotion';
import {
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  subscribeNotifications,
} from '../../../api/notificationService';
import { getStoredSession } from '../../../api/authService';
import { MarkAllReadButton, NotificationCard, NotificationEmpty } from '../../../components/NotificationCard';

// Where tapping a notification takes the veterinarian, by its related module.
// Modules not listed (announcements, queue, etc.) just mark it read.
const ROUTE_BY_MODULE = {
  appointments: 'VetAppointment',
  messages: 'VetMessages',
  'my schedule': 'VetSchedule',
  'veterinarian schedules': 'VetSchedule',
  inventory: 'VetInventory',
  account: 'VetProfile',
};
const routeForNotification = (item) => ROUTE_BY_MODULE[String(item?.related_module || '').trim().toLowerCase()] || null;

const VetNotif = ({ navigation, route }) => {
  const { scrollViewRef, lowerHeaderAnimation, handleScroll } = useLowerHeaderMotion();
  const routeUser = getVetUser(route);
  const [user, setUser] = useState(routeUser);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const profileId = user?.id || null;

  useEffect(() => {
    if (routeUser?.id) return;
    let active = true;
    getStoredSession().then((session) => { if (active) setUser(session?.profile || session?.user || null); });
    return () => { active = false; };
  }, [routeUser?.id]);

  const load = useCallback(async (main = true) => {
    if (!profileId) { setItems([]); setLoading(false); return; }
    try {
      if (main) setLoading(true); else setRefreshing(true);
      setError('');
      setItems(await getNotifications(profileId));
    } catch (e) {
      setError(e?.message || 'Unable to load notifications.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [profileId]);

  useEffect(() => {
    if (!profileId) return undefined;
    let active = true;
    load(true);
    const unsubscribe = subscribeNotifications(profileId, {
      onChange: async () => {
        if (!active) return;
        try {
          const rows = await getNotifications(profileId);
          if (active) setItems(rows || []);
        } catch (realtimeError) {
          console.warn('Vet notification realtime refresh failed:', realtimeError?.message || realtimeError);
        }
      },
    });
    const fallback = setInterval(() => load(false), 30000);
    return () => { active = false; clearInterval(fallback); unsubscribe?.(); };
  }, [profileId, load]);

  const unreadCount = useMemo(() => items.filter((item) => !item.is_read).length, [items]);

  const markRead = async (item) => {
    if (!item?.id || item.is_read) return;
    try {
      await markNotificationRead(item.id);
      setItems((current) => current.map((row) => row.id === item.id ? { ...row, is_read: true, read_at: new Date().toISOString() } : row));
    } catch (e) { setError(e?.message || 'Unable to mark notification as read.'); }
  };

  // Mark read, then open the related screen (a message opens its chat).
  const openNotification = (item) => {
    markRead(item);
    const routeName = routeForNotification(item);
    if (!routeName) return;
    const params = { ...(user ? { user } : {}) };
    if (routeName === 'VetMessages' && item.related_record) params.conversationId = item.related_record;
    navigation.navigate(routeName, params);
  };

  const markAll = async () => {
    if (!profileId || unreadCount === 0) return;
    try {
      await markAllNotificationsRead(profileId);
      const readAt = new Date().toISOString();
      setItems((current) => current.map((row) => ({ ...row, is_read: true, read_at: row.read_at || readAt })));
    } catch (e) { setError(e?.message || 'Unable to mark all notifications as read.'); }
  };

  return (
    <VetShell navigation={navigation} route={{ ...route, params: { ...(route?.params || {}), user: user || routeUser } }} subtitle="Notifications" caption={unreadCount ? `${unreadCount} unread notification${unreadCount === 1 ? '' : 's'}` : 'You are all caught up'} lowerHeaderAnimation={lowerHeaderAnimation}>
      <ScrollView
        ref={scrollViewRef}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(false)} />}
      >
        <MarkAllReadButton unreadCount={unreadCount} onPress={markAll} />

        {error ? <View style={styles.errorCard}><Text style={styles.errorText}>{error}</Text></View> : null}

        {loading ? (
          <View style={styles.loadingWrap}><ActivityIndicator size="large" color="#2c6ba3" /><Text style={styles.loadingText}>Loading notifications...</Text></View>
        ) : items.length ? items.map((notif) => (
          <NotificationCard key={notif.id} notification={notif} onPress={() => openNotification(notif)} />
        )) : (
          <NotificationEmpty text="Appointments, messages, queue updates, and other clinic alerts will appear here automatically." />
        )}
      </ScrollView>
    </VetShell>
  );
};

const styles = StyleSheet.create({
  scrollContent: { paddingHorizontal: 18, paddingTop: 8, paddingBottom: 120 },
  errorCard: { backgroundColor: '#fff0ee', borderRadius: 14, padding: 12, marginBottom: 12 },
  errorText: { color: '#b44b3d', fontWeight: '700' },
  loadingWrap: { paddingVertical: 48, alignItems: 'center' },
  loadingText: { marginTop: 12, color: '#5d7b91', fontWeight: '700' },
});

export default VetNotif;
