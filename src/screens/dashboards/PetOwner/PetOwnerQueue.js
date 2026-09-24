import { SafeAreaView } from 'react-native-safe-area-context';
import PetOwnerSideDrawer from './PetOwnerSideDrawer';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Easing, Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { styles } from '../../styles/PetOwnerAppointmentDesign';
import { getQueue, subscribeToQueue } from '../../../api/queueService';
import { formatTime } from '../../../api/mobileAppointmentService';

const DEFAULT_PROFILE_IMAGE = require('../../assets/Profile.png');

const QueueSummaryRow = ({ label, value, last }) => (
  <View style={[personalStyles.summaryRow, last && personalStyles.summaryRowLast]}>
    <Text style={personalStyles.summaryLabel}>{label}</Text>
    <Text style={personalStyles.summaryValue}>{value || '—'}</Text>
  </View>
);

const formatCheckInClockTime = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
};

// A booked-ahead appointment keeps its reserved time as `original_appointment_time`;
// a walk-in never had one, so it falls back to when Staff actually checked them in.
const bookingInfo = (entry) => {
  if (entry?.original_appointment_time) return { label: 'Appointment Time', value: formatTime(entry.original_appointment_time) };
  return { label: 'Checked In At', value: formatCheckInClockTime(entry?.arrived_at) };
};

