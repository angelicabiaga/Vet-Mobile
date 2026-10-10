import { SafeAreaView } from 'react-native-safe-area-context';
import PetOwnerBottomNav from './PetOwnerBottomNav';
import PetOwnerHeaderGreeting from './PetOwnerHeaderGreeting';
import CollapsingHeaderRow from '../../../components/CollapsingHeaderRow';
import useScrollToError from '../../../hooks/useScrollToError';
import { useLowerHeaderMotion } from '../Veterinary/useLowerHeaderMotion';
import CalendarDatePicker from '../../../components/CalendarDatePicker';
import InlineSelect from '../../../components/InlineSelect';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
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
import { Dropdown, MultiSelect } from 'react-native-element-dropdown';
import { LinearGradient } from 'expo-linear-gradient';
import {
  addTenMinutes,
  cancelAppointmentsByIds,
  createAppointment,
  formatTime,
  getPetsByOwner,
  getVeterinarianAvailability,
  rescheduleAppointment,
  todayLocal,
} from '../../../api/mobileAppointmentService';

const DATE_WINDOW_DAYS = 60;

const getOwnerId = (user) => user?.id || user?.user_id || user?.profile_id || '';
// uuid v4 for appointments.visit_group_id (crypto.randomUUID isn't on every RN runtime).
const createVisitGroupId = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
  const random = Math.floor(Math.random() * 16);
  return (char === 'x' ? random : (random % 4) + 8).toString(16);
});
const pad = (value) => String(value).padStart(2, '0');
const toDateKey = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const formatDate = (value) => {
  if (!value) return '—';
  const date = new Date(`${value}T12:00:00`);
  return date.toLocaleDateString([], { month: 'long', day: 'numeric', year: 'numeric' });
};

