import { SafeAreaView } from 'react-native-safe-area-context';
import PetOwnerBottomNav from './PetOwnerBottomNav';
import PetOwnerHeaderGreeting from './PetOwnerHeaderGreeting';
import CollapsingHeaderRow from '../../../components/CollapsingHeaderRow';
import { useLowerHeaderMotion } from '../Veterinary/useLowerHeaderMotion';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Image,
  RefreshControl,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { styles } from '../../styles/PetOwnerNotifDesign';
import {
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  subscribeNotifications,
} from '../../../api/notificationService';
import { getStoredSession } from '../../../api/authService';
import { MarkAllReadButton, NotificationCard, NotificationEmpty } from '../../../components/NotificationCard';

const DEFAULT_PROFILE_IMAGE = require('../../assets/Profile.png');

// Where tapping a notification takes the pet owner, by its related module.
// Modules not listed (announcements, etc.) just mark it read.
const ROUTE_BY_MODULE = {
  appointments: 'PetOwnerMyAppointments',
  queue: 'PetOwnerQueue',
  'queue management': 'PetOwnerQueue',
  messages: 'PetOwnerMessages',
  account: 'PetOwnerProfile',
};
const routeForNotification = (item) => ROUTE_BY_MODULE[String(item?.related_module || '').trim().toLowerCase()] || null;

