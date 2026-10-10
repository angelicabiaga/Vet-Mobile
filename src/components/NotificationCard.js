import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { formatNotificationTime } from '../api/notificationService';

// One notification design for every role (Veterinarian, Pet Owner): a blue
// stripe, the type as a pill, the time (with a red dot while unread), then
// the title and message. Read cards are slightly faded.
export function NotificationCard({ notification, onPress }) {
  const unread = !notification.is_read;
  return (
    <TouchableOpacity onPress={onPress} style={[styles.card, unread && styles.unreadCard]} activeOpacity={0.9}>
      <View style={styles.accentBar} />
      <View style={[styles.content, !unread && styles.readContent]}>
        <View style={styles.metaRow}>
          <View style={styles.typePill}>
            <Text style={styles.typeText} numberOfLines={1}>{notification.notification_type || 'Notification'}</Text>
          </View>
          <View style={styles.timeWrap}>
            {unread ? <View style={styles.unreadDot} /> : null}
            <Text style={[styles.time, unread && styles.timeUnread]}>{formatNotificationTime(notification.created_at)}</Text>
          </View>
        </View>
        <Text style={styles.title}>{notification.title || 'PawCruz Notification'}</Text>
        {notification.message ? <Text style={styles.message}>{notification.message}</Text> : null}
      </View>
    </TouchableOpacity>
  );
}

// Right-aligned "Mark all read" above the list.
export function MarkAllReadButton({ unreadCount, onPress }) {
  const disabled = unreadCount === 0;
  return (
    <View style={styles.toolbar}>
      <TouchableOpacity disabled={disabled} onPress={onPress} style={[styles.readAllButton, disabled && styles.readAllDisabled]}>
        <Text style={[styles.readAllText, disabled && styles.readAllTextDisabled]}>Mark all read</Text>
      </TouchableOpacity>
    </View>
  );
}

export function NotificationEmpty({ text }) {
  return (
    <View style={styles.emptyCard}>
      <Text style={styles.emptyTitle}>No notifications yet</Text>
      <Text style={styles.emptyText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  toolbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', marginBottom: 14 },
  readAllButton: { backgroundColor: '#2c6ba3', paddingHorizontal: 11, paddingVertical: 9, borderRadius: 13 },
  readAllDisabled: { backgroundColor: '#dce8ed' },
  readAllText: { fontSize: 10, fontWeight: '900', color: '#fff' },
  readAllTextDisabled: { color: '#8ca0aa' },
  card: {
    flexDirection: 'row', backgroundColor: '#ffffff', borderRadius: 18, borderWidth: 1, borderColor: '#e3eff5',
    marginBottom: 12, overflow: 'hidden',
    shadowColor: '#123a5e', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.06, shadowRadius: 10, elevation: 2,
  },
  unreadCard: { borderColor: '#bfe0ec', backgroundColor: '#f7fcfe' },
  accentBar: { width: 4, backgroundColor: '#2c6ba3' },
  content: { flex: 1, paddingVertical: 14, paddingHorizontal: 14 },
  readContent: { opacity: 0.78 },
  metaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  typePill: { flexShrink: 1, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4, marginRight: 10, backgroundColor: 'rgba(44,107,163,0.1)' },
  typeText: { fontSize: 10, fontWeight: '900', letterSpacing: 0.4, textTransform: 'uppercase', color: '#2c6ba3' },
  timeWrap: { flexDirection: 'row', alignItems: 'center' },
  time: { fontSize: 11, fontWeight: '700', color: '#8aa1b1' },
  timeUnread: { color: '#2c6ba3', fontWeight: '900' },
  title: { fontSize: 15, lineHeight: 21, fontWeight: '900', color: '#123a5e' },
  message: { marginTop: 4, fontSize: 13, lineHeight: 19, fontWeight: '600', color: '#5d7b91' },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#f47c6b', marginRight: 6 },
  emptyCard: { backgroundColor: '#fff', borderRadius: 20, padding: 22, borderWidth: 1, borderColor: '#dceef8', alignItems: 'center' },
  emptyTitle: { fontSize: 16, fontWeight: '900', color: '#123a5e' },
  emptyText: { marginTop: 7, fontSize: 13, lineHeight: 19, textAlign: 'center', color: '#6e8998', fontWeight: '600' },
});
