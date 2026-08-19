import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import * as Notifications from 'expo-notifications';
import {
  subscribeNotifications,
  markNotificationRead,
  createNotification,
  notificationExists,
} from '../api/notificationService';
import { getOwnerAppointments } from '../api/mobileAppointmentService';
import { getStoredSession } from '../api/authService';
import { playNotificationSound } from '../utils/notificationSound';
import { registerForPushNotificationsAsync } from '../utils/pushNotifications';
import NotificationToast from '../components/NotificationToast';

const NotificationContext = createContext({ setActiveUser: () => {} });
export const useNotificationContext = () => useContext(NotificationContext);

const AUTO_DISMISS_MS = 4500;
const REMINDER_CHECK_MS = 5 * 60 * 1000;
const REMINDER_WINDOW_MIN = 30;

const APPOINTMENT_ROUTE_BY_ROLE = {
  pet_owner: 'PetOwnerAppointment',
  staff: 'StaffAppointment',
  veterinarian: 'VetAppointment',
};

const MESSAGE_ROUTE_BY_ROLE = {
  pet_owner: 'PetOwnerMessages',
  staff: 'StaffMessages',
  veterinarian: 'VetMessages',
  admin: 'AdminMessages',
  administrator: 'AdminMessages',
};

function resolveRouteForNotification(notification, role) {
  const type = String(notification?.notification_type || '').toLowerCase();
  const normalizedRole = String(role || '').toLowerCase();
  if (type.includes('appointment')) {
    const name = APPOINTMENT_ROUTE_BY_ROLE[normalizedRole];
    return name ? { name } : null;
  }
  if (type.includes('message')) {
    const name = MESSAGE_ROUTE_BY_ROLE[normalizedRole];
    return name ? { name } : null;
  }
  return null;
}

function getAppointmentStart(dateValue, timeValue) {
  if (!dateValue || !timeValue) return null;
  const start = new Date(`${dateValue}T${String(timeValue).slice(0, 5)}:00`);
  return Number.isNaN(start.getTime()) ? null : start;
}

export function NotificationProvider({ navigationRef, children }) {
  const [activeUser, setActiveUserState] = useState(null);
  const [toast, setToast] = useState(null);
  const unsubscribeRef = useRef(() => {});
  const dismissTimerRef = useRef(null);
  const activeUserRef = useRef(null);

  const setActiveUser = useCallback((user) => {
    const nextId = user?.id || user?.user_id || user?.profile_id || null;
    const currentId = activeUserRef.current?.id || activeUserRef.current?.user_id || activeUserRef.current?.profile_id || null;
    if (nextId && nextId === currentId) return;
    activeUserRef.current = user;
    setActiveUserState(user);
  }, []);

  useEffect(() => {
    if (activeUser) return;
    let active = true;
    getStoredSession()
      .then((session) => {
        const profile = session?.profile || session?.user;
        if (active && profile) setActiveUser(profile);
      })
      .catch(() => {});
    return () => { active = false; };
  }, [activeUser, setActiveUser]);

  const showToast = useCallback((row) => {
    playNotificationSound();
    setToast(row);
    clearTimeout(dismissTimerRef.current);
    dismissTimerRef.current = setTimeout(() => setToast(null), AUTO_DISMISS_MS);
  }, []);

  useEffect(() => {
    unsubscribeRef.current();
    const profileId = activeUser?.id || activeUser?.user_id || activeUser?.profile_id || null;
    if (!profileId) {
      unsubscribeRef.current = () => {};
      return undefined;
    }
    unsubscribeRef.current = subscribeNotifications(profileId, {
      onInsert: (row) => {
        if (!row) return;
        showToast(row);
      },
    });
    registerForPushNotificationsAsync(profileId);
    return () => unsubscribeRef.current();
  }, [activeUser?.id, activeUser?.user_id, activeUser?.profile_id, showToast]);

  useEffect(() => {
    const navigateToNotification = (response) => {
      const data = response?.notification?.request?.content?.data;
      if (!data) return;
      const target = resolveRouteForNotification(
        { notification_type: data.type },
        activeUserRef.current?.role,
      );
      if (target && navigationRef?.current?.isReady?.()) {
        navigationRef.current.navigate(target.name, { user: activeUserRef.current });
      }
    };

    const subscription = Notifications.addNotificationResponseReceivedListener(navigateToNotification);
    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) navigateToNotification(response);
    });
    return () => subscription.remove();
  }, [navigationRef]);

  useEffect(() => {
    const role = String(activeUser?.role || '').toLowerCase();
    const ownerId = activeUser?.id || activeUser?.user_id || activeUser?.profile_id;
    if (role !== 'pet_owner' || !ownerId) return undefined;

    let cancelled = false;
    const check = async () => {
      try {
        const rows = await getOwnerAppointments(ownerId);
        const now = Date.now();
        const soon = rows.filter((row) => {
          if (row.status !== 'Confirmed') return false;
          const start = getAppointmentStart(row.appointment_date, row.start_time);
          if (!start) return false;
          const minutesAway = (start.getTime() - now) / 60000;
          return minutesAway > 0 && minutesAway <= REMINDER_WINDOW_MIN;
        });
        for (const appointment of soon) {
          if (cancelled) return;
          const already = await notificationExists({
            recipientId: ownerId,
            type: 'Appointment Reminder',
            relatedRecord: appointment.id,
          });
          if (already) continue;
          await createNotification({
            recipientId: ownerId,
            type: 'Appointment Reminder',
            title: 'Upcoming Appointment',
            message: `Your appointment is coming up soon${appointment.veterinarian?.full_name ? ` with ${appointment.veterinarian.full_name}` : ''}.`,
            relatedModule: 'Appointments',
            relatedRecord: appointment.id,
            createdBy: ownerId,
          });
        }
      } catch {
        // best-effort reminder check; never throw into the provider
      }
    };

    check();
    const timer = setInterval(check, REMINDER_CHECK_MS);
    return () => { cancelled = true; clearInterval(timer); };
  }, [activeUser?.id, activeUser?.user_id, activeUser?.profile_id, activeUser?.role]);

  const handleDismiss = useCallback(() => {
    clearTimeout(dismissTimerRef.current);
    setToast(null);
  }, []);

  const handlePress = useCallback(() => {
    if (!toast) return;
    markNotificationRead(toast.id).catch(() => {});
    const target = resolveRouteForNotification(toast, activeUser?.role);
    if (target && navigationRef?.current?.isReady?.()) {
      navigationRef.current.navigate(target.name, { user: activeUser });
    }
    handleDismiss();
  }, [toast, activeUser, navigationRef, handleDismiss]);

  return (
    <NotificationContext.Provider value={{ setActiveUser }}>
      <View style={{ flex: 1 }}>
        {children}
        <NotificationToast notification={toast} onPress={handlePress} onDismiss={handleDismiss} />
      </View>
    </NotificationContext.Provider>
  );
}
