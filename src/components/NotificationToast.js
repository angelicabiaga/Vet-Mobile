import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { notificationAccent } from '../api/notificationService';

export default function NotificationToast({ notification, onPress, onDismiss }) {
  const translateY = useRef(new Animated.Value(-40)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!notification) return;
    translateY.setValue(-40);
    opacity.setValue(0);
    Animated.parallel([
      Animated.timing(translateY, { toValue: 0, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 1, duration: 220, useNativeDriver: true }),
    ]).start();
  }, [notification?.id]);

  if (!notification) return null;

  const accent = notificationAccent(notification.notification_type);

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <SafeAreaView edges={['top']} style={styles.safe} pointerEvents="box-none">
        <Animated.View style={[styles.cardWrap, { opacity, transform: [{ translateY }] }]}>
          <Pressable style={styles.card} onPress={onPress} accessibilityRole="button" accessibilityLabel={notification.title || 'Notification'}>
            <View style={[styles.iconWrap, { backgroundColor: accent }]}>
              <Text style={styles.iconText}>🔔</Text>
            </View>
            <View style={styles.body}>
              <Text style={styles.title} numberOfLines={1}>{notification.title || 'PawCruz Notification'}</Text>
              {notification.message ? <Text style={styles.message} numberOfLines={2}>{notification.message}</Text> : null}
            </View>
            <Pressable style={styles.closeBtn} onPress={onDismiss} accessibilityRole="button" accessibilityLabel="Dismiss notification">
              <Text style={styles.closeText}>×</Text>
            </Pressable>
          </Pressable>
        </Animated.View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 9999,
    elevation: 40,
  },
  safe: { paddingHorizontal: 14 },
  cardWrap: { marginTop: 10 },
  card: {
    minHeight: 64,
    borderRadius: 18,
    paddingLeft: 12,
    paddingRight: 8,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#effbf4',
    borderWidth: 1,
    borderColor: '#b9e8ca',
    shadowColor: '#14384a',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.22,
    shadowRadius: 12,
    elevation: 18,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  iconText: { fontSize: 16, lineHeight: 18 },
  body: { flex: 1 },
  title: { color: '#24566d', fontSize: 13, fontWeight: '900' },
  message: { color: '#4e6a7b', fontSize: 12, fontWeight: '600', marginTop: 2, lineHeight: 16 },
  closeBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', marginLeft: 4 },
  closeText: { color: '#5e7886', fontSize: 24, fontWeight: '500', lineHeight: 26 },
});
