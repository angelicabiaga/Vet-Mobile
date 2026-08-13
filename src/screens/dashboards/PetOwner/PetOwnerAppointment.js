import { SafeAreaView } from 'react-native-safe-area-context';
import PetOwnerSideDrawer from './PetOwnerSideDrawer';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Dropdown } from 'react-native-element-dropdown';
import { LinearGradient } from 'expo-linear-gradient';
import {
  addTenMinutes,
  cancelAppointment,
  createAppointment,
  formatTime,
  getAvailableSlots,
  getOwnerAppointments,
  getPetsByOwner,
  getVeterinarians,
  rescheduleAppointment,
  todayLocal,
} from '../../../api/mobileAppointmentService';
import { supabase } from '../../../config/supabaseClient';

const DATE_WINDOW_DAYS = 60;

const getOwnerId = (user) => user?.id || user?.user_id || user?.profile_id || '';
const pad = (value) => String(value).padStart(2, '0');
const toDateKey = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
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
const getAppointmentStart = (dateValue, timeValue) => {
  if (!dateValue || !timeValue) return null;
  const start = new Date(`${dateValue}T${String(timeValue).slice(0, 5)}:00`);
  return Number.isNaN(start.getTime()) ? null : start;
};

export default function PetOwnerAppointment({ navigation, route }) {
  const user = route?.params?.user || {};
  const ownerId = getOwnerId(user);
  const ownerName = user?.full_name || user?.fullName || user?.name || user?.username || 'Pet Owner';

  const [pets, setPets] = useState([]);
  const [vets, setVets] = useState([]);
  const [slots, setSlots] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [slotLoading, setSlotLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(null);
  const [expandedAppointmentId, setExpandedAppointmentId] = useState(null);
  const [currentTime, setCurrentTime] = useState(() => new Date());
  const [message, setMessage] = useState('');
  const [isSidebarVisible, setIsSidebarVisible] = useState(false);
  const [isSidebarMounted, setIsSidebarMounted] = useState(false);
  const sidebarAnimation = useRef(new Animated.Value(0)).current;
  const [form, setForm] = useState({
    petId: '',
    veterinarianId: '',
    appointmentDate: todayLocal(),
    startTime: '',
    visitReason: '',
    notes: '',
  });

  useEffect(() => {
    if (!message || !message.toLowerCase().includes('successfully')) return undefined;
    const timer = setTimeout(() => setMessage(''), 4500);
    return () => clearTimeout(timer);
  }, [message]);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (isSidebarVisible) {
      setIsSidebarMounted(true);
      sidebarAnimation.setValue(0);
      Animated.spring(sidebarAnimation, {
        toValue: 1,
        damping: 20,
        stiffness: 180,
        mass: 0.8,
        useNativeDriver: true,
      }).start();
      return undefined;
    }

    if (!isSidebarMounted) return undefined;
    Animated.timing(sidebarAnimation, {
      toValue: 0,
      duration: 220,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) setIsSidebarMounted(false);
    });
    return undefined;
  }, [isSidebarMounted, isSidebarVisible, sidebarAnimation]);

  const sidebarItems = [
    { key: 'dashboard', label: 'Dashboard', icon: require('../../assets/Dashboard_Icon.png'), route: 'petowner-screen' },
    { key: 'appointment', label: 'Appointment', icon: require('../../assets/Appointment_Icon.png'), route: 'PetOwnerAppointment' },
    { key: 'pets', label: 'My Pets', icon: require('../../assets/Pets_Icon.png'), route: 'PetOwnerMyPets' },
    { key: 'messages', label: 'Messages', icon: require('../../assets/Message_Icon.png'), route: 'PetOwnerMessages' },
    { key: 'medical', label: 'Medical Records', icon: require('../../assets/Medical_Icon.png'), route: 'PetOwnerMedRec' },

  ];

  const handleSidebarPress = (item) => {
    setIsSidebarVisible(false);
    navigation.navigate(item.route, { user });
  };

  const dateOptions = useMemo(() => {
    const base = new Date();
    return Array.from({ length: DATE_WINDOW_DAYS }, (_, index) => {
      const date = new Date(base.getFullYear(), base.getMonth(), base.getDate() + index);
      const value = toDateKey(date);
      return {
        value,
        label: date.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }),
      };
    });
  }, []);

  const selectedPet = pets.find((item) => String(item.id) === String(form.petId));
  const selectedVet = vets.find((item) => String(item.id) === String(form.veterinarianId));

  const loadData = useCallback(async () => {
    if (!ownerId) {
      setMessage('Unable to identify the logged-in pet owner. Please sign in again.');
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const [petRows, vetRows, appointmentRows] = await Promise.all([
        getPetsByOwner(ownerId),
        getVeterinarians(),
        getOwnerAppointments(ownerId),
      ]);
      setPets(petRows);
      setVets(vetRows);
      setAppointments(appointmentRows);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }, [ownerId]);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  useEffect(() => {
    if (!ownerId) return undefined;

    let active = true;
    const channel = supabase
      .channel(`mobile-owner-appointments-${ownerId}-${Date.now()}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'appointments',
          filter: `owner_id=eq.${ownerId}`,
        },
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

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [ownerId]);

  useEffect(() => {
    let active = true;
    async function loadSlots() {
      setForm((current) => ({ ...current, startTime: '' }));
      if (!form.veterinarianId || !form.appointmentDate) {
        setSlots([]);
        return;
      }
      try {
        setSlotLoading(true);
        const rows = await getAvailableSlots(form.veterinarianId, form.appointmentDate, editing?.id || null);
        if (active) setSlots(rows);
      } catch (error) {
        if (active) setMessage(error.message);
      } finally {
        if (active) setSlotLoading(false);
      }
    }
    loadSlots();
    return () => { active = false; };
  }, [form.veterinarianId, form.appointmentDate, editing?.id]);

  const resetForm = () => {
    setEditing(null);
    setForm({ petId: '', veterinarianId: '', appointmentDate: todayLocal(), startTime: '', visitReason: '', notes: '' });
    setSlots([]);
  };

  const saveAppointment = async () => {
    try {
      setMessage('');
      setSaving(true);
      const payload = { ...form, ownerId, createdBy: ownerId };
      if (editing) {
        await rescheduleAppointment(editing.id, payload, ownerId, ownerId);
        setMessage('Appointment rescheduled successfully.');
      } else {
        await createAppointment(payload);
        setMessage('Appointment booked successfully.');
      }
      resetForm();
      setAppointments(await getOwnerAppointments(ownerId));
    } catch (error) {
      setMessage(error.message);
    } finally {
      setSaving(false);
    }
  };

  const startReschedule = (appointment) => {
    setEditing(appointment);
    setForm({
      petId: appointment.pet_id,
      veterinarianId: appointment.veterinarian_id,
      appointmentDate: appointment.appointment_date,
      startTime: appointment.start_time?.slice(0, 5) || '',
      visitReason: appointment.visit_reason || '',
      notes: appointment.notes || '',
    });
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
            if (editing?.id === appointment.id) resetForm();
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
        <LinearGradient
          colors={['#63B6C5', '#63B6C5', '#63B6C5']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.headerBar}
        >
          <LinearGradient
            colors={['#1f4e66', '#2f6f86', '#447C99', '#5f9eb4']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.headerTopBand}
          >
            <View style={styles.headerTopRow}>
              <TouchableOpacity
                style={styles.brandSection}
                onPress={() => navigation.navigate('petowner-screen', { user })}
                activeOpacity={0.85}
              >
                <View style={styles.logoWrap}>
                  <Image source={require('../../assets/paw1.png')} style={styles.headerLogo} resizeMode="contain" />
                </View>
                <View style={styles.brandBlock}>
                  <Text style={styles.headerTitle}>PawCruz</Text>
                  <Text style={styles.headerSubtitle}>Pet Owner Appointment</Text>
                </View>
              </TouchableOpacity>

              <View style={styles.headerActions}>
                <TouchableOpacity
                  style={styles.notifButton}
                  onPress={() => navigation.navigate('PetOwnerNotif', { user })}
                  activeOpacity={0.85}
                >
                  <View style={styles.notifBadge} />
                  <Image source={require('../../assets/Bell_Icon.png')} style={styles.notifIcon} resizeMode="contain" />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.profileButton}
                  onPress={() => navigation.navigate('PetOwnerProfile', { user })}
                  activeOpacity={0.85}
                >
                  <Image source={require('../../assets/Profile.png')} style={styles.profileIcon} resizeMode="contain" />
                </TouchableOpacity>
              </View>
            </View>
          </LinearGradient>

          <View style={styles.headerBottomRow}>
            <TouchableOpacity
              style={[styles.menuTriggerButton, isSidebarVisible && styles.menuTriggerButtonActive]}
              onPress={() => setIsSidebarVisible((current) => !current)}
              activeOpacity={0.85}
            >
              <Image source={require('../../assets/List.png')} style={styles.menuTriggerIcon} resizeMode="contain" />
            </TouchableOpacity>
            <View style={styles.ownerSummary}>
              <Text style={styles.headerCaption}>Welcome</Text>
              <Text style={styles.ownerName}>{ownerName}</Text>
            </View>
          </View>

        </LinearGradient>

        <PetOwnerSideDrawer visible={isSidebarVisible} onClose={() => setIsSidebarVisible(false)} navigation={navigation} user={user} activeKey="appointment" />
        {false && isSidebarMounted ? (
          <View style={styles.sidebarOverlay}>
            <Animated.View style={[styles.sidebarBackdrop, { opacity: sidebarAnimation }]}>
              <TouchableOpacity
                style={styles.sidebarBackdropTouch}
                onPress={() => setIsSidebarVisible(false)}
                activeOpacity={1}
                accessibilityRole="button"
                accessibilityLabel="Close navigation menu"
              />
            </Animated.View>

            <Animated.View
              style={[
                styles.headerMenuPanel,
                {
                  transform: [{
                    translateX: sidebarAnimation.interpolate({
                      inputRange: [0, 1],
                      outputRange: [-420, 0],
                    }),
                  }],
                },
              ]}
            >
              <View style={styles.sidebarHeader}>
                <View>
                  <Text style={styles.sidebarTitle}>Navigation</Text>
                  <Text style={styles.sidebarSubtitle}>PawCruz Pet Owner</Text>
                </View>
                <TouchableOpacity
                  style={styles.sidebarCloseButton}
                  onPress={() => setIsSidebarVisible(false)}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityLabel="Close navigation menu"
                >
                  <Text style={styles.sidebarCloseText}>×</Text>
                </TouchableOpacity>
              </View>

              {sidebarItems.map((item) => {
                const active = item.key === 'appointment';
                return (
                  <TouchableOpacity
                    key={item.key}
                    style={[styles.headerMenuItem, active && styles.headerMenuItemActive]}
                    onPress={() => handleSidebarPress(item)}
                    activeOpacity={0.88}
                  >
                    <View style={[styles.headerMenuItemIconWrap, active && styles.headerMenuItemIconWrapActive]}>
                      <Image source={item.icon} style={styles.headerMenuItemIcon} resizeMode="contain" />
                    </View>
                    <Text style={styles.headerMenuItemLabel}>{item.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </Animated.View>
          </View>
        ) : null}

        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <LinearGradient colors={['#63B6C5', '#63B6C5', '#63B6C5']} style={styles.heroCard}>
            <Text style={styles.eyebrow}>GENERAL CONSULTATION</Text>
            <Text style={styles.title}>{editing ? 'Reschedule Appointment' : 'Book an Appointment'}</Text>
            <Text style={styles.subtitle}>Choose your registered pet, veterinarian, date, and an available 10-minute slot. Booking hours are 9:00 AM–7:00 PM.</Text>
          </LinearGradient>

          <View style={styles.card}>
            <FieldLabel text="Pet" />
            <Dropdown
              style={styles.dropdown}
              data={pets.map((pet) => ({ value: pet.id, label: `${pet.pet_name} — ${pet.species}${pet.breed ? ` / ${pet.breed}` : ''}` }))}
              labelField="label" valueField="value" value={form.petId}
              placeholder={pets.length ? 'Select your registered pet' : 'No registered pets found'}
              onChange={(item) => setForm((current) => ({ ...current, petId: item.value }))}
            />

            <FieldLabel text="Veterinarian" />
            <Dropdown
              style={styles.dropdown}
              data={vets.map((vet) => ({ value: vet.id, label: vet.full_name }))}
              labelField="label" valueField="value" value={form.veterinarianId}
              placeholder="Select veterinarian"
              onChange={(item) => setForm((current) => ({ ...current, veterinarianId: item.value }))}
            />

            <FieldLabel text="Appointment Date" />
            <Dropdown
              style={styles.dropdown}
              data={dateOptions}
              labelField="label" valueField="value" value={form.appointmentDate}
              placeholder="Select date"
              onChange={(item) => setForm((current) => ({ ...current, appointmentDate: item.value }))}
            />

            <FieldLabel text="Available Time" />
            <Dropdown
              style={styles.dropdown}
              data={slots.map((slot) => ({ value: slot, label: `${formatTime(slot)} – ${formatTime(addTenMinutes(slot))}` }))}
              labelField="label" valueField="value" value={form.startTime}
              placeholder={slotLoading ? 'Loading available times...' : slots.length ? 'Select available time' : 'No available slots'}
              disable={slotLoading || !form.veterinarianId || !slots.length}
              onChange={(item) => setForm((current) => ({ ...current, startTime: item.value }))}
            />

            <FieldLabel text="Visit Reason" optional />
            <TextInput style={styles.input} value={form.visitReason} onChangeText={(value) => setForm((current) => ({ ...current, visitReason: value }))} placeholder="Example: Routine checkup" maxLength={200} />

            <FieldLabel text="Notes" optional />
            <TextInput style={[styles.input, styles.notes]} value={form.notes} onChangeText={(value) => setForm((current) => ({ ...current, notes: value }))} placeholder="Additional information for the clinic" multiline maxLength={500} />
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Appointment Summary</Text>
            <SummaryRow label="Pet" value={selectedPet ? `${selectedPet.pet_name} (${selectedPet.species})` : 'Not selected'} />
            <SummaryRow label="Pet Owner" value={ownerName} />
            <SummaryRow label="Veterinarian" value={selectedVet?.full_name || 'Not selected'} />
            <SummaryRow label="Date" value={form.appointmentDate ? formatDate(form.appointmentDate) : 'Not selected'} />
            <SummaryRow label="Start Time" value={form.startTime ? formatTime(form.startTime) : 'Not selected'} />
            <SummaryRow label="End Time" value={form.startTime ? formatTime(addTenMinutes(form.startTime)) : 'Not selected'} />
            <View style={styles.queueAvailabilityNote}>
              <Text style={styles.queueAvailabilityNoteText}>
                The View Queue button will appear 30 minutes before your appointed time.
              </Text>
            </View>
            <SummaryRow label="Appointment Source" value="Online" />
            <SummaryRow label="Consultation Type" value="General Consultation" />
            <SummaryRow label="Status" value="Confirmed" />
            <View style={styles.actionRow}>
              {editing && <TouchableOpacity style={styles.secondaryButton} onPress={resetForm}><Text style={styles.secondaryText}>Cancel Reschedule</Text></TouchableOpacity>}
              <TouchableOpacity style={styles.primaryButton} disabled={saving} onPress={saveAppointment}>
                <Text style={styles.primaryText}>{saving ? 'Saving...' : editing ? 'Save New Schedule' : 'Book Appointment'}</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>My Appointments</Text>
            <Text style={styles.sectionCaption}>View, reschedule, or cancel eligible appointments.</Text>
            {!appointments.length ? <Text style={styles.empty}>No appointments found.</Text> : appointments.map((item) => {
              const isExpanded = expandedAppointmentId === item.id;
              const appointmentStart = getAppointmentStart(item.appointment_date, item.start_time);
              const queueOpensAt = appointmentStart ? new Date(appointmentStart.getTime() - (30 * 60 * 1000)) : null;
              const normalizedStatus = String(item.status || '').trim().toLowerCase();
              const canViewQueue = Boolean(
                queueOpensAt
                && item.appointment_date === toDateKey(currentTime)
                && currentTime >= queueOpensAt
                && normalizedStatus !== 'completed'
                && normalizedStatus !== 'cancelled'
              );
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
                      <SummaryRow label="Pet Owner" value={item.owner?.full_name || ownerName} compact />
                      <SummaryRow label="Veterinarian" value={item.veterinarian?.full_name || '—'} compact />
                      <SummaryRow label="Date" value={formatDate(item.appointment_date)} compact />
                      <SummaryRow label="Start Time" value={formatTime(item.start_time)} compact />
                      <SummaryRow label="End Time" value={formatTime(item.end_time)} compact />
                      <SummaryRow label="Appointment Source" value={item.appointment_source || 'Online'} compact />
                      <SummaryRow label="Consultation Type" value={item.consultation_type || 'General Consultation'} compact />
                      <SummaryRow label="Visit Reason" value={item.visit_reason || '—'} compact />
                      <SummaryRow label="Notes" value={item.notes || '—'} compact />
                      <SummaryRow label="Created By" value={item.creator?.full_name || item.creator?.username || (String(item.created_by) === String(ownerId) ? ownerName : item.created_by || '—')} compact />
                      <SummaryRow label="Created Date" value={formatTimestamp(item.created_at)} compact />
                      <SummaryRow label="Updated Date" value={formatTimestamp(item.updated_at)} compact />
                      {item.status === 'Confirmed' && (
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
          <TouchableOpacity
            style={styles.quickAssistTouch}
            onPress={() => navigation.navigate('PetOwnerQuickAssist', { user })}
            activeOpacity={0.88}
            accessibilityRole="button"
            accessibilityLabel="Open Quick Assist"
          >
            <View style={styles.quickAssistIconWrap}>
              <Image
                source={require('../../assets/support.png')}
                style={styles.quickAssistIcon}
                resizeMode="contain"
              />
            </View>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </LinearGradient>
  );
}

function FieldLabel({ text, optional = false }) {
  return <Text style={styles.label}>{text}{optional ? <Text style={styles.optional}> (optional)</Text> : null}</Text>;
}

function SummaryRow({ label, value, compact = false }) {
  return <View style={[styles.summaryRow, compact && styles.summaryCompact]}><Text style={styles.summaryLabel}>{label}</Text><Text style={styles.summaryValue}>{value}</Text></View>;
}

const styles = StyleSheet.create({
  background: { flex: 1, backgroundColor: '#f7fbfc' },
  safe: { flex: 1, backgroundColor: 'transparent' },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f7fbfc' },
  loadingText: { marginTop: 10, color: '#5d7b91', fontSize: 14 },

  headerBar: {
    marginHorizontal: 0,
    marginTop: 0,
    marginBottom: 16,
    paddingHorizontal: 22,
    paddingTop: 18,
    paddingBottom: 20,
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
    shadowColor: '#447C99',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.22,
    shadowRadius: 16,
    elevation: 8,
  },
  headerTopBand: {
    marginHorizontal: -22,
    marginTop: -18,
    paddingHorizontal: 22,
    paddingTop: 18,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(230, 246, 250, 0.24)',
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
    width: 46, height: 46, borderRadius: 15,
    backgroundColor: 'rgba(68, 124, 153, 0.42)',
    borderWidth: 1, borderColor: 'rgba(222, 242, 247, 0.34)',
    justifyContent: 'center', alignItems: 'center', position: 'relative',
  },
  notifBadge: {
    position: 'absolute', top: 11, right: 12, width: 9, height: 9, borderRadius: 4.5,
    backgroundColor: '#f47c6b', borderWidth: 2, borderColor: '#447C99',
  },
  notifIcon: { width: 21, height: 21, tintColor: '#ffffff' },
  profileButton: {
    width: 46, height: 46, borderRadius: 15,
    backgroundColor: 'rgba(68, 124, 153, 0.42)',
    borderWidth: 1, borderColor: 'rgba(222, 242, 247, 0.34)',
    justifyContent: 'center', alignItems: 'center', marginLeft: 10, overflow: 'hidden',
  },
  profileIcon: { width: 20, height: 20, tintColor: '#ffffff' },
  headerBottomRow: {
    marginTop: 14, paddingTop: 0, borderTopWidth: 0,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  ownerSummary: { flex: 1, alignItems: 'flex-end', marginLeft: 12 },
  headerCaption: { fontSize: 12, color: '#b8d4e5', fontWeight: '700', textAlign: 'right' },
  ownerName: { fontSize: 18, fontWeight: '800', color: '#ffffff', marginTop: 4, textAlign: 'right' },
  menuTriggerButton: {
    width: 58, height: 58, borderRadius: 18,
    backgroundColor: 'rgba(68, 124, 153, 0.36)',
    borderWidth: 1, borderColor: 'rgba(222, 242, 247, 0.3)',
    justifyContent: 'center', alignItems: 'center',
  },
  menuTriggerButtonActive: { backgroundColor: 'rgba(68, 124, 153, 0.58)' },
  menuTriggerIcon: { width: 30, height: 30, tintColor: '#ffffff' },
  sidebarOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 3000,
    elevation: 30,
    flexDirection: 'row',
  },
  sidebarBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(28, 43, 51, 0.62)',
  },
  sidebarBackdropTouch: { flex: 1 },
  headerMenuPanel: {
    width: '75%', height: '100%', paddingHorizontal: 16, paddingTop: 26, paddingBottom: 20,
    backgroundColor: '#447C99',
    borderTopRightRadius: 30, borderBottomRightRadius: 30,
    borderRightWidth: 1, borderRightColor: 'rgba(255,255,255,0.18)',
    shadowColor: '#14384a', shadowOffset: { width: 8, height: 0 }, shadowOpacity: 0.28, shadowRadius: 18,
    elevation: 32,
  },
  sidebarHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28, paddingHorizontal: 4 },
  sidebarTitle: { color: '#ffffff', fontSize: 23, fontWeight: '900' },
  sidebarSubtitle: { color: '#d8edf3', fontSize: 12, fontWeight: '700', marginTop: 4 },
  sidebarCloseButton: { width: 42, height: 42, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' },
  sidebarCloseText: { color: '#ffffff', fontSize: 28, fontWeight: '500', lineHeight: 30 },
  headerMenuItem: {
    minHeight: 58, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.22)',
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, marginBottom: 12,
  },
  headerMenuItemActive: { backgroundColor: 'rgba(255,255,255,0.34)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.30)' },
  headerMenuItemIconWrap: {
    width: 34, height: 34, borderRadius: 12, backgroundColor: 'rgba(68, 124, 153, 0.42)',
    justifyContent: 'center', alignItems: 'center', marginRight: 14,
  },
  headerMenuItemIconWrapActive: { backgroundColor: 'rgba(38,96,126,0.82)' },
  headerMenuItemIcon: { width: 20, height: 20, tintColor: '#ffffff' },
  headerMenuItemLabel: { flex: 1, fontSize: 14, fontWeight: '800', color: '#ffffff' },

  content: { paddingHorizontal: 18, paddingTop: 8, paddingBottom: 120 },
  heroCard: {
    borderRadius: 28, paddingHorizontal: 20, paddingVertical: 22, marginBottom: 18,
    shadowColor: '#5b84a3', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.18, shadowRadius: 16, elevation: 8,
  },
  eyebrow: { color: '#e8f5f8', fontSize: 12, fontWeight: '800', letterSpacing: 0.8, marginBottom: 5 },
  title: { color: '#ffffff', fontSize: 26, fontWeight: '800', marginBottom: 8, lineHeight: 32 },
  subtitle: { color: '#edf7fc', fontSize: 14, lineHeight: 21, fontWeight: '500', maxWidth: '95%' },
  stickyNoticeWrap: {
    position: 'absolute',
    top: 12,
    left: 14,
    right: 14,
    zIndex: 9999,
    elevation: 30,
  },
  stickyNotice: {
    minHeight: 58,
    borderRadius: 18,
    paddingLeft: 12,
    paddingRight: 8,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    shadowColor: '#14384a',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.22,
    shadowRadius: 12,
    elevation: 18,
  },
  stickyNoticeSuccess: { backgroundColor: '#effbf4', borderColor: '#b9e8ca' },
  stickyNoticeError: { backgroundColor: '#fff4f4', borderColor: '#f0c5c5' },
  stickyNoticeIcon: {
    width: 34, height: 34, borderRadius: 17, backgroundColor: '#447C99',
    alignItems: 'center', justifyContent: 'center', marginRight: 10,
  },
  stickyNoticeIconText: { color: '#ffffff', fontSize: 20, fontWeight: '900', lineHeight: 22 },
  stickyNoticeText: { flex: 1, color: '#24566d', fontSize: 13, lineHeight: 18, fontWeight: '800' },
  stickyNoticeClose: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', marginLeft: 4 },
  stickyNoticeCloseText: { color: '#5e7886', fontSize: 26, fontWeight: '500', lineHeight: 28 },
  card: {
    backgroundColor: '#fcfeff', borderRadius: 28, padding: 18,
    borderWidth: 1, borderColor: '#edf7fd', marginBottom: 20,
    shadowColor: '#63B6C5', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.15, shadowRadius: 18, elevation: 6,
  },
  label: { color: '#24566d', fontSize: 14, fontWeight: '800', marginBottom: 7, marginTop: 12 },
  optional: { color: '#78909b', fontWeight: '600' },
  dropdown: { minHeight: 52, borderWidth: 1, borderColor: '#cee2e9', borderRadius: 16, paddingHorizontal: 14, backgroundColor: '#fbfdfe' },
  input: { minHeight: 52, borderWidth: 1, borderColor: '#cee2e9', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 11, color: '#294b5d', backgroundColor: '#fbfdfe', fontWeight: '600', fontSize: 14 },
  notes: { minHeight: 96, textAlignVertical: 'top' },
  sectionTitle: { color: '#24566d', fontSize: 20, fontWeight: '900', marginBottom: 5 },
  viewQueueButton: { minHeight: 40, paddingHorizontal: 11, borderRadius: 13, backgroundColor: '#447C99', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  viewQueueIcon: { width: 17, height: 17, tintColor: '#ffffff' },
  viewQueueText: { color: '#ffffff', fontSize: 12, fontWeight: '900' },
  sectionCaption: { color: '#5d7b91', fontSize: 12, fontWeight: '600', marginBottom: 12 },
  queueAvailabilityNote: { backgroundColor: '#edf6f8', borderRadius: 13, paddingHorizontal: 12, paddingVertical: 9, marginVertical: 8, borderWidth: 1, borderColor: '#d5e9ee' },
  queueAvailabilityNoteText: { color: '#527586', fontSize: 11, lineHeight: 16, fontWeight: '700' },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 14, paddingVertical: 9, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#e2ecef' },
  summaryCompact: { paddingVertical: 5 },
  summaryLabel: { color: '#78909b', fontSize: 12, fontWeight: '600', flex: 0.42 },
  summaryValue: { color: '#365f72', fontSize: 12, fontWeight: '800', textAlign: 'right', flex: 0.58 },
  actionRow: { flexDirection: 'row', gap: 10, marginTop: 16 },
  primaryButton: { flex: 1, backgroundColor: '#447C99', paddingVertical: 14, borderRadius: 16, alignItems: 'center' },
  primaryText: { color: '#fff', fontWeight: '900' },
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
    position: 'absolute',
    right: 18,
    bottom: 16,
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: '#447C99',
    borderWidth: 2,
    borderColor: '#d7eef3',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 10,
    zIndex: 1000,
    elevation: 18,
    shadowColor: '#24566d',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
  },
  quickAssistTouch: {
    width: '100%',
    height: '100%',
    borderRadius: 37,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickAssistIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#e7f6f8',
    borderWidth: 1,
    borderColor: '#c8e4f5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickAssistIcon: {
    width: 30,
    height: 30,
    tintColor: '#24566d',
  },
});
