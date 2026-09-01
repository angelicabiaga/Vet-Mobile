import { SafeAreaView } from 'react-native-safe-area-context';
import PetOwnerSideDrawer from './PetOwnerSideDrawer';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { cancelAppointment, formatTime, getOwnerAppointments, todayLocal } from '../../../api/mobileAppointmentService';
import { getQueue, subscribeToQueue } from '../../../api/queueService';
import { supabase } from '../../../config/supabaseClient';

const getOwnerId = (user) => user?.id || user?.user_id || user?.profile_id || '';
const formatDate = (value) => {
  if (!value) return '—';
  const date = new Date(`${value}T12:00:00`);
  return date.toLocaleDateString([], { month: 'long', day: 'numeric', year: 'numeric' });
};
const formatTimestamp = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString([], { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
};

export default function PetOwnerMyAppointments({ navigation, route }) {
  const user = route?.params?.user || {};
  const ownerId = getOwnerId(user);
  const ownerName = user?.full_name || user?.fullName || user?.name || user?.username || 'Pet Owner';

  const [appointments, setAppointments] = useState([]);
  const [queueEntries, setQueueEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedAppointmentId, setExpandedAppointmentId] = useState(null);
  const [message, setMessage] = useState('');
  const [isSidebarVisible, setIsSidebarVisible] = useState(false);

  useEffect(() => {
    if (!message || !message.toLowerCase().includes('successfully')) return undefined;
    const timer = setTimeout(() => setMessage(''), 4500);
    return () => clearTimeout(timer);
  }, [message]);

  // The queue number only exists once Staff actually checks the pet owner
  // in at the clinic -- a queue_entries row linked to the appointment, not
  // just "it's close to the appointment time" -- so View Queue must be
  // driven by this, not a time-window guess.
  const loadQueue = useCallback(async () => {
    if (!ownerId) return;
    try {
      setQueueEntries(await getQueue({ ownerId }));
    } catch (error) {
      console.log('Unable to load queue status:', error?.message || error);
    }
  }, [ownerId]);

  const loadData = useCallback(async () => {
    if (!ownerId) {
      setMessage('Unable to identify the logged-in pet owner. Please sign in again.');
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      await Promise.all([
        getOwnerAppointments(ownerId).then(setAppointments),
        loadQueue(),
      ]);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }, [ownerId, loadQueue]);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  useEffect(() => {
    if (!ownerId) return undefined;

    let active = true;
    const channel = supabase
      .channel(`mobile-owner-my-appointments-${ownerId}-${Date.now()}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'appointments', filter: `owner_id=eq.${ownerId}` },
        async () => {
          if (!active) return;
          try {
            const rows = await getOwnerAppointments(ownerId);
            if (active) setAppointments(rows);
          } catch (error) {
            console.log('Appointment realtime refresh failed:', error);
          }
        }
      )
      .subscribe();

    const unsubscribeQueue = subscribeToQueue(() => { if (active) loadQueue(); }, { ownerId });

    return () => {
      active = false;
      supabase.removeChannel(channel);
      unsubscribeQueue?.();
    };
  }, [ownerId, loadQueue]);

  const startReschedule = (appointment) => {
    navigation.navigate('PetOwnerAppointment', { user, rescheduleAppointment: appointment });
  };

  const confirmCancel = (appointment) => {
    Alert.alert('Cancel Appointment', `Cancel ${appointment.pet?.pet_name || 'this appointment'} on ${formatDate(appointment.appointment_date)}?`, [
      { text: 'Keep Appointment', style: 'cancel' },
      {
        text: 'Cancel Appointment',
        style: 'destructive',
        onPress: async () => {
          try {
            await cancelAppointment(appointment.id, ownerId);
            setAppointments(await getOwnerAppointments(ownerId));
            setMessage('Appointment cancelled successfully.');
          } catch (error) {
            setMessage(error.message);
          }
        },
      },
    ]);
  };

  if (loading) {
    return <SafeAreaView style={styles.loading}><ActivityIndicator size="large" /><Text style={styles.loadingText}>Loading appointments...</Text></SafeAreaView>;
  }

  return (
    <LinearGradient colors={['#f7fbfc', '#eef7f8', '#ffffff']} style={styles.background}>
      <SafeAreaView style={styles.safe}>
        {!!message && (
          <View style={styles.stickyNoticeWrap} pointerEvents="box-none">
            <View style={[styles.stickyNotice, message.toLowerCase().includes('successfully') ? styles.stickyNoticeSuccess : styles.stickyNoticeError]}>
              <View style={styles.stickyNoticeIcon}>
                <Text style={styles.stickyNoticeIconText}>{message.toLowerCase().includes('successfully') ? '✓' : '!'}</Text>
              </View>
              <Text style={styles.stickyNoticeText}>{message}</Text>
              <TouchableOpacity style={styles.stickyNoticeClose} onPress={() => setMessage('')} activeOpacity={0.8}>
                <Text style={styles.stickyNoticeCloseText}>×</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
        <LinearGradient colors={['#63B6C5', '#63B6C5', '#63B6C5']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.headerBar}>
          <LinearGradient colors={['#1f4e66', '#2f6f86', '#447C99', '#5f9eb4']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.headerTopBand}>
            <View style={styles.headerTopRow}>
              <TouchableOpacity style={styles.brandSection} onPress={() => navigation.navigate('petowner-screen', { user })} activeOpacity={0.85}>
                <View style={styles.logoWrap}>
                  <Image source={require('../../assets/paw1.png')} style={styles.headerLogo} resizeMode="contain" />
                </View>
                <View style={styles.brandBlock}>
                  <Text style={styles.headerTitle}>PawCruz</Text>
                  <Text style={styles.headerSubtitle}>My Appointments</Text>
                </View>
              </TouchableOpacity>

              <View style={styles.headerActions}>
                <TouchableOpacity style={styles.notifButton} onPress={() => navigation.navigate('PetOwnerNotif', { user })} activeOpacity={0.85}>
                  <View style={styles.notifBadge} />
                  <Image source={require('../../assets/Bell_Icon.png')} style={styles.notifIcon} resizeMode="contain" />
                </TouchableOpacity>
                <TouchableOpacity style={styles.profileButton} onPress={() => navigation.navigate('PetOwnerProfile', { user })} activeOpacity={0.85}>
                  <Image source={require('../../assets/Profile.png')} style={styles.profileIcon} resizeMode="contain" />
                </TouchableOpacity>
              </View>
            </View>
          </LinearGradient>

          <View style={styles.headerBottomRow}>
            <TouchableOpacity style={[styles.menuTriggerButton, isSidebarVisible && styles.menuTriggerButtonActive]} onPress={() => setIsSidebarVisible((current) => !current)} activeOpacity={0.85}>
              <Image source={require('../../assets/List.png')} style={styles.menuTriggerIcon} resizeMode="contain" />
            </TouchableOpacity>
            <View style={styles.ownerSummary}>
              <Text style={styles.headerCaption}>Welcome</Text>
              <Text style={styles.ownerName}>{ownerName}</Text>
            </View>
          </View>
        </LinearGradient>

        <PetOwnerSideDrawer visible={isSidebarVisible} onClose={() => setIsSidebarVisible(false)} navigation={navigation} user={user} activeKey="myAppointments" />

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <LinearGradient colors={['#63B6C5', '#63B6C5', '#63B6C5']} style={styles.heroCard}>
            <Text style={styles.eyebrow}>APPOINTMENT HISTORY</Text>
            <Text style={styles.title}>My Appointments</Text>
            <Text style={styles.subtitle}>View, reschedule, or cancel your eligible appointments.</Text>
          </LinearGradient>

          <View style={styles.card}>
            {!appointments.length ? <Text style={styles.empty}>No appointments found.</Text> : appointments.map((item) => {
              const isExpanded = expandedAppointmentId === item.id;
              const canViewQueue = queueEntries.some((entry) => String(entry.appointment_id) === String(item.id));
              const canManage = item.status === 'Confirmed' && item.appointment_date >= todayLocal();
              return (
                <View key={item.id} style={styles.appointmentCard}>
                  <View style={styles.compactAppointmentRow}>
                    <TouchableOpacity
                      style={styles.appointmentRowMain}
                      onPress={() => setExpandedAppointmentId(isExpanded ? null : item.id)}
                      activeOpacity={0.78}
                      accessibilityRole="button"
                      accessibilityLabel={`${isExpanded ? 'Hide' : 'Show'} details for ${item.pet?.pet_name || 'pet'} appointment`}
                      accessibilityState={{ expanded: isExpanded }}
                    >
                      <Text style={styles.petName} numberOfLines={1}>{item.pet?.pet_name || 'Pet'}</Text>
                      <Text style={styles.appointmentMeta} numberOfLines={1}>
                        {formatDate(item.appointment_date)} · {formatTime(item.start_time)}
                      </Text>
                      <Text style={styles.appointmentHint}>{isExpanded ? 'Hide details ▲' : 'Tap to view details ▼'}</Text>
                    </TouchableOpacity>

                    <View style={styles.appointmentRowActions}>
                      <Text style={[styles.status, item.status === 'Cancelled' && styles.statusCancelled, item.status === 'Completed' && styles.statusCompleted]}>{item.status}</Text>
                      {canViewQueue && (
                        <TouchableOpacity
                          style={styles.viewQueueButton}
                          onPress={() => navigation.navigate('PetOwnerQueue', { user })}
                          activeOpacity={0.88}
                          accessibilityRole="button"
                          accessibilityLabel={`View queue for ${item.pet?.pet_name || 'pet'} appointment`}
                        >
                          <Image source={require('../../assets/List.png')} style={styles.viewQueueIcon} resizeMode="contain" />
                          <Text style={styles.viewQueueText}>View Queue</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>

                  {isExpanded && (
                    <View style={styles.appointmentDetails}>
                      <SummaryRow label="Pet Owner" value={item.owner?.full_name || ownerName} />
                      <SummaryRow label="Veterinarian" value={item.veterinarian?.full_name || '—'} />
                      <SummaryRow label="Date" value={formatDate(item.appointment_date)} />
                      <SummaryRow label="Start Time" value={formatTime(item.start_time)} />
                      <SummaryRow label="End Time" value={formatTime(item.end_time)} />
                      <SummaryRow label="Appointment Source" value={item.appointment_source || 'Online'} />
                      <SummaryRow label="Consultation Type" value={item.consultation_type || 'General Consultation'} />
                      <SummaryRow label="Visit Reason" value={item.visit_reason || '—'} />
                      <SummaryRow label="Notes" value={item.notes || '—'} />
                      <SummaryRow label="Created By" value={item.creator?.full_name || item.creator?.username || (String(item.created_by) === String(ownerId) ? ownerName : item.created_by || '—')} />
                      <SummaryRow label="Created Date" value={formatTimestamp(item.created_at)} />
                      <SummaryRow label="Updated Date" value={formatTimestamp(item.updated_at)} />
                      {canManage && (
                        <View style={styles.actionRow}>
                          <TouchableOpacity style={styles.secondaryButton} onPress={() => startReschedule(item)}><Text style={styles.secondaryText}>Reschedule</Text></TouchableOpacity>
                          <TouchableOpacity style={styles.cancelButton} onPress={() => confirmCancel(item)}><Text style={styles.cancelText}>Cancel</Text></TouchableOpacity>
                        </View>
                      )}
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        </ScrollView>

        <View style={styles.quickAssistFloat}>
          <TouchableOpacity style={styles.quickAssistTouch} onPress={() => navigation.navigate('PetOwnerQuickAssist', { user })} activeOpacity={0.88} accessibilityRole="button" accessibilityLabel="Open Quick Assist">
            <View style={styles.quickAssistIconWrap}>
              <Image source={require('../../assets/support.png')} style={styles.quickAssistIcon} resizeMode="contain" />
            </View>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </LinearGradient>
  );
}

function SummaryRow({ label, value }) {
  return <View style={styles.summaryRow}><Text style={styles.summaryLabel}>{label}</Text><Text style={styles.summaryValue}>{value}</Text></View>;
}

const styles = StyleSheet.create({
  background: { flex: 1, backgroundColor: '#f7fbfc' },
  safe: { flex: 1, backgroundColor: 'transparent' },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f7fbfc' },
  loadingText: { marginTop: 10, color: '#5d7b91', fontSize: 14 },

  headerBar: {
    marginHorizontal: 0, marginTop: 0, marginBottom: 16, paddingHorizontal: 22, paddingTop: 18, paddingBottom: 20,
    borderBottomLeftRadius: 30, borderBottomRightRadius: 30,
    shadowColor: '#447C99', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.22, shadowRadius: 16, elevation: 8,
  },
  headerTopBand: {
    marginHorizontal: -22, marginTop: -18, paddingHorizontal: 22, paddingTop: 18, paddingBottom: 16,
    borderBottomWidth: 1, borderBottomColor: 'rgba(230, 246, 250, 0.24)',
  },
  headerTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brandSection: { flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 12 },
  logoWrap: { width: 64, height: 64, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  headerLogo: { width: 48, height: 48 },
  brandBlock: { flex: 1 },
  headerTitle: { fontSize: 28, fontWeight: '900', color: '#ffffff' },
  headerSubtitle: { fontSize: 12, fontWeight: '700', color: '#c3ddee', marginTop: 3 },
  headerActions: { flexDirection: 'row', alignItems: 'center' },
  notifButton: {
    width: 46, height: 46, borderRadius: 15, backgroundColor: 'rgba(68, 124, 153, 0.42)',
    borderWidth: 1, borderColor: 'rgba(222, 242, 247, 0.34)', justifyContent: 'center', alignItems: 'center', position: 'relative',
  },
  notifBadge: {
    position: 'absolute', top: 11, right: 12, width: 9, height: 9, borderRadius: 4.5,
    backgroundColor: '#f47c6b', borderWidth: 2, borderColor: '#447C99',
  },
  notifIcon: { width: 21, height: 21, tintColor: '#ffffff' },
  profileButton: {
    width: 46, height: 46, borderRadius: 15, backgroundColor: 'rgba(68, 124, 153, 0.42)',
    borderWidth: 1, borderColor: 'rgba(222, 242, 247, 0.34)', justifyContent: 'center', alignItems: 'center', marginLeft: 10, overflow: 'hidden',
  },
  profileIcon: { width: 20, height: 20, tintColor: '#ffffff' },
  headerBottomRow: { marginTop: 14, paddingTop: 0, borderTopWidth: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  ownerSummary: { flex: 1, alignItems: 'flex-end', marginLeft: 12 },
  headerCaption: { fontSize: 12, color: '#b8d4e5', fontWeight: '700', textAlign: 'right' },
  ownerName: { fontSize: 18, fontWeight: '800', color: '#ffffff', marginTop: 4, textAlign: 'right' },
  menuTriggerButton: {
    width: 58, height: 58, borderRadius: 18, backgroundColor: 'rgba(68, 124, 153, 0.36)',
    borderWidth: 1, borderColor: 'rgba(222, 242, 247, 0.3)', justifyContent: 'center', alignItems: 'center',
  },
  menuTriggerButtonActive: { backgroundColor: 'rgba(68, 124, 153, 0.58)' },
  menuTriggerIcon: { width: 30, height: 30, tintColor: '#ffffff' },

  content: { paddingHorizontal: 18, paddingTop: 8, paddingBottom: 120 },
  heroCard: {
    borderRadius: 28, paddingHorizontal: 20, paddingVertical: 22, marginBottom: 14,
    shadowColor: '#5b84a3', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.18, shadowRadius: 16, elevation: 8,
  },
  eyebrow: { color: '#e8f5f8', fontSize: 12, fontWeight: '800', letterSpacing: 0.8, marginBottom: 5 },
  title: { color: '#ffffff', fontSize: 26, fontWeight: '800', marginBottom: 8, lineHeight: 32 },
  subtitle: { color: '#edf7fc', fontSize: 14, lineHeight: 21, fontWeight: '500', maxWidth: '95%' },
  stickyNoticeWrap: { position: 'absolute', top: 12, left: 14, right: 14, zIndex: 9999, elevation: 30 },
  stickyNotice: {
    minHeight: 58, borderRadius: 18, paddingLeft: 12, paddingRight: 8, paddingVertical: 10, flexDirection: 'row', alignItems: 'center',
    borderWidth: 1, shadowColor: '#14384a', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.22, shadowRadius: 12, elevation: 18,
  },
  stickyNoticeSuccess: { backgroundColor: '#effbf4', borderColor: '#b9e8ca' },
  stickyNoticeError: { backgroundColor: '#fff4f4', borderColor: '#f0c5c5' },
  stickyNoticeIcon: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#447C99', alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  stickyNoticeIconText: { color: '#ffffff', fontSize: 20, fontWeight: '900', lineHeight: 22 },
  stickyNoticeText: { flex: 1, color: '#24566d', fontSize: 13, lineHeight: 18, fontWeight: '800' },
  stickyNoticeClose: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', marginLeft: 4 },
  stickyNoticeCloseText: { color: '#5e7886', fontSize: 26, fontWeight: '500', lineHeight: 28 },
  card: {
    backgroundColor: '#fcfeff', borderRadius: 28, padding: 18, borderWidth: 1, borderColor: '#edf7fd', marginBottom: 20,
    shadowColor: '#63B6C5', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.15, shadowRadius: 18, elevation: 6,
  },
  viewQueueButton: { minHeight: 40, paddingHorizontal: 11, borderRadius: 13, backgroundColor: '#447C99', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  viewQueueIcon: { width: 17, height: 17, tintColor: '#ffffff' },
  viewQueueText: { color: '#ffffff', fontSize: 12, fontWeight: '900' },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 14, paddingVertical: 5, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#e2ecef' },
  summaryLabel: { color: '#78909b', fontSize: 12, fontWeight: '600', flex: 0.42 },
  summaryValue: { color: '#365f72', fontSize: 12, fontWeight: '800', textAlign: 'right', flex: 0.58 },
  actionRow: { flexDirection: 'row', gap: 10, marginTop: 16 },
  secondaryButton: { flex: 1, borderWidth: 1, borderColor: '#c6e5ed', paddingVertical: 12, borderRadius: 16, alignItems: 'center', backgroundColor: '#edf6f8' },
  secondaryText: { color: '#447C99', fontWeight: '900' },
  cancelButton: { flex: 1, borderWidth: 1, borderColor: '#e4a6a6', paddingVertical: 12, borderRadius: 16, alignItems: 'center', backgroundColor: '#fff8f8' },
  cancelText: { color: '#b54b4b', fontWeight: '800' },
  empty: { color: '#758b94', textAlign: 'center', paddingVertical: 24 },
  appointmentCard: { marginTop: 10, borderWidth: 1, borderColor: '#dceef8', borderRadius: 20, padding: 12, backgroundColor: '#fcfeff' },
  compactAppointmentRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  appointmentRowMain: { flex: 1, minWidth: 0, paddingVertical: 3 },
  appointmentRowActions: { alignItems: 'flex-end', gap: 8 },
  appointmentMeta: { color: '#5d7b91', fontSize: 12, fontWeight: '700', marginTop: 4 },
  appointmentHint: { color: '#447C99', fontSize: 11, fontWeight: '800', marginTop: 5 },
  appointmentDetails: { marginTop: 12, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#e2eef2' },
  petName: { color: '#24566d', fontSize: 16, fontWeight: '900' },
  status: { backgroundColor: '#def4e6', color: '#26704a', fontWeight: '800', fontSize: 11, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 999 },
  statusCancelled: { backgroundColor: '#fde8e8', color: '#a74646' },
  statusCompleted: { backgroundColor: '#e8eefc', color: '#4567a6' },

  quickAssistFloat: {
    position: 'absolute', right: 18, bottom: 16, width: 84, height: 84, borderRadius: 42, backgroundColor: '#447C99',
    borderWidth: 2, borderColor: '#d7eef3', alignItems: 'center', justifyContent: 'center', padding: 10,
    zIndex: 1000, elevation: 18, shadowColor: '#24566d', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.18, shadowRadius: 16,
  },
  quickAssistTouch: { width: '100%', height: '100%', borderRadius: 37, alignItems: 'center', justifyContent: 'center' },
  quickAssistIconWrap: { width: 52, height: 52, borderRadius: 26, backgroundColor: '#e7f6f8', borderWidth: 1, borderColor: '#c8e4f5', alignItems: 'center', justifyContent: 'center' },
  quickAssistIcon: { width: 30, height: 30, tintColor: '#24566d' },
});