const PetOwnerNotif = ({ navigation, route }) => {
  // Lower header row hides on scroll down, like the Veterinarian header.
  const headerMotion = useLowerHeaderMotion();
  const routeUser = route?.params?.user || null;
  const [user, setUser] = useState(routeUser);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [isHeaderMenuVisible, setIsHeaderMenuVisible] = useState(false);
  const scrollViewRef = useRef(null);
  const headerMenuAnimation = useRef(new Animated.Value(0)).current;
  const lowerHeaderAnimation = useRef(new Animated.Value(1)).current;

  const profileId = user?.id || null;
  const profileImageUri = user?.profileImageUri || user?.avatar || '';
  const headerDisplayName = user?.username || user?.name || user?.fullName || 'Pet Owner';

  const headerMenuItems = [
    { key: 'dashboard', label: 'Dashboard', icon: require('../../assets/Dashboard_Icon.png'), route: 'petowner-screen' },
    { key: 'appointment', label: 'Appointment', icon: require('../../assets/Appointment_Icon.png'), route: 'PetOwnerAppointment' },
    { key: 'mypets', label: 'Animal Patients', icon: require('../../assets/Pets_Icon.png'), route: 'PetOwnerMyPets' },
    { key: 'messages', label: 'Messages', icon: require('../../assets/Message_Icon.png'), route: 'PetOwnerMessages' },  ];

  useEffect(() => {
    if (routeUser?.id) return;
    let active = true;
    getStoredSession().then((session) => {
      if (active) setUser(session?.profile || session?.user || null);
    });
    return () => { active = false; };
  }, [routeUser?.id]);

  const loadNotifications = useCallback(async (showLoader = true) => {
    if (!profileId) {
      setNotifications([]);
      setLoading(false);
      return;
    }
    try {
      if (showLoader) setLoading(true);
      else setRefreshing(true);
      setError('');
      const rows = await getNotifications(profileId);
      setNotifications(rows);
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
    loadNotifications(true);

    const unsubscribe = subscribeNotifications(profileId, {
      onInsert: (item) => {
        if (!active || !item?.id) return;
        setNotifications((current) => current.some((row) => row.id === item.id) ? current : [item, ...current]);
      },
      onUpdate: (item) => {
        if (!active || !item?.id) return;
        setNotifications((current) => current.map((row) => row.id === item.id ? item : row));
      },
      onDelete: (item) => {
        if (!active || !item?.id) return;
        setNotifications((current) => current.filter((row) => row.id !== item.id));
      },
    });

    const fallback = setInterval(() => loadNotifications(false), 30000);
    return () => {
      active = false;
      clearInterval(fallback);
      unsubscribe?.();
    };
  }, [profileId, loadNotifications]);

  const unreadCount = useMemo(() => notifications.filter((item) => !item.is_read).length, [notifications]);

  // Mark read, then open the related screen (a message opens its chat).
  const handleOpen = (item) => {
    handleRead(item);
    const routeName = routeForNotification(item);
    if (!routeName) return;
    const params = { ...(user ? { user } : {}) };
    if (routeName === 'PetOwnerMessages' && item.related_record) params.conversationId = item.related_record;
    navigation.navigate(routeName, params);
  };

  const handleRead = async (item) => {
    if (!item?.id || item.is_read) return;
    try {
      await markNotificationRead(item.id);
      const readAt = new Date().toISOString();
      setNotifications((current) => current.map((row) => row.id === item.id ? { ...row, is_read: true, read_at: readAt } : row));
    } catch (e) {
      setError(e?.message || 'Unable to mark notification as read.');
    }
  };

  const handleReadAll = async () => {
    if (!profileId || unreadCount === 0) return;
    try {
      await markAllNotificationsRead(profileId);
      const readAt = new Date().toISOString();
      setNotifications((current) => current.map((row) => ({ ...row, is_read: true, read_at: row.read_at || readAt })));
    } catch (e) {
      setError(e?.message || 'Unable to mark all notifications as read.');
    }
  };

  const toggleHeaderMenu = () => {
    const next = !isHeaderMenuVisible;
    setIsHeaderMenuVisible(next);
    Animated.timing(headerMenuAnimation, {
      toValue: next ? 1 : 0,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  };

  const navigate = (routeName) => {
    setIsHeaderMenuVisible(false);
    headerMenuAnimation.setValue(0);
    navigation.navigate(routeName, user ? { user } : undefined);
  };

  return (
    <LinearGradient colors={['#f7fbfc', '#eef7f8', '#ffffff']} style={styles.background}>
      <SafeAreaView style={styles.container}>
        <LinearGradient colors={['#3a7ab8', '#3a7ab8', '#3a7ab8']} style={styles.headerBar}>
          <LinearGradient colors={['#1e5a8c', '#256297', '#2c6ba3', '#3a7ab8']} style={styles.headerTopBand}>
            <View style={styles.headerTopRow}>
              <TouchableOpacity style={styles.brandSection} onPress={() => navigate('petowner-screen')} activeOpacity={0.85}>
                <View style={styles.logoWrap}><Image source={require('../../assets/paw1.png')} style={styles.headerLogo} resizeMode="contain" /></View>
                <View style={styles.brandBlock}><Text style={styles.headerTitle}>PawCruz</Text><Text style={styles.headerSubtitle}>Notifications</Text></View>
              </TouchableOpacity>
              <View style={styles.headerActions}>
                <TouchableOpacity style={styles.notifButton} onPress={() => scrollViewRef.current?.scrollTo({ y: 0, animated: true })} activeOpacity={0.85}>
                  {unreadCount > 0 ? <View style={styles.notifBadge} /> : null}
                  <Image source={require('../../assets/Bell_Icon.png')} style={styles.notifIcon} resizeMode="contain" />
                </TouchableOpacity>
                <TouchableOpacity style={styles.profileButton} onPress={() => navigate('PetOwnerProfile')} activeOpacity={0.85}>
                  {profileImageUri ? <Image source={{ uri: profileImageUri }} style={styles.profileButtonImage} resizeMode="cover" /> : <Image source={DEFAULT_PROFILE_IMAGE} style={styles.profileIcon} resizeMode="contain" />}
                </TouchableOpacity>
              </View>
            </View>
          </LinearGradient>

          <CollapsingHeaderRow animation={headerMotion.lowerHeaderAnimation}>
            <View style={styles.headerBottomRow}>
              <PetOwnerHeaderGreeting caption={unreadCount ? `${unreadCount} unread notification${unreadCount === 1 ? '' : 's'}` : 'You are all caught up'} user={routeUser} />
            </View>
          </CollapsingHeaderRow>

          {false ? (
            <Animated.View style={[styles.headerMenuPanel, { opacity: headerMenuAnimation, transform: [{ translateY: headerMenuAnimation.interpolate({ inputRange: [0, 1], outputRange: [-14, 0] }) }] }] }>
              {headerMenuItems.map((item) => (
                <TouchableOpacity key={item.key} style={styles.headerMenuItem} onPress={() => navigate(item.route)} activeOpacity={0.88}>
                  <View style={styles.headerMenuItemIconWrap}><Image source={item.icon} style={styles.headerMenuItemIcon} resizeMode="contain" /></View>
                  <Text style={styles.headerMenuItemLabel}>{item.label}</Text>
                </TouchableOpacity>
              ))}
            </Animated.View>
          ) : null}
        </LinearGradient>

        <ScrollView onScroll={headerMotion.handleScroll} scrollEventThrottle={16}
          ref={scrollViewRef}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadNotifications(false)} />}
        >
          <MarkAllReadButton unreadCount={unreadCount} onPress={handleReadAll} />

          {error ? <View style={{ marginBottom: 12, padding: 12, borderRadius: 14, backgroundColor: '#fff0ee' }}><Text style={{ color: '#b44b3d', fontWeight: '700' }}>{error}</Text></View> : null}

          {loading ? (
            <View style={{ paddingVertical: 48, alignItems: 'center' }}><ActivityIndicator size="large" color="#2c6ba3" /><Text style={{ marginTop: 12, color: '#5d7b91', fontWeight: '700' }}>Loading notifications...</Text></View>
          ) : notifications.length ? (
            notifications.map((item) => (
              <NotificationCard key={item.id} notification={item} onPress={() => handleOpen(item)} />
            ))
          ) : (
            <NotificationEmpty text="Appointment, queue, medical record, message, and clinic updates will appear here automatically." />
          )}
        </ScrollView>

        <PetOwnerBottomNav navigation={navigation} user={routeUser} />
      </SafeAreaView>
    </LinearGradient>
  );
};

export default PetOwnerNotif;
