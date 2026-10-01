import { SafeAreaView } from 'react-native-safe-area-context';
import PetOwnerBottomNav from './PetOwnerBottomNav';
import PetOwnerHeaderGreeting from './PetOwnerHeaderGreeting';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Animated, Easing, Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Dropdown } from 'react-native-element-dropdown';
import { styles } from '../../styles/PetOwnerAppointmentDesign';
import { getQueue, subscribeToQueue } from '../../../api/queueService';
import { formatTime, todayLocal } from '../../../api/mobileAppointmentService';
import {
  getMyDoctorOffers, getQueueDoctorAlerts, getQueueVisitRescheduleOptions, getRescheduleOptions, ownerChangeQueueVisit, respondDoctorOffer,
} from '../../../api/doctorOfferService';
import { formatDayLabel } from '../../../api/vetLeaveService';

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

const pad2 = (value) => String(value).padStart(2, '0');
const nowHHMM = () => {
  const now = new Date();
  return `${pad2(now.getHours())}:${pad2(now.getMinutes())}`;
};
const drName = (name) => {
  const trimmed = String(name || '').trim();
  if (!trimmed) return 'the veterinarian';
  return /^dr\.?\s/i.test(trimmed) ? trimmed : `Dr. ${trimmed}`;
};
const dayOptions = (count) => Array.from({ length: count }, (_, index) => {
  const date = new Date();
  date.setDate(date.getDate() + index);
  const value = `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
  return { value, label: index === 0 ? 'Today' : index === 1 ? 'Tomorrow' : formatDayLabel(value) };
});

// Shown when the clinic had to change the doctor (leave / emergency). The
// visit joins the clinic's live queue only after the owner confirms.
function DoctorOfferCard({ offer, ownerId, onDone }) {
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [rescheduling, setRescheduling] = useState(false);
  const [date, setDate] = useState(offer.offer_date);
  const [slots, setSlots] = useState(null);
  const [choice, setChoice] = useState(null);

  const today = todayLocal();
  const petNames = offer.pets?.length ? offer.pets.map((pet) => pet.pet_name).join(', ') : 'your pet';
  const when = (day, time) => `${formatTime(time)}${day === today ? ' today' : ` on ${formatDayLabel(day)}`}`;
  const expired = offer.offer_date < today || (offer.offer_date === today && String(offer.proposed_time).slice(0, 5) <= nowHHMM());
  const walkIn = !(offer.appointment_ids || []).length;
  const days = useMemo(() => dayOptions(14), []);

  useEffect(() => {
    if (!rescheduling || !date) return undefined;
    let active = true;
    setSlots(null);
    setChoice(null);
    getRescheduleOptions(offer.id, date)
      .then((result) => { if (active) setSlots(result?.vets || []); })
      .catch((err) => { if (active) { setSlots([]); setError(err.message); } });
    return () => { active = false; };
  }, [rescheduling, date, offer.id]);

  const choices = useMemo(() => (slots || []).flatMap((vet) => (vet.starts || []).map((time) => ({
    value: `${vet.veterinarian_id}|${String(time).slice(0, 5)}`,
    label: `${formatTime(time)} · ${drName(vet.full_name)}`,
    time: String(time).slice(0, 5),
    veterinarianId: vet.veterinarian_id,
    vetName: vet.full_name,
  }))).sort((a, b) => a.time.localeCompare(b.time)), [slots]);

  const answer = async (action, extra, success) => {
    try {
      setBusy(action);
      setError('');
      await respondDoctorOffer(offer.id, ownerId, action, extra);
      onDone?.(success);
    } catch (err) {
      setError(err.message);
      setBusy('');
    }
  };

  const askCancel = () => Alert.alert(
    'Cancel this visit?',
    `${petNames}'s visit will be cancelled and removed from the clinic queue.`,
    [
      { text: 'Keep it', style: 'cancel' },
      { text: 'Yes, cancel visit', style: 'destructive', onPress: () => answer('cancel', {}, 'Your visit was cancelled.') },
    ],
  );

  return (
    <View style={offerStyles.card}>
      <Text style={offerStyles.eyebrow}>PLEASE CONFIRM YOUR VISIT</Text>
      <Text style={offerStyles.title}>{petNames}</Text>
      <Text style={offerStyles.message}>
        <Text style={offerStyles.bold}>{drName(offer.original_veterinarian?.full_name)}</Text> can't see {petNames} as planned
        {offer.original_time ? ` (${formatTime(offer.original_time)})` : ''} due to <Text style={offerStyles.bold}>{offer.reason}</Text>.
        {offer.notes ? ` ${offer.notes}` : ''}
      </Text>

      <View style={offerStyles.offerBox}>
        <Text style={offerStyles.offerLabel}>The clinic can offer</Text>
        <Text style={offerStyles.offerValue}>{drName(offer.proposed_veterinarian?.full_name)} · {when(offer.offer_date, offer.proposed_time)}</Text>
      </View>

      {expired ? <Text style={offerStyles.expired}>This time has already passed. Choose Reschedule, or contact the clinic for another time.</Text> : null}
      {error ? <Text style={offerStyles.error}>{error}</Text> : null}

      {!rescheduling ? (
        <View style={offerStyles.actions}>
          <TouchableOpacity
            style={[offerStyles.button, offerStyles.confirm, (Boolean(busy) || expired) && offerStyles.disabled]}
            disabled={Boolean(busy) || expired}
            onPress={() => answer('confirm', {}, `Confirmed. ${petNames} will be seen by ${drName(offer.proposed_veterinarian?.full_name)} at ${when(offer.offer_date, offer.proposed_time)}.`)}
            activeOpacity={0.85}
          >
            {busy === 'confirm' ? <ActivityIndicator color="#ffffff" /> : <Text style={offerStyles.confirmText}>Confirm</Text>}
          </TouchableOpacity>
          {!walkIn ? (
            <TouchableOpacity style={[offerStyles.button, offerStyles.secondary, Boolean(busy) && offerStyles.disabled]} disabled={Boolean(busy)} onPress={() => setRescheduling(true)} activeOpacity={0.85}>
              <Text style={offerStyles.secondaryText}>Reschedule</Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity style={[offerStyles.button, offerStyles.cancel, Boolean(busy) && offerStyles.disabled]} disabled={Boolean(busy)} onPress={askCancel} activeOpacity={0.85}>
            {busy === 'cancel' ? <ActivityIndicator color="#b34848" /> : <Text style={offerStyles.cancelText}>Cancel visit</Text>}
          </TouchableOpacity>
        </View>
      ) : (
        <View>
          <Text style={offerStyles.label}>Date</Text>
          <Dropdown
            style={offerStyles.dropdown}
            data={days}
            labelField="label"
            valueField="value"
            value={date}
            placeholder="Select date"
            onChange={(item) => setDate(item.value)}
          />
          <Text style={offerStyles.label}>Time and doctor</Text>
          {!slots ? (
            <ActivityIndicator style={offerStyles.loader} color="#2c6ba3" />
          ) : (
            <Dropdown
              style={offerStyles.dropdown}
              data={choices}
              labelField="label"
              valueField="value"
              value={choice?.value || null}
              placeholder={choices.length ? 'Choose a time' : 'No free times that day'}
              disable={!choices.length}
              onChange={(item) => setChoice(item)}
            />
          )}
          <View style={offerStyles.actions}>
            <TouchableOpacity
              style={[offerStyles.button, offerStyles.confirm, (!choice || Boolean(busy)) && offerStyles.disabled]}
              disabled={!choice || Boolean(busy)}
              onPress={() => answer('reschedule', { date, veterinarianId: choice.veterinarianId, startTime: choice.time }, `Rescheduled: ${petNames} with ${drName(choice.vetName)} at ${when(date, choice.time)}.`)}
              activeOpacity={0.85}
            >
              {busy === 'reschedule' ? <ActivityIndicator color="#ffffff" /> : <Text style={offerStyles.confirmText}>Save new time</Text>}
            </TouchableOpacity>
            <TouchableOpacity style={[offerStyles.button, offerStyles.secondary, Boolean(busy) && offerStyles.disabled]} disabled={Boolean(busy)} onPress={() => setRescheduling(false)} activeOpacity={0.85}>
              <Text style={offerStyles.secondaryText}>Back</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

// Rebook / Cancel for the owner's own waiting ticket (e.g. after their doctor
// had a sudden leave). Rebook is for booked visits; a walk-in can only cancel.
function QueueSelfService({ entry, ownerId, petNames, onDone }) {
  const [rebooking, setRebooking] = useState(false);
  const [date, setDate] = useState(todayLocal());
  const [slots, setSlots] = useState(null);
  const [choice, setChoice] = useState(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const days = useMemo(() => dayOptions(14), []);
  const booked = Boolean(entry.appointment_id || (entry.pets || []).some((pet) => pet.appointmentId));

  useEffect(() => {
    if (!rebooking || !date) return undefined;
    let active = true;
    setSlots(null);
    setChoice(null);
    getQueueVisitRescheduleOptions(entry.id, date)
      .then((result) => { if (active) setSlots(result?.vets || []); })
      .catch((err) => { if (active) { setSlots([]); setError(err.message); } });
    return () => { active = false; };
  }, [rebooking, date, entry.id]);

  const choices = useMemo(() => (slots || []).flatMap((vet) => (vet.starts || []).map((time) => ({
    value: `${vet.veterinarian_id}|${String(time).slice(0, 5)}`,
    label: `${formatTime(time)} · ${drName(vet.full_name)}`,
    time: String(time).slice(0, 5),
    veterinarianId: vet.veterinarian_id,
    vetName: vet.full_name,
  }))).sort((a, b) => a.time.localeCompare(b.time)), [slots]);

  const run = async (action, extra, success) => {
    try {
      setBusy(action);
      setError('');
      await ownerChangeQueueVisit({ ownerId, queueEntryId: entry.id, action, ...extra });
      // A rebook to today keeps this ticket on screen: back to the buttons.
      setRebooking(false);
      setBusy('');
      onDone?.(success);
    } catch (err) {
      setError(err.message);
      setBusy('');
    }
  };

  const askCancel = () => Alert.alert(
    'Cancel this visit?',
    `${petNames || 'Your pet'}'s visit will be cancelled and removed from the clinic queue.`,
    [
      { text: 'Keep it', style: 'cancel' },
      { text: 'Yes, cancel visit', style: 'destructive', onPress: () => run('cancel', {}, 'Your visit was cancelled.') },
    ],
  );

  return (
    <View style={selfStyles.wrap}>
      {error ? <Text style={offerStyles.error}>{error}</Text> : null}
      {!rebooking ? (
        <View style={[offerStyles.actions, selfStyles.actions]}>
          {booked ? (
            <TouchableOpacity style={[offerStyles.button, offerStyles.confirm, Boolean(busy) && offerStyles.disabled]} disabled={Boolean(busy)} onPress={() => setRebooking(true)} activeOpacity={0.85}>
              <Text style={offerStyles.confirmText}>Rebook</Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity style={[offerStyles.button, offerStyles.cancel, Boolean(busy) && offerStyles.disabled]} disabled={Boolean(busy)} onPress={askCancel} activeOpacity={0.85}>
            {busy === 'cancel' ? <ActivityIndicator color="#b34848" /> : <Text style={offerStyles.cancelText}>Cancel visit</Text>}
          </TouchableOpacity>
        </View>
      ) : (
        <View>
          <Text style={offerStyles.label}>Date</Text>
          <Dropdown style={offerStyles.dropdown} data={days} labelField="label" valueField="value" value={date} placeholder="Select date" onChange={(item) => setDate(item.value)} />
          <Text style={offerStyles.label}>Time and doctor</Text>
          {!slots ? (
            <ActivityIndicator style={offerStyles.loader} color="#2c6ba3" />
          ) : (
            <Dropdown
              style={offerStyles.dropdown}
              data={choices}
              labelField="label"
              valueField="value"
              value={choice?.value || null}
              placeholder={choices.length ? 'Choose a time' : 'No free times that day'}
              disable={!choices.length}
              onChange={(item) => setChoice(item)}
            />
          )}
          <View style={[offerStyles.actions, selfStyles.actions]}>
            <TouchableOpacity
              style={[offerStyles.button, offerStyles.confirm, (!choice || Boolean(busy)) && offerStyles.disabled]}
              disabled={!choice || Boolean(busy)}
              onPress={() => run('reschedule', { date, veterinarianId: choice.veterinarianId, startTime: choice.time },
                `Rebooked: ${petNames || 'your visit'} with ${drName(choice.vetName)} at ${formatTime(choice.time)}${date === todayLocal() ? ' today' : ` on ${formatDayLabel(date)}`}.`)}
              activeOpacity={0.85}
            >
              {busy === 'reschedule' ? <ActivityIndicator color="#ffffff" /> : <Text style={offerStyles.confirmText}>Confirm rebook</Text>}
            </TouchableOpacity>
            <TouchableOpacity style={[offerStyles.button, offerStyles.secondary, Boolean(busy) && offerStyles.disabled]} disabled={Boolean(busy)} onPress={() => setRebooking(false)} activeOpacity={0.85}>
              <Text style={offerStyles.secondaryText}>Back</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

export default function PetOwnerQueue({ navigation, route }) {
  const user = route?.params?.user;
  const profileImageUri = user?.profileImageUri || user?.avatar || '';
  const headerDisplayName = user?.username || user?.name || user?.fullName || 'Pet Owner';
  const ownerId = user?.id || user?.user_id || user?.profile_id;
  const [entry, setEntry] = useState(null);
  const [offers, setOffers] = useState([]);
  // The doctor on this ticket went on sudden leave / emergency.
  const [doctorAway, setDoctorAway] = useState('');
  const [notice, setNotice] = useState('');
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
      const [data, pendingOffers, alerts] = ownerId
        ? await Promise.all([
          getQueue({ ownerId }),
          getMyDoctorOffers(ownerId).catch(() => []),
          getQueueDoctorAlerts().catch(() => ({ queue: [] })),
        ])
        : [[], [], { queue: [] }];
      // Pet owners never receive the clinic's live queue list. They only see
      // their own Staff-assigned queue number, if they have checked in. A
      // ticket on hold for a doctor change shows as the offer card instead.
      const nextEntry = (data || []).find((row) => !row.doctor_offer_id && row.arrived_at && row.queue_number) || null;
      setEntry(nextEntry);
      setOffers(pendingOffers || []);
      const alert = nextEntry && nextEntry.status === 'Waiting'
        ? (alerts?.queue || []).find((item) => item.queue_entry_id === nextEntry.id && /leave/i.test(String(item.problem || '')))
        : null;
      setDoctorAway(alert ? alert.problem : '');
      setError('');
    } catch (e) {
      setEntry(null);
      setError(e?.message || e?.response?.data?.message || 'Unable to load your queue number.');
    } finally {
      setLoading(false);
    }
  }, [ownerId]);

  useEffect(() => {
    load();
    const unsubscribe = subscribeToQueue(load, { ownerId });
    const fallbackTimer = setInterval(load, 30000);
    return () => {
      unsubscribe?.();
      clearInterval(fallbackTimer);
    };
  }, [load, ownerId]);

  const handleOfferDone = (message) => {
    setNotice(message);
    load();
  };

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
  // Sudden leave: the number is on hold until the clinic offers another doctor.
  const away = Boolean(entry && doctorAway);
  const queueNumber = away ? null : entry?.queue_number || entry?.queueNumber || null;
  const queueStatus = away ? 'Waiting for a new doctor' : entry?.status || 'Not checked in';
  const pets = entry?.pets?.length ? entry.pets : (entry?.pet ? [entry.pet] : []);
  const petName = pets.length ? pets.map((p) => p.pet_name).join(', ') : 'Not assigned';
  const veterinarianName = entry?.veterinarian?.full_name
    ? (away ? `${drName(entry.veterinarian.full_name)} · unavailable` : entry.veterinarian.full_name)
    : 'Not assigned';
  const booking = entry ? bookingInfo(entry) : null;

  return (
    <LinearGradient colors={['#f7fbfc', '#eef7f8', '#ffffff']} style={styles.background}>
      <SafeAreaView style={styles.container}>
        <LinearGradient colors={['#3a7ab8', '#3a7ab8', '#3a7ab8']} style={styles.headerBar}>
          <LinearGradient colors={['#1e5a8c', '#256297', '#2c6ba3', '#3a7ab8']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.headerTopBand}>
            <View style={styles.headerTopRow}>
              <TouchableOpacity style={styles.brandSection} onPress={() => navigation.navigate('petowner-screen', { user })} activeOpacity={0.85}>
                <View style={styles.logoWrap}><Image source={require('../../assets/paw1.png')} style={styles.headerLogo} resizeMode="contain" /></View>
                <View style={styles.brandBlock}><Text style={styles.headerTitle}>PawCruz</Text><Text style={styles.headerSubtitle}>Queue</Text></View>
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
            <PetOwnerHeaderGreeting caption="Track your queue number" user={user} />
          </View>

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
          {notice ? (
            <TouchableOpacity style={offerStyles.notice} onPress={() => setNotice('')} activeOpacity={0.85}>
              <Text style={offerStyles.noticeText}>{notice}</Text>
            </TouchableOpacity>
          ) : null}

          {offers.map((offer) => (
            <DoctorOfferCard key={offer.id} offer={offer} ownerId={ownerId} onDone={handleOfferDone} />
          ))}

          <View style={personalStyles.summaryCard}>
            <View style={personalStyles.summaryHeader}>
              <Text style={personalStyles.summaryEyebrow}>CLINIC CHECK-IN</Text>
              <Text style={personalStyles.summaryTitle}>Queue Summary</Text>
            </View>

            <View style={[personalStyles.queueNumberBlock, away && personalStyles.queueNumberBlockAway]}>
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
                <Text style={personalStyles.helper}>
                  {offers.length
                    ? 'Please answer the visit update above. Your queue number appears here once you confirm.'
                    : 'Check in at the clinic reception when you arrive.'}
                </Text>
              </>
            ) : (
              <>
                {away ? (
                  <View style={personalStyles.awayBanner}>
                    <Text style={personalStyles.awayTitle}>{drName(entry.veterinarian?.full_name)} had a sudden leave and can't see {petName} as planned.</Text>
                    <Text style={personalStyles.awayText}>Your queue number is on hold. The clinic will offer you another doctor here shortly, or you can rebook or cancel below yourself.</Text>
                  </View>
                ) : null}

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

                {entry.status === 'Waiting' ? (
                  <QueueSelfService key={entry.id} entry={entry} ownerId={ownerId} petNames={petName} onDone={handleOfferDone} />
                ) : null}

                <Text style={personalStyles.helper}>{away ? "You'll get a notification as soon as another doctor is offered." : 'Keep your queue number ready while waiting at the clinic.'}</Text>
              </>
            )}
          </View>

          <TouchableOpacity style={styles.queueRefreshButton} onPress={load} activeOpacity={0.9}>
            <Text style={styles.queueRefreshButtonText}>Refresh Queue Number</Text>
          </TouchableOpacity>
        </ScrollView>

        <PetOwnerBottomNav navigation={navigation} user={user} activeKey="queue" />
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
  queueNumberBlockAway: { backgroundColor: '#9aa6ac' },
  awayBanner: { backgroundColor: '#fff4e2', borderWidth: 1, borderColor: '#f1dfb0', borderRadius: 14, padding: 13, marginTop: 16, marginBottom: 4 },
  awayTitle: { color: '#7a4f0d', fontSize: 13.5, fontWeight: '900', lineHeight: 19 },
  awayText: { color: '#865e12', fontSize: 12.5, fontWeight: '600', lineHeight: 18, marginTop: 4 },
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

const selfStyles = StyleSheet.create({
  wrap: { marginTop: 14 },
  // Centred under the ticket, like the rest of the card.
  actions: { justifyContent: 'center' },
});

const offerStyles = StyleSheet.create({
  card: {
    marginTop: 4,
    marginBottom: 14,
    marginHorizontal: 2,
    padding: 18,
    borderRadius: 24,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#f1dfb0',
    borderLeftWidth: 6,
    borderLeftColor: '#e0982f',
    shadowColor: '#173f52',
    shadowOpacity: 0.08,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 7 },
    elevation: 3,
  },
  eyebrow: { color: '#b0701c', fontSize: 11, fontWeight: '900', letterSpacing: 0.8 },
  title: { color: '#1d3a4a', fontSize: 20, fontWeight: '900', marginTop: 3 },
  message: { color: '#3e5968', fontSize: 14, lineHeight: 21, marginTop: 10 },
  bold: { fontWeight: '900', color: '#1d3a4a' },
  offerBox: {
    marginTop: 12,
    backgroundColor: '#effaf3',
    borderWidth: 1,
    borderColor: '#cdebd8',
    borderRadius: 14,
    paddingVertical: 11,
    paddingHorizontal: 13,
  },
  offerLabel: { color: '#4f7b62', fontSize: 12, fontWeight: '700' },
  offerValue: { color: '#1d4d33', fontSize: 16, fontWeight: '900', marginTop: 2 },
  expired: { color: '#b34848', fontSize: 13, fontWeight: '700', marginTop: 10 },
  error: { color: '#a94646', fontSize: 13, fontWeight: '700', marginTop: 10 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
  button: {
    minHeight: 42,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirm: { backgroundColor: '#2d9d63', borderColor: '#2d9d63' },
  confirmText: { color: '#ffffff', fontSize: 14, fontWeight: '900' },
  secondary: { backgroundColor: '#ffffff', borderColor: '#cfe4ed' },
  secondaryText: { color: '#2f6f8f', fontSize: 14, fontWeight: '800' },
  cancel: { backgroundColor: '#ffffff', borderColor: '#efc2c2' },
  cancelText: { color: '#b34848', fontSize: 14, fontWeight: '800' },
  disabled: { opacity: 0.5 },
  label: { color: '#334e5a', fontSize: 13, fontWeight: '800', marginTop: 12, marginBottom: 6 },
  dropdown: {
    minHeight: 46,
    borderWidth: 1,
    borderColor: '#cfe4ed',
    borderRadius: 12,
    paddingHorizontal: 12,
    backgroundColor: '#fbfeff',
  },
  loader: { paddingVertical: 12 },
  notice: {
    marginTop: 4,
    marginBottom: 12,
    marginHorizontal: 2,
    padding: 13,
    borderRadius: 14,
    backgroundColor: '#e9f7ef',
    borderWidth: 1,
    borderColor: '#cdebd8',
  },
  noticeText: { color: '#1d4d33', fontSize: 13.5, fontWeight: '700', lineHeight: 19 },
});