export default function PetOwnerQueue({ navigation, route }) {
  const user = route?.params?.user;
  const profileImageUri = user?.profileImageUri || user?.avatar || '';
  const headerDisplayName = user?.username || user?.name || user?.fullName || 'Pet Owner';
  const [entry, setEntry] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isHeaderMenuVisible, setIsHeaderMenuVisible] = useState(false);
  const headerMenuAnimation = useRef(new Animated.Value(0)).current;
  const isHeaderMenuAnimating = useRef(false);

  const headerMenuItems = [
    { key: 'dashboard', label: 'Dashboard', icon: require('../../assets/Dashboard_Icon.png'), route: 'petowner-screen' },
    { key: 'appointment', label: 'Appointment', icon: require('../../assets/Appointment_Icon.png'), route: 'PetOwnerAppointment' },
    { key: 'mypets', label: 'Animal Patients', icon: require('../../assets/Pets_Icon.png'), route: 'PetOwnerMyPets' },
    { key: 'messages', label: 'Messages', icon: require('../../assets/Message_Icon.png'), route: 'PetOwnerMessages' },  ];

  const load = useCallback(async () => {
    try {
      const ownerId = user?.id || user?.user_id || user?.profile_id;
      const data = ownerId ? await getQueue({ ownerId }) : [];
      // Pet owners never receive the clinic's live queue list. They only see
      // their own Staff-assigned queue number, if they have checked in.
      setEntry((data || [])[0] || null);
      setError('');
    } catch (e) {
      setEntry(null);
      setError(e?.message || e?.response?.data?.message || 'Unable to load your queue number.');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    load();
    const ownerId = user?.id || user?.user_id || user?.profile_id;
    const unsubscribe = subscribeToQueue(load, { ownerId });
    const fallbackTimer = setInterval(load, 30000);
    return () => {
      unsubscribe?.();
      clearInterval(fallbackTimer);
    };
  }, [load, user]);

  const openHeaderMenu = () => {
    if (isHeaderMenuVisible || isHeaderMenuAnimating.current) return;
    isHeaderMenuAnimating.current = true;
    setIsHeaderMenuVisible(true);
    Animated.timing(headerMenuAnimation, {
      toValue: 1,
      duration: 240,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(() => { isHeaderMenuAnimating.current = false; });
  };

  const closeHeaderMenu = (after) => {
    if (isHeaderMenuAnimating.current) return;
    if (!isHeaderMenuVisible) { after?.(); return; }
    isHeaderMenuAnimating.current = true;
    Animated.timing(headerMenuAnimation, {
      toValue: 0,
      duration: 220,
      easing: Easing.inOut(Easing.cubic),
      useNativeDriver: true,
    }).start(() => {
      isHeaderMenuAnimating.current = false;
      setIsHeaderMenuVisible(false);
      after?.();
    });
  };

  const toggleHeaderMenu = () => isHeaderMenuVisible ? closeHeaderMenu() : openHeaderMenu();
  const goTo = (screen) => closeHeaderMenu(() => navigation.navigate(screen, { user }));
  const queueNumber = entry?.queue_number || entry?.queueNumber || null;
  const queueStatus = entry?.status || 'Not checked in';
  const pets = entry?.pets?.length ? entry.pets : (entry?.pet ? [entry.pet] : []);
  const petName = pets.length ? pets.map((p) => p.pet_name).join(', ') : 'Not assigned';
  const veterinarianName = entry?.veterinarian?.full_name || 'Not assigned';
  const booking = entry ? bookingInfo(entry) : null;

  return (
    <LinearGradient colors={['#f7fbfc', '#eef7f8', '#ffffff']} style={styles.background}>
      <SafeAreaView style={styles.container}>
        <LinearGradient colors={['#3a7ab8', '#3a7ab8', '#3a7ab8']} style={styles.headerBar}>
          <LinearGradient colors={['#1e5a8c', '#256297', '#2c6ba3', '#3a7ab8']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.headerTopBand}>
            <View style={styles.headerTopRow}>
              <TouchableOpacity style={styles.brandSection} onPress={() => navigation.navigate('petowner-screen', { user })} activeOpacity={0.85}>
                <View style={styles.logoWrap}><Image source={require('../../assets/paw1.png')} style={styles.headerLogo} resizeMode="contain" /></View>
                <View style={styles.brandBlock}><Text style={styles.headerTitle}>PawCruz</Text><Text style={styles.headerSubtitle}>My Queue</Text></View>
              </TouchableOpacity>
              <View style={styles.headerActions}>
                <TouchableOpacity style={styles.notifButton} onPress={() => navigation.navigate('PetOwnerNotif', { user })} activeOpacity={0.85}>
                  <View style={styles.notifBadge} /><Image source={require('../../assets/Bell_Icon.png')} style={styles.notifIcon} resizeMode="contain" />
                </TouchableOpacity>
                <TouchableOpacity style={styles.profileButton} onPress={() => navigation.navigate('PetOwnerProfile', { user })} activeOpacity={0.85}>
                  <Image source={profileImageUri ? { uri: profileImageUri } : DEFAULT_PROFILE_IMAGE} style={profileImageUri ? styles.profileButtonImage : styles.profileIcon} resizeMode={profileImageUri ? 'cover' : 'contain'} />
                </TouchableOpacity>
              </View>
            </View>
          </LinearGradient>

          <View style={styles.headerBottomRow}>
            <TouchableOpacity style={styles.menuTriggerButton} onPress={toggleHeaderMenu} activeOpacity={0.85}>
              <Image source={require('../../assets/List.png')} style={styles.menuTriggerIcon} resizeMode="contain" />
            </TouchableOpacity>
            <View style={styles.ownerSummary}><Text style={styles.headerCaption}>Your assigned queue number</Text><Text style={styles.ownerName}>{headerDisplayName}</Text></View>
          </View>

          <PetOwnerSideDrawer visible={isHeaderMenuVisible} onClose={() => setIsHeaderMenuVisible(false)} navigation={navigation} user={user} activeKey="queue" />
          {false ? (
            <Animated.View style={[styles.headerMenuPanel, { opacity: headerMenuAnimation, transform: [{ translateY: headerMenuAnimation.interpolate({ inputRange: [0, 1], outputRange: [-18, 0] }) }] }] }>
              {headerMenuItems.map((item) => (
                <TouchableOpacity key={item.key} style={styles.headerMenuItem} onPress={() => goTo(item.route)} activeOpacity={0.88}>
                  <View style={styles.headerMenuItemIconWrap}><Image source={item.icon} style={styles.headerMenuItemIcon} resizeMode="contain" /></View>
                  <Text style={styles.headerMenuItemLabel}>{item.label}</Text>
                </TouchableOpacity>
              ))}
            </Animated.View>
          ) : null}
        </LinearGradient>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.queueScrollContent}>
          <View style={personalStyles.summaryCard}>
            <View style={personalStyles.summaryHeader}>
              <Text style={personalStyles.summaryEyebrow}>CLINIC CHECK-IN</Text>
              <Text style={personalStyles.summaryTitle}>Queue Summary</Text>
            </View>

            <View style={personalStyles.queueNumberBlock}>
              <Text style={personalStyles.queueNumberLabel}>QUEUE NO.</Text>
              <Text style={personalStyles.queueNumberValue}>{loading ? '...' : queueNumber || '—'}</Text>
            </View>

            {loading ? (
              <Text style={personalStyles.loadingText}>Checking your queue information...</Text>
            ) : error ? (
              <Text style={personalStyles.errorText}>{error}</Text>
            ) : !entry ? (
              <>
                <Text style={personalStyles.emptyTitle}>No active queue</Text>
                <Text style={personalStyles.helper}>Check in at the clinic reception when you arrive.</Text>
              </>
            ) : (
              <>
                {entry.late_arrival ? (
                  <View style={personalStyles.warnBanner}>
                    <Text style={personalStyles.warnText}>Late arrival recorded. Your place follows the active queue order.</Text>
                  </View>
                ) : null}

                <QueueSummaryRow label="Pet" value={petName} />
                {pets.length > 1 ? (
                  <QueueSummaryRow label="Visit Size" value={`${pets.length} pets · ${entry?.visitDurationMinutes || pets.length * 10} min visit`} />
                ) : null}
                <QueueSummaryRow label="Veterinarian" value={veterinarianName} last />

                <View style={personalStyles.statGrid}>
                  <View style={personalStyles.statBox}>
                    <Text style={personalStyles.statValue}>{queueStatus}</Text>
                    <Text style={personalStyles.statLabel}>Status</Text>
                  </View>
                  <View style={personalStyles.statBox}>
                    <Text style={personalStyles.statValue}>{booking.value}</Text>
                    <Text style={personalStyles.statLabel}>{booking.label}</Text>
                  </View>
                </View>

                <Text style={personalStyles.helper}>Keep your queue number ready while waiting at the clinic.</Text>
              </>
            )}
          </View>

          <TouchableOpacity style={styles.queueRefreshButton} onPress={load} activeOpacity={0.9}>
            <Text style={styles.queueRefreshButtonText}>Refresh Queue Number</Text>
          </TouchableOpacity>
        </ScrollView>

        <View style={styles.bottomNav}>
          <TouchableOpacity style={[styles.navItem, styles.activeNavItem]} onPress={() => navigation.navigate('PetOwnerQuickAssist', { user })} activeOpacity={0.9}>
            <View style={[styles.navIconWrap, styles.activeNavIconWrap]}>
              <Image source={require('../../assets/support.png')} style={[styles.navIcon, styles.activeNavIcon]} resizeMode="contain" />
            </View>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </LinearGradient>
  );
}

const personalStyles = StyleSheet.create({
  summaryCard: {
    marginTop: 4,
    marginHorizontal: 2,
    padding: 18,
    borderRadius: 28,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#d9edf2',
    shadowColor: '#173f52',
    shadowOpacity: 0.08,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 7 },
    elevation: 3,
  },
  summaryHeader: { alignItems: 'center', paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: '#e2ecef' },
  summaryEyebrow: { color: '#6f929f', fontSize: 11, fontWeight: '900', letterSpacing: 1 },
  summaryTitle: { color: '#123a5e', fontSize: 23, fontWeight: '900', marginTop: 3 },
  queueNumberBlock: {
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    minWidth: 160,
    borderRadius: 24,
    paddingHorizontal: 24,
    paddingVertical: 18,
    marginVertical: 18,
    backgroundColor: '#2c6ba3',
  },
  queueNumberLabel: { color: '#dff2f7', fontSize: 11, fontWeight: '900', letterSpacing: 1 },
  queueNumberValue: { color: '#ffffff', fontSize: 48, lineHeight: 56, fontWeight: '900', marginTop: 4, textAlign: 'center' },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 14, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#e2ecef' },
  summaryRowLast: { borderBottomWidth: 0 },
  summaryLabel: { color: '#78909b', fontSize: 12, fontWeight: '600', flex: 0.42 },
  summaryValue: { color: '#365f72', fontSize: 12, fontWeight: '800', textAlign: 'right', flex: 0.58 },
  loadingText: {
    color: '#557883',
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
    paddingVertical: 30,
  },
  errorText: {
    color: '#a94646',
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
    paddingVertical: 24,
  },
  emptyTitle: {
    color: '#123a5e',
    fontSize: 18,
    fontWeight: '900',
    textAlign: 'center',
    paddingTop: 20,
  },
  warnBanner: {
    backgroundColor: '#fff0f0',
    borderRadius: 14,
    padding: 13,
    marginTop: 16,
  },
  warnText: {
    color: '#b34b4b',
    fontSize: 12.5,
    fontWeight: '700',
    lineHeight: 18,
  },
  statGrid: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
  },
  statBox: {
    flex: 1,
    backgroundColor: '#eff9fc',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 8,
    alignItems: 'center',
  },
  statValue: {
    color: '#2c6ba3',
    fontSize: 15,
    fontWeight: '900',
    marginBottom: 4,
    textAlign: 'center',
  },
  statLabel: {
    color: '#5f7f94',
    fontSize: 10.5,
    fontWeight: '700',
    textAlign: 'center',
  },
  helper: {
    marginTop: 12,
    color: '#78929b',
    fontSize: 14,
    lineHeight: 21,
    fontWeight: '600',
    textAlign: 'center',
    maxWidth: 330,
  },
});