export default function PetOwnerAppointment({ navigation, route }) {
  // Lower header row hides on scroll down, like the Veterinarian header.
  const headerMotion = useLowerHeaderMotion();
  const user = route?.params?.user || {};
  const ownerId = getOwnerId(user);
  const ownerName = user?.full_name || user?.fullName || user?.name || user?.username || 'Pet Owner';

  const [pets, setPets] = useState([]);
  const [vets, setVets] = useState([]);
  // slots: every time at least one vet is free; slotMap: each vet's free times.
  const [slots, setSlots] = useState([]);
  const [slotMap, setSlotMap] = useState({});
  // Bumped after a save so the just-taken slot drops out of the lists.
  const [availabilityVersion, setAvailabilityVersion] = useState(0);
  const [loading, setLoading] = useState(true);
  const [slotLoading, setSlotLoading] = useState(false);
  // The clinic hasn't released this vet's schedule for the chosen date yet.
  const [scheduleClosed, setScheduleClosed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(null);
  const [message, setMessage] = useState('');
  // Per-field validation shown under each input (not in the top notice).
  const [fieldErrors, setFieldErrors] = useState({});
  // A failed save scrolls back to the first field outlined in red.
  const scrollRef = useRef(null);
  const errorScroll = useScrollToError(scrollRef);
  const scrollToFirstError = (errors) => errorScroll.scrollToFirstError(errors, ['pets', 'appointmentDate', 'startTime', 'veterinarianId']);
  const clearFieldError = (...names) => setFieldErrors((current) => (
    names.some((name) => current[name]) ? names.reduce((next, name) => ({ ...next, [name]: undefined }), current) : current
  ));
  const [isSidebarVisible, setIsSidebarVisible] = useState(false);
  const [isSidebarMounted, setIsSidebarMounted] = useState(false);
  const sidebarAnimation = useRef(new Animated.Value(0)).current;
  const [form, setForm] = useState({
    // One or more pets, like the web's "Pet Selection" (several pets = one visit).
    petIds: [],
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
    { key: 'appointment', label: 'Book Appointments', icon: require('../../assets/Appointment_Icon.png'), route: 'PetOwnerAppointment' },
    { key: 'myAppointments', label: 'Appointments', icon: require('../../assets/List.png'), route: 'PetOwnerMyAppointments' },
    { key: 'pets', label: 'Animal Patients', icon: require('../../assets/Pets_Icon.png'), route: 'PetOwnerMyPets' },
    { key: 'messages', label: 'Messages', icon: require('../../assets/Message_Icon.png'), route: 'PetOwnerMessages' },
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

  const selectedPets = pets.filter((item) => form.petIds.some((id) => String(id) === String(item.id)));
  const selectedVet = vets.find((item) => String(item.id) === String(form.veterinarianId));
  const eligibleVets = useMemo(
    () => vets.filter((vet) => (slotMap[vet.id] || []).includes(form.startTime)),
    [vets, slotMap, form.startTime],
  );

  // Several pets get back-to-back 10-minute slots with the same vet, starting
  // at the chosen time (web AppointmentForm consecutiveSlots).
  const consecutiveSlots = useMemo(() => {
    const vetSlots = slotMap[form.veterinarianId] || [];
    const startIndex = vetSlots.indexOf(form.startTime);
    if (startIndex === -1) return [];
    const needed = Math.max(form.petIds.length, 1);
    const result = [vetSlots[startIndex]];
    for (let i = startIndex + 1; i < vetSlots.length && result.length < needed; i += 1) {
      if (vetSlots[i] === addTenMinutes(result[result.length - 1])) result.push(vetSlots[i]);
      else break;
    }
    return result;
  }, [slotMap, form.veterinarianId, form.startTime, form.petIds.length]);
  const notEnoughSlots = Boolean(form.petIds.length > 1 && form.veterinarianId && form.startTime && consecutiveSlots.length < form.petIds.length);
  const lastSlot = consecutiveSlots[consecutiveSlots.length - 1] || form.startTime;

  // Pet dropdown (same look as the single-pet picker); tapping a pet in the
  // list adds or removes it, so several pets can still share one visit.
  // Checklist: tick one or more pets for the visit; tap outside to close.
  const changePets = (petIds) => {
    clearFieldError('pets');
    setForm((current) => ({ ...current, petIds }));
  };

  const loadData = useCallback(async () => {
    if (!ownerId) {
      setMessage('Unable to identify the logged-in pet owner. Please sign in again.');
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      setPets(await getPetsByOwner(ownerId));
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }, [ownerId]);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  // Arriving from My Appointments' "Reschedule" button -- prefill the form
  // in editing mode instead of a blank booking. Consumed once so navigating
  // here again fresh (e.g. via the drawer) doesn't re-trigger it.
  useEffect(() => {
    const appointment = route?.params?.rescheduleAppointment;
    if (!appointment) return;
    startReschedule(appointment);
    navigation.setParams({ rescheduleAppointment: undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route?.params?.rescheduleAppointment]);

  // Back from "Add New Pet" with the pet that was just created -- select it
  // for this booking (the focus reload above brings it into the pet list).
  useEffect(() => {
    const newPetId = route?.params?.preselectedPetId;
    if (!newPetId) return;
    setForm((current) => ({
      ...current,
      petIds: current.petIds.some((id) => String(id) === String(newPetId)) ? current.petIds : [...current.petIds, newPetId],
    }));
    setMessage('New pet added successfully and selected for this booking.');
    navigation.setParams({ preselectedPetId: undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route?.params?.preselectedPetId]);

  const addNewPet = () => {
    navigation.navigate('PetOwnerMyPetsEdit', {
      user,
      returnToRoute: 'PetOwnerAppointment',
      returnToParams: {},
    });
  };

  // Same order as the web booking form: date -> available time (any vet) ->
  // veterinarian, where only the vets free at the chosen time are offered.
  useEffect(() => {
    let active = true;
    async function loadAvailability() {
      setScheduleClosed(false);
      if (!form.appointmentDate) {
        setVets([]);
        setSlotMap({});
        setSlots([]);
        return;
      }
      try {
        setSlotLoading(true);
        const result = await getVeterinarianAvailability(form.appointmentDate, editing?.id || null);
        if (!active) return;
        setVets(result.vets);
        setSlotMap(result.slotMap);
        setSlots(result.times);
        setScheduleClosed(result.unscheduled);
        // Keep a time / vet that is still free (e.g. the slot being rescheduled).
        setForm((current) => {
          const startTime = result.times.includes(current.startTime) ? current.startTime : '';
          const veterinarianId = startTime && (result.slotMap[current.veterinarianId] || []).includes(startTime)
            ? current.veterinarianId
            : '';
          return startTime === current.startTime && veterinarianId === current.veterinarianId
            ? current
            : { ...current, startTime, veterinarianId };
        });
      } catch (error) {
        if (active) setMessage(error.message);
      } finally {
        if (active) setSlotLoading(false);
      }
    }
    loadAvailability();
    return () => { active = false; };
  }, [form.appointmentDate, editing?.id, availabilityVersion]);

  const resetForm = () => {
    setEditing(null);
    setForm({ petIds: [], veterinarianId: '', appointmentDate: todayLocal(), startTime: '', visitReason: '', notes: '' });
    setSlots([]);
    setFieldErrors({});
  };

  const validateForm = () => {
    const errors = {};
    if (!form.petIds.length) errors.pets = 'Select at least one pet.';
    if (!form.appointmentDate) errors.appointmentDate = 'Select an appointment date.';
    if (!form.startTime) errors.startTime = 'Select an available time.';
    else if (!form.veterinarianId) errors.veterinarianId = 'Select a veterinarian.';
    if (!editing && !errors.startTime && !errors.veterinarianId && consecutiveSlots.length < form.petIds.length) {
      errors.startTime = `Only ${consecutiveSlots.length} consecutive slot(s) available from this time for ${form.petIds.length} pet(s). Choose an earlier time or fewer pets.`;
    }
    return errors;
  };

  const saveAppointment = async () => {
    if (saving) return;
    const errors = validateForm();
    setFieldErrors(errors);
    if (Object.keys(errors).length) {
      setMessage('');
      scrollToFirstError(errors);
      return;
    }
    try {
      setMessage('');
      if (editing) {
        setSaving(true);
        await rescheduleAppointment(editing.id, { ...form, petId: form.petIds[0], ownerId, createdBy: ownerId }, ownerId, ownerId);
        setMessage('Appointment rebooked successfully.');
        resetForm();
        return;
      }

      setSaving(true);
      const visitGroupId = form.petIds.length > 1 ? createVisitGroupId() : null;
      const createdIds = [];
      try {
        for (let index = 0; index < form.petIds.length; index += 1) {
          const created = await createAppointment({
            ...form,
            petId: form.petIds[index],
            startTime: consecutiveSlots[index],
            visitGroupId,
            ownerId,
            createdBy: ownerId,
          });
          if (created?.id) createdIds.push(created.id);
        }
      } catch (bookingError) {
        // Don't leave half a multi-pet visit booked.
        if (createdIds.length) await cancelAppointmentsByIds(createdIds, ownerId);
        throw bookingError;
      }
      setMessage(form.petIds.length > 1
        ? `${form.petIds.length} appointments booked successfully.`
        : 'Appointment booked successfully.');
      resetForm();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setSaving(false);
      setAvailabilityVersion((value) => value + 1);
    }
  };

  const startReschedule = (appointment) => {
    setEditing(appointment);
    setForm({
      petIds: [appointment.pet_id],
      veterinarianId: appointment.veterinarian_id,
      appointmentDate: appointment.appointment_date,
      startTime: appointment.start_time?.slice(0, 5) || '',
      visitReason: appointment.visit_reason || '',
      notes: appointment.notes || '',
    });
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
          colors={['#3a7ab8', '#3a7ab8', '#3a7ab8']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.headerBar}
        >
          <LinearGradient
            colors={['#1e5a8c', '#256297', '#2c6ba3', '#3a7ab8']}
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
                  <Text style={styles.headerSubtitle}>Book Appointments</Text>
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

          <CollapsingHeaderRow animation={headerMotion.lowerHeaderAnimation}>
            <View style={styles.headerBottomRow}>
              <PetOwnerHeaderGreeting caption="Book your appointment" user={user} />
            </View>
          </CollapsingHeaderRow>

        </LinearGradient>

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

        <ScrollView ref={scrollRef} onScroll={headerMotion.handleScroll} scrollEventThrottle={16} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <LinearGradient colors={['#3a7ab8', '#3a7ab8', '#3a7ab8']} style={styles.heroCard}>
            <Text style={styles.eyebrow}>GENERAL CONSULTATION</Text>
            <Text style={styles.title}>{editing ? 'Rebook Appointment' : 'Book an Appointment'}</Text>
            <Text style={styles.subtitle}>Choose your registered pet, a date and an available 10-minute slot, then a veterinarian who is free at that time. Booking hours are 9:00 AM–7:00 PM.</Text>
          </LinearGradient>

          <View style={styles.card}>
            <FieldLabel text="Pet" anchorRef={errorScroll.anchor('pets')} />
            {editing ? (
              <View style={[styles.dropdown, styles.dropdownDisabled, styles.lockedPet]}>
                <Text style={styles.petOptionText}>{selectedPets[0]?.pet_name || editing.pet?.pet_name || 'Pet'}</Text>
              </View>
            ) : (
              <MultiSelect
                style={[styles.dropdown, fieldErrors.pets && styles.fieldInvalid]}
                data={pets.map((pet) => ({ value: pet.id, label: `${pet.pet_name} — ${pet.species}${pet.breed ? ` / ${pet.breed}` : ''}` }))}
                labelField="label"
                valueField="value"
                value={form.petIds}
                placeholder={selectedPets.length
                  ? selectedPets.map((pet) => pet.pet_name).join(', ')
                  : pets.length ? 'Select your registered pet' : 'No registered pets found'}
                placeholderStyle={selectedPets.length ? styles.petPickerValue : undefined}
                visibleSelectedItem={false}
                activeColor="#e8f3fb"
                // About 5 pets visible; longer lists scroll inside the dropdown.
                maxHeight={290}
                dropdownPosition="auto"
                containerStyle={styles.petListContainer}
                renderItem={(item, selected) => (
                  <View style={styles.petCheckRow}>
                    <View style={[styles.checkbox, selected && styles.checkboxChecked]}>
                      {selected ? <Text style={styles.checkboxMark}>✓</Text> : null}
                    </View>
                    <Text style={styles.petOptionText}>{item.label}</Text>
                  </View>
                )}
                onChange={changePets}
              />
            )}
            <FieldErrorText text={fieldErrors.pets} />
            {!editing ? (
              <TouchableOpacity style={styles.addPetButton} onPress={addNewPet} activeOpacity={0.85} accessibilityRole="button">
                <Text style={styles.addPetButtonText}>+ Add New Pet</Text>
              </TouchableOpacity>
            ) : null}

            <FieldLabel text="Appointment Date" anchorRef={errorScroll.anchor('appointmentDate')} />
            <CalendarDatePicker
              value={form.appointmentDate}
              minDate={dateOptions[0]?.value}
              maxDate={dateOptions[dateOptions.length - 1]?.value}
              onChange={(value) => { clearFieldError('appointmentDate', 'startTime', 'veterinarianId'); setForm((current) => (
                value === current.appointmentDate
                  ? current
                  : { ...current, appointmentDate: value, startTime: '', veterinarianId: '' }
              )); }}
            />
            <FieldErrorText text={fieldErrors.appointmentDate} />

            <FieldLabel text="Available Time" anchorRef={errorScroll.anchor('startTime')} />
            <InlineSelect
              options={slots.map((slot) => ({ value: slot, label: formatTime(slot) }))}
              value={form.startTime}
              placeholder={slotLoading ? 'Loading available times...' : slots.length ? 'Select time' : scheduleClosed ? 'Schedule not open yet' : 'No available slots'}
              disabled={slotLoading || !slots.length}
              error={Boolean(fieldErrors.startTime)}
              onChange={(value) => { clearFieldError('startTime', 'veterinarianId'); setForm((current) => ({
                ...current,
                startTime: value,
                // Keep the chosen vet only if they're also free at the new time.
                veterinarianId: (slotMap[current.veterinarianId] || []).includes(value) ? current.veterinarianId : '',
              })); }}
            />
            <FieldErrorText text={fieldErrors.startTime} />
            {!slotLoading && scheduleClosed ? (
              <Text style={styles.scheduleNote}>The clinic hasn't released the veterinarians' schedule for this date yet. Please choose an earlier date.</Text>
            ) : null}

            <FieldLabel text="Veterinarian" anchorRef={errorScroll.anchor('veterinarianId')} />
            <Dropdown
              style={[styles.dropdown, fieldErrors.veterinarianId && styles.fieldInvalid, (!form.startTime || !eligibleVets.length) && styles.dropdownDisabled]}
              data={eligibleVets.map((vet) => ({ value: vet.id, label: vet.full_name }))}
              labelField="label" valueField="value" value={form.veterinarianId}
              disable={!form.startTime || !eligibleVets.length}
              placeholder={!form.startTime ? 'Select a time first' : eligibleVets.length ? 'Select veterinarian' : 'No veterinarian available at this time'}
              onChange={(item) => { clearFieldError('veterinarianId', 'startTime'); setForm((current) => ({ ...current, veterinarianId: item.value })); }}
            />
            <FieldErrorText text={fieldErrors.veterinarianId} />
            {notEnoughSlots && !fieldErrors.startTime ? (
              <Text style={styles.slotWarning}>
                Only {consecutiveSlots.length} consecutive slot(s) available from this time for {form.petIds.length} pets. Choose an earlier time or fewer pets.
              </Text>
            ) : null}

            <FieldLabel text="Visit Reason" optional />
            <TextInput style={styles.input} value={form.visitReason} onChangeText={(value) => setForm((current) => ({ ...current, visitReason: value }))} placeholder="Example: Routine checkup" maxLength={200} />

            <FieldLabel text="Notes" optional />
            <TextInput style={[styles.input, styles.notes]} value={form.notes} onChangeText={(value) => setForm((current) => ({ ...current, notes: value }))} placeholder="Additional information for the clinic" multiline maxLength={500} />
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Appointment Summary</Text>
            <SummaryRow
              label={selectedPets.length > 1 ? 'Pets' : 'Pet'}
              value={selectedPets.length ? selectedPets.map((pet) => `${pet.pet_name} (${pet.species})`).join(', ') : 'Not selected'}
            />
            <SummaryRow label="Pet Owner" value={ownerName} />
            <SummaryRow label="Veterinarian" value={selectedVet?.full_name || 'Not selected'} />
            <SummaryRow label="Date" value={form.appointmentDate ? formatDate(form.appointmentDate) : 'Not selected'} />
            <SummaryRow label="Start Time" value={form.startTime ? formatTime(form.startTime) : 'Not selected'} />
            <SummaryRow
              label="End Time"
              value={form.startTime
                ? `${formatTime(addTenMinutes(lastSlot))}${form.petIds.length > 1 ? ` (${form.petIds.length} slots)` : ''}`
                : 'Not selected'}
            />
            <View style={styles.queueAvailabilityNote}>
              <Text style={styles.queueAvailabilityNoteText}>
                The View Queue button will appear 30 minutes before your appointed time.
              </Text>
            </View>
            <SummaryRow label="Appointment Source" value="Online" />
            <SummaryRow label="Consultation Type" value="General Consultation" />
            <SummaryRow label="Status" value="Confirmed" />
            <View style={styles.actionRow}>
              {editing && <TouchableOpacity style={styles.secondaryButton} onPress={resetForm}><Text style={styles.secondaryText}>Cancel Rebook</Text></TouchableOpacity>}
              <TouchableOpacity style={[styles.primaryButton, notEnoughSlots && { opacity: 0.5 }]} disabled={saving || notEnoughSlots} onPress={saveAppointment}>
                <Text style={styles.primaryText}>{saving ? (editing ? 'Rebooking...' : 'Saving...') : editing ? 'Confirm Rebook' : 'Book Appointment'}</Text>
              </TouchableOpacity>
            </View>
          </View>

          <TouchableOpacity style={styles.viewAppointmentsButton} onPress={() => navigation.navigate('PetOwnerMyAppointments', { user })} activeOpacity={0.9}>
            <Text style={styles.viewAppointmentsButtonText}>View Appointments</Text>
          </TouchableOpacity>
        </ScrollView>

        <PetOwnerBottomNav navigation={navigation} user={user} activeKey="appointment" />
      </SafeAreaView>
    </LinearGradient>
  );
}

function FieldLabel({ text, optional = false, anchorRef }) {
  return <Text style={styles.label} ref={anchorRef}>{text}{optional ? <Text style={styles.optional}> (optional)</Text> : null}</Text>;
}

function FieldErrorText({ text }) {
  return text ? <Text style={styles.fieldErrorText}>{text}</Text> : null;
}

function SummaryRow({ label, value }) {
  return <View style={styles.summaryRow}><Text style={styles.summaryLabel}>{label}</Text><Text style={styles.summaryValue}>{value}</Text></View>;
}

const styles = StyleSheet.create({
  scheduleNote: { color: '#9d6817', fontSize: 12.5, fontWeight: '700', lineHeight: 18, marginTop: -4, marginBottom: 10 },
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
    shadowColor: '#2c6ba3',
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
    backgroundColor: 'rgba(44, 107, 163, 0.42)',
    borderWidth: 1, borderColor: 'rgba(222, 242, 247, 0.34)',
    justifyContent: 'center', alignItems: 'center', position: 'relative',
  },
  notifBadge: {
    position: 'absolute', top: 11, right: 12, width: 9, height: 9, borderRadius: 4.5,
    backgroundColor: '#f47c6b', borderWidth: 2, borderColor: '#2c6ba3',
  },
  notifIcon: { width: 21, height: 21, tintColor: '#ffffff' },
  profileButton: {
    width: 46, height: 46, borderRadius: 15,
    backgroundColor: 'rgba(44, 107, 163, 0.42)',
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
    backgroundColor: 'rgba(44, 107, 163, 0.36)',
    borderWidth: 1, borderColor: 'rgba(222, 242, 247, 0.3)',
    justifyContent: 'center', alignItems: 'center',
  },
  menuTriggerButtonActive: { backgroundColor: 'rgba(44, 107, 163, 0.58)' },
  menuTriggerIcon: { width: 30, height: 30, tintColor: '#ffffff' },
  sidebarOverlay: {
    ...StyleSheet.absoluteFill,
    zIndex: 3000,
    elevation: 30,
    flexDirection: 'row',
  },
  sidebarBackdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(28, 43, 51, 0.62)',
  },
  sidebarBackdropTouch: { flex: 1 },
  headerMenuPanel: {
    width: '75%', height: '100%', paddingHorizontal: 16, paddingTop: 26, paddingBottom: 20,
    backgroundColor: '#2c6ba3',
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
    width: 34, height: 34, borderRadius: 12, backgroundColor: 'rgba(44, 107, 163, 0.42)',
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
    width: 34, height: 34, borderRadius: 17, backgroundColor: '#2c6ba3',
    alignItems: 'center', justifyContent: 'center', marginRight: 10,
  },
  stickyNoticeIconText: { color: '#ffffff', fontSize: 20, fontWeight: '900', lineHeight: 22 },
  stickyNoticeText: { flex: 1, color: '#123a5e', fontSize: 13, lineHeight: 18, fontWeight: '800' },
  stickyNoticeClose: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', marginLeft: 4 },
  stickyNoticeCloseText: { color: '#5e7886', fontSize: 26, fontWeight: '500', lineHeight: 28 },
  card: {
    backgroundColor: '#fcfeff', borderRadius: 28, padding: 18,
    borderWidth: 1, borderColor: '#edf7fd', marginBottom: 20,
    shadowColor: '#3a7ab8', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.15, shadowRadius: 18, elevation: 6,
  },
  label: { color: '#123a5e', fontSize: 14, fontWeight: '800', marginBottom: 7, marginTop: 12 },
  optional: { color: '#78909b', fontWeight: '600' },
  dropdown: { minHeight: 52, borderWidth: 1, borderColor: '#cee2e9', borderRadius: 16, paddingHorizontal: 14, backgroundColor: '#fbfdfe' },
  dropdownDisabled: { backgroundColor: '#f1f5f7', opacity: 0.75 },
  lockedPet: { justifyContent: 'center' },
  petSelectBox: { borderWidth: 1, borderColor: '#cee2e9', borderRadius: 16, padding: 10, backgroundColor: '#fbfdfe', gap: 8 },
  petSelectSummary: { color: '#5d7b91', fontSize: 12.5, fontWeight: '800', paddingHorizontal: 4 },
  petOption: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 10, paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: '#e2eef2', backgroundColor: '#ffffff' },
  petOptionChecked: { borderColor: '#2c6ba3', backgroundColor: '#edf6fb' },
  petPickerValue: { color: '#294b5d', fontSize: 16 },
  petOptionText: { flex: 1, color: '#294b5d', fontSize: 14, fontWeight: '700' },
  petListContainer: { borderRadius: 14, borderWidth: 1, borderColor: '#cee2e9', overflow: 'hidden', marginTop: 4 },
  petCheckRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14 },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: '#9fc3d6', alignItems: 'center', justifyContent: 'center', backgroundColor: '#ffffff' },
  checkboxChecked: { backgroundColor: '#2c6ba3', borderColor: '#2c6ba3' },
  checkboxMark: { color: '#ffffff', fontSize: 14, fontWeight: '900', lineHeight: 16 },
  fieldInvalid: { borderColor: '#dc2626' },
  fieldErrorText: { color: '#dc2626', fontSize: 12.5, fontWeight: '700', lineHeight: 18, marginTop: 6 },
  slotWarning: { color: '#b54b4b', fontSize: 12.5, fontWeight: '700', lineHeight: 18, marginTop: 8 },
  addPetButton: { alignSelf: 'flex-start', marginTop: 10, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 12, borderWidth: 1, borderColor: '#c6e5ed', backgroundColor: '#edf6f8' },
  addPetButtonText: { color: '#2c6ba3', fontSize: 13, fontWeight: '900' },
  input: { minHeight: 52, borderWidth: 1, borderColor: '#cee2e9', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 11, color: '#294b5d', backgroundColor: '#fbfdfe', fontWeight: '600', fontSize: 14 },
  notes: { minHeight: 96, textAlignVertical: 'top' },
  sectionTitle: { color: '#123a5e', fontSize: 20, fontWeight: '900', marginBottom: 5 },
  queueAvailabilityNote: { backgroundColor: '#edf6f8', borderRadius: 13, paddingHorizontal: 12, paddingVertical: 9, marginVertical: 8, borderWidth: 1, borderColor: '#d5e9ee' },
  queueAvailabilityNoteText: { color: '#527586', fontSize: 11, lineHeight: 16, fontWeight: '700' },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 14, paddingVertical: 9, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#e2ecef' },
  summaryLabel: { color: '#78909b', fontSize: 12, fontWeight: '600', flex: 0.42 },
  summaryValue: { color: '#365f72', fontSize: 12, fontWeight: '800', textAlign: 'right', flex: 0.58 },
  actionRow: { flexDirection: 'row', gap: 10, marginTop: 16 },
  primaryButton: { flex: 1, backgroundColor: '#2c6ba3', paddingVertical: 14, borderRadius: 16, alignItems: 'center' },
  primaryText: { color: '#fff', fontWeight: '900' },
  secondaryButton: { flex: 1, borderWidth: 1, borderColor: '#c6e5ed', paddingVertical: 12, borderRadius: 16, alignItems: 'center', backgroundColor: '#edf6f8' },
  secondaryText: { color: '#2c6ba3', fontWeight: '900' },
  viewAppointmentsButton: { borderWidth: 1, borderColor: '#c6e5ed', backgroundColor: '#edf6f8', borderRadius: 16, paddingVertical: 14, alignItems: 'center' },
  viewAppointmentsButtonText: { color: '#2c6ba3', fontWeight: '900', fontSize: 14 },

  quickAssistFloat: {
    position: 'absolute',
    right: 18,
    bottom: 16,
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: '#2c6ba3',
    borderWidth: 2,
    borderColor: '#d7eef3',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 10,
    zIndex: 1000,
    elevation: 18,
    shadowColor: '#123a5e',
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
    tintColor: '#123a5e',
  },
});
