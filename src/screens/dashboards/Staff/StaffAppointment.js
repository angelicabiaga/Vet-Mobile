import { SafeAreaView } from 'react-native-safe-area-context';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { Dropdown } from 'react-native-element-dropdown';
import { styles } from '../../styles/StaffAppointmentDesign';
import { appointmentStyles } from './StaffAppointmentStyles';
import { DetailRow, StatusPill, SummaryMetricCard } from './StaffAppointmentParts';
import {
  SLOT_STATUS,
  SLOT_STATUS_META,
  TODAY_DATE_KEY,
  INITIAL_MONTH,
  MONTH_NAMES,
  WEEK_LABELS,
  formatFullDate,
  getReadableStatus,
  getSlotStatusKeyForAppointment,
  toAppointmentViewModel,
  buildCalendarCells,
} from './StaffAppointmentData';
import PetOwnerSideDrawer from '../PetOwner/PetOwnerSideDrawer';
import {
  getAllAppointments,
  getActivePetOwners,
  getVeterinarians,
  getPetsByOwner,
  getAvailableSlots,
  createAppointment,
  staffCancelAppointment,
  staffRescheduleAppointment,
  completeAppointment,
  formatTime,
  addTenMinutes,
  todayLocal,
} from '../../../api/mobileAppointmentService';
import { supabase } from '../../../config/supabaseClient';

const DEFAULT_PROFILE_IMAGE = require('../../assets/Profile.png');
const DATE_WINDOW_DAYS = 60;

const getStaffId = (user) => user?.id || user?.user_id || user?.profile_id || '';

const StaffAppointment = ({ navigation, route }) => {
  const loggedInUser = route?.params?.user || {};
  const staffId = getStaffId(loggedInUser);
  const profileImageUri = loggedInUser?.profileImageUri || loggedInUser?.avatar || '';
  const headerDisplayName = loggedInUser?.username || loggedInUser?.name || loggedInUser?.fullName || loggedInUser?.full_name || 'Staff';

  const [isMenuVisible, setIsMenuVisible] = useState(false);
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDateKey, setSelectedDateKey] = useState(TODAY_DATE_KEY);
  const [visibleMonthDate, setVisibleMonthDate] = useState(INITIAL_MONTH);

  const [selectedDetail, setSelectedDetail] = useState(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [cancellationReasonDraft, setCancellationReasonDraft] = useState('');
  const [rescheduleMode, setRescheduleMode] = useState(false);
  const [rescheduleVetId, setRescheduleVetId] = useState('');
  const [rescheduleDate, setRescheduleDate] = useState('');
  const [rescheduleTime, setRescheduleTime] = useState('');
  const [rescheduleSlots, setRescheduleSlots] = useState([]);
  const [savingAction, setSavingAction] = useState(false);

  const [vets, setVets] = useState([]);

  const [showBookModal, setShowBookModal] = useState(false);
  const [petOwners, setPetOwners] = useState([]);
  const [bookForm, setBookForm] = useState({ ownerId: '', petId: '', veterinarianId: '', appointmentDate: todayLocal(), startTime: '', visitReason: '', notes: '' });
  const [ownerPets, setOwnerPets] = useState([]);
  const [bookSlots, setBookSlots] = useState([]);
  const [bookSlotLoading, setBookSlotLoading] = useState(false);
  const [bookSaving, setBookSaving] = useState(false);
  const [bookError, setBookError] = useState('');

  const navigateWithUser = (screenName, extra) => {
    navigation.navigate(screenName, { user: loggedInUser, ...(extra || {}) });
  };

  const loadAppointments = useCallback(async () => {
    try {
      const rows = await getAllAppointments();
      setAppointments(rows.map(toAppointmentViewModel));
    } catch (error) {
      console.warn('Unable to load appointments:', error?.message || error);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { loadAppointments(); }, [loadAppointments]));

  useEffect(() => {
    getVeterinarians().then(setVets).catch(() => setVets([]));
  }, []);

  useEffect(() => {
    const channel = supabase
      .channel(`staff-appointments-${Date.now()}-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'appointments' }, () => {
        loadAppointments();
      })
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [loadAppointments]);

  const calendarCells = useMemo(() => buildCalendarCells(visibleMonthDate, appointments), [visibleMonthDate, appointments]);
  const selectedDateLabel = useMemo(() => formatFullDate(selectedDateKey), [selectedDateKey]);
  const selectedDayAppointments = useMemo(
    () => appointments.filter((item) => item.dateKey === selectedDateKey).sort((a, b) => String(a.time).localeCompare(String(b.time))),
    [appointments, selectedDateKey]
  );

  const summaryCards = useMemo(() => ([
    { key: 'confirmed', title: 'Confirmed Appointments', value: appointments.filter((item) => item.status === 'Confirmed').length, statusKey: SLOT_STATUS.CONFIRMED },
    { key: 'completed', title: 'Completed Appointments', value: appointments.filter((item) => item.status === 'Completed').length, statusKey: SLOT_STATUS.COMPLETED },
    { key: 'cancelled', title: 'Cancelled Appointments', value: appointments.filter((item) => item.status === 'Cancelled').length, statusKey: SLOT_STATUS.CANCELLED },
    { key: 'today', title: "Today's Appointments", value: appointments.filter((item) => item.dateKey === TODAY_DATE_KEY && item.status !== 'Cancelled').length, statusKey: SLOT_STATUS.CONFIRMED },
  ]), [appointments]);

  const shiftCalendarMonth = (direction) => {
    setVisibleMonthDate((current) => new Date(current.getFullYear(), current.getMonth() + direction, 1));
  };

  const resetDetailWorkflow = () => {
    setDetailError('');
    setCancellationReasonDraft('');
    setRescheduleMode(false);
    setRescheduleVetId('');
    setRescheduleDate('');
    setRescheduleTime('');
    setRescheduleSlots([]);
  };

  const openAppointmentDetail = (appointment) => {
    resetDetailWorkflow();
    setSelectedDetail(appointment);
    setShowDetailModal(true);
  };

  const closeDetailModal = () => {
    setShowDetailModal(false);
    setSelectedDetail(null);
    resetDetailWorkflow();
  };

  useEffect(() => {
    let active = true;
    if (!rescheduleMode || !rescheduleVetId || !rescheduleDate) { setRescheduleSlots([]); return undefined; }
    (async () => {
      try {
        const rows = await getAvailableSlots(rescheduleVetId, rescheduleDate, selectedDetail?.id || null);
        if (active) setRescheduleSlots(rows);
      } catch {
        if (active) setRescheduleSlots([]);
      }
    })();
    return () => { active = false; };
  }, [rescheduleMode, rescheduleVetId, rescheduleDate, selectedDetail?.id]);

  const startReschedule = () => {
    if (!selectedDetail) return;
    setRescheduleMode(true);
    setRescheduleVetId(selectedDetail.veterinarianId || '');
    setRescheduleDate(selectedDetail.dateKey || todayLocal());
    setRescheduleTime('');
    setDetailError('');
  };

  const handleSaveReschedule = async () => {
    if (!selectedDetail) return;
    if (!rescheduleVetId || !rescheduleDate || !rescheduleTime) {
      setDetailError('Choose a veterinarian, date, and time to reschedule.');
      return;
    }
    try {
      setSavingAction(true);
      await staffRescheduleAppointment(
        selectedDetail.id,
        { veterinarianId: rescheduleVetId, appointmentDate: rescheduleDate, startTime: rescheduleTime },
        staffId,
        selectedDetail.ownerId
      );
      await loadAppointments();
      closeDetailModal();
    } catch (error) {
      setDetailError(error.message || 'Unable to reschedule the appointment.');
    } finally {
      setSavingAction(false);
    }
  };

  const handleCancelBooking = async () => {
    if (!selectedDetail) return;
    if (!cancellationReasonDraft.trim()) {
      setDetailError('Add a cancellation reason before cancelling this booking.');
      return;
    }
    try {
      setSavingAction(true);
      await staffCancelAppointment(selectedDetail.id, staffId, cancellationReasonDraft.trim());
      await loadAppointments();
      closeDetailModal();
    } catch (error) {
      setDetailError(error.message || 'Unable to cancel the appointment.');
    } finally {
      setSavingAction(false);
    }
  };

  const handleCompleteBooking = async () => {
    if (!selectedDetail) return;
    try {
      setSavingAction(true);
      await completeAppointment(selectedDetail.id, staffId);
      await loadAppointments();
      closeDetailModal();
    } catch (error) {
      setDetailError(error.message || 'Unable to mark the appointment as completed.');
    } finally {
      setSavingAction(false);
    }
  };

  const dateOptions = useMemo(() => {
    const base = new Date();
    return Array.from({ length: DATE_WINDOW_DAYS }, (_, index) => {
      const date = new Date(base.getFullYear(), base.getMonth(), base.getDate() + index);
      const value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      return { value, label: date.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) };
    });
  }, []);

  const openBookModal = (presetDateKey) => {
    setBookForm({ ownerId: '', petId: '', veterinarianId: '', appointmentDate: presetDateKey || todayLocal(), startTime: '', visitReason: '', notes: '' });
    setOwnerPets([]);
    setBookSlots([]);
    setBookError('');
    setShowBookModal(true);
    if (!petOwners.length) {
      getActivePetOwners().then(setPetOwners).catch(() => setPetOwners([]));
    }
  };

  const closeBookModal = () => {
    setShowBookModal(false);
    setBookError('');
  };

  useEffect(() => {
    let active = true;
    if (!bookForm.ownerId) { setOwnerPets([]); return undefined; }
    getPetsByOwner(bookForm.ownerId).then((rows) => { if (active) setOwnerPets(rows); }).catch(() => { if (active) setOwnerPets([]); });
    return () => { active = false; };
  }, [bookForm.ownerId]);

  useEffect(() => {
    let active = true;
    setBookForm((current) => ({ ...current, startTime: '' }));
    if (!bookForm.veterinarianId || !bookForm.appointmentDate) { setBookSlots([]); return undefined; }
    (async () => {
      try {
        setBookSlotLoading(true);
        const rows = await getAvailableSlots(bookForm.veterinarianId, bookForm.appointmentDate);
        if (active) setBookSlots(rows);
      } catch {
        if (active) setBookSlots([]);
      } finally {
        if (active) setBookSlotLoading(false);
      }
    })();
    return () => { active = false; };
  }, [bookForm.veterinarianId, bookForm.appointmentDate]);

  const submitBooking = async () => {
    if (!bookForm.ownerId || !bookForm.petId || !bookForm.veterinarianId || !bookForm.startTime) {
      setBookError('Choose a pet owner, pet, veterinarian, and time.');
      return;
    }
    try {
      setBookSaving(true);
      setBookError('');
      await createAppointment({
        petId: bookForm.petId,
        ownerId: bookForm.ownerId,
        veterinarianId: bookForm.veterinarianId,
        appointmentDate: bookForm.appointmentDate,
        startTime: bookForm.startTime,
        visitReason: bookForm.visitReason,
        notes: bookForm.notes,
        createdBy: staffId,
        appointmentSource: 'Staff',
      });
      await loadAppointments();
      closeBookModal();
      Alert.alert('Appointment Booked', 'The pet owner has been notified.');
    } catch (error) {
      setBookError(error.message || 'Unable to book the appointment.');
    } finally {
      setBookSaving(false);
    }
  };

  const selectedOwner = petOwners.find((item) => String(item.id) === String(bookForm.ownerId));
  const selectedVet = vets.find((item) => String(item.id) === String(bookForm.veterinarianId));
  const selectedPet = ownerPets.find((item) => String(item.id) === String(bookForm.petId));

  const detailStatusMeta = selectedDetail ? SLOT_STATUS_META[getSlotStatusKeyForAppointment(selectedDetail.status)] : null;

  return (
    <LinearGradient colors={['#f7fbfc', '#eef7f8', '#ffffff']} style={styles.background}>
      <SafeAreaView style={styles.container}>
        <LinearGradient colors={['#63B6C5', '#63B6C5', '#63B6C5']} style={styles.headerBar}>
          <LinearGradient colors={['#1f4e66', '#2f6f86', '#447C99', '#5f9eb4']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.headerTopBand}>
            <View style={styles.headerTopRow}>
              <TouchableOpacity style={styles.brandSection} onPress={() => navigateWithUser('staff-screen')} activeOpacity={0.85}>
                <View style={styles.logoWrap}><Image source={require('../../assets/paw1.png')} style={styles.headerLogo} resizeMode="contain" /></View>
                <View style={styles.brandBlock}>
                  <Text style={styles.headerTitle}>PawCruz</Text>
                  <Text style={styles.headerSubtitle}>Staff Appointment Overview</Text>
                </View>
              </TouchableOpacity>
              <View style={styles.headerActions}>
                <TouchableOpacity style={styles.notifButton} onPress={() => navigateWithUser('StaffNotif')} activeOpacity={0.85}>
                  <Image source={require('../../assets/Bell_Icon.png')} style={styles.notifIcon} resizeMode="contain" />
                </TouchableOpacity>
                <TouchableOpacity style={styles.profileButton} onPress={() => navigateWithUser('StaffProfile')} activeOpacity={0.85}>
                  {profileImageUri ? <Image source={{ uri: profileImageUri }} style={styles.profileButtonImage} resizeMode="cover" /> : <Image source={DEFAULT_PROFILE_IMAGE} style={styles.profileIcon} resizeMode="contain" />}
                </TouchableOpacity>
              </View>
            </View>
          </LinearGradient>

          <View style={styles.headerBottomRow}>
            <TouchableOpacity style={styles.menuTriggerButton} onPress={() => setIsMenuVisible(true)} activeOpacity={0.85}>
              <Image source={require('../../assets/List.png')} style={styles.menuTriggerIcon} resizeMode="contain" />
            </TouchableOpacity>
            <View style={styles.ownerSummary}>
              <Text style={styles.headerCaption}>Main scheduling panel</Text>
              <Text style={styles.ownerName}>{headerDisplayName}</Text>
            </View>
          </View>
        </LinearGradient>

        <PetOwnerSideDrawer visible={isMenuVisible} onClose={() => setIsMenuVisible(false)} navigation={navigation} user={loggedInUser} activeKey="appointment" role="staff" />

        {loading ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator size="large" color="#173f5c" />
          </View>
        ) : (
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
            <View style={styles.sectionHeaderWrap}>
              <Text style={styles.sectionTitle}>Quick Summary</Text>
              <Text style={styles.sectionSubtitle}>Live counts across the clinic's appointment book</Text>
            </View>

            <View style={appointmentStyles.summaryGrid}>
              {summaryCards.map((item) => (
                <SummaryMetricCard key={item.key} title={item.title} value={item.value} statusMeta={SLOT_STATUS_META[item.statusKey]} style={appointmentStyles.summaryCard} />
              ))}
            </View>

            <View style={styles.sectionHeaderWrap}>
              <Text style={styles.sectionTitle}>Book For Pet Owner</Text>
              <Text style={styles.sectionSubtitle}>Create a confirmed appointment on behalf of a registered pet owner</Text>
            </View>
            <View style={styles.bookingCard}>
              <Text style={appointmentStyles.rescheduleText}>The pet owner is notified with a sound and pop-up the moment this is booked — no approval step needed.</Text>
              <TouchableOpacity style={appointmentStyles.manageDateButton} onPress={() => openBookModal(selectedDateKey)} activeOpacity={0.9}>
                <Text style={appointmentStyles.manageDateButtonText}>Book Appointment</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.sectionHeaderWrap}>
              <Text style={styles.sectionTitle}>Calendar</Text>
              <Text style={styles.sectionSubtitle}>Tap a date to review that day's bookings</Text>
            </View>

            <View style={styles.bookingCard}>
              <View style={appointmentStyles.calendarHeaderRow}>
                <TouchableOpacity style={appointmentStyles.calendarNavButton} onPress={() => shiftCalendarMonth(-1)} activeOpacity={0.88}>
                  <Text style={appointmentStyles.calendarNavButtonText}>Previous</Text>
                </TouchableOpacity>
                <View style={appointmentStyles.calendarTitleWrap}>
                  <Text style={appointmentStyles.calendarMonthTitle}>{MONTH_NAMES[visibleMonthDate.getMonth()]} {visibleMonthDate.getFullYear()}</Text>
                </View>
                <TouchableOpacity style={appointmentStyles.calendarNavButton} onPress={() => shiftCalendarMonth(1)} activeOpacity={0.88}>
                  <Text style={appointmentStyles.calendarNavButtonText}>Next</Text>
                </TouchableOpacity>
              </View>

              <View style={appointmentStyles.calendarWeekRow}>
                {WEEK_LABELS.map((label) => <Text key={label} style={appointmentStyles.calendarWeekText}>{label}</Text>)}
              </View>

              <View style={appointmentStyles.calendarGrid}>
                {calendarCells.map((cell, index) => {
                  if (!cell) return <View key={`empty-${index}`} style={appointmentStyles.calendarDayEmpty} />;
                  const isSelected = cell.dateKey === selectedDateKey;
                  const tone = cell.summary.tone;
                  const toneMeta = tone ? SLOT_STATUS_META[tone] : null;
                  return (
                    <TouchableOpacity
                      key={cell.key}
                      style={[
                        appointmentStyles.calendarDayCard,
                        isSelected && appointmentStyles.calendarDayCardSelected,
                        toneMeta ? { backgroundColor: toneMeta.color } : null,
                      ]}
                      onPress={() => setSelectedDateKey(cell.dateKey)}
                      activeOpacity={0.9}
                    >
                      <Text style={[appointmentStyles.calendarDayNumber, toneMeta ? { color: '#ffffff' } : null]}>{cell.dayNumber}</Text>
                      {cell.summary.total ? (
                        <View style={appointmentStyles.pendingBadge}><Text style={appointmentStyles.pendingBadgeText}>{cell.summary.total}</Text></View>
                      ) : null}
                    </TouchableOpacity>
                  );
                })}
              </View>

              <View style={appointmentStyles.legendRow}>
                {[SLOT_STATUS.CONFIRMED, SLOT_STATUS.COMPLETED, SLOT_STATUS.CANCELLED].map((key) => (
                  <View key={key} style={appointmentStyles.legendItem}>
                    <View style={[appointmentStyles.legendSwatch, { backgroundColor: SLOT_STATUS_META[key].color }]} />
                    <Text style={appointmentStyles.legendText}>{SLOT_STATUS_META[key].label}</Text>
                  </View>
                ))}
              </View>

              <View style={appointmentStyles.selectedDateBanner}>
                <Text style={appointmentStyles.selectedDateLabel}>Selected Date</Text>
                <Text style={appointmentStyles.selectedDateValue}>{selectedDateLabel}</Text>
                <Text style={appointmentStyles.selectedDateMeta}>
                  {selectedDayAppointments.length ? `${selectedDayAppointments.length} booking${selectedDayAppointments.length === 1 ? '' : 's'} on this date.` : 'No bookings on this date yet.'}
                </Text>
              </View>
            </View>

            <View style={styles.sectionHeaderWrap}>
              <Text style={styles.sectionTitle}>Bookings on {selectedDateLabel}</Text>
              <Text style={styles.sectionSubtitle}>Tap a booking to confirm details, reschedule, cancel, or complete it</Text>
            </View>

            {selectedDayAppointments.length ? selectedDayAppointments.map((item) => {
              const meta = SLOT_STATUS_META[getSlotStatusKeyForAppointment(item.status)];
              return (
                <TouchableOpacity key={item.id} style={styles.managementCard} onPress={() => openAppointmentDetail(item)} activeOpacity={0.9}>
                  <View style={appointmentStyles.bookingHeaderRow}>
                    <View style={appointmentStyles.bookingHeaderContent}>
                      <Text style={styles.managementTitle}>{item.petName}</Text>
                      <Text style={[styles.managementMeta, appointmentStyles.bookingHeaderMeta]}>{item.ownerName} • {formatTime(item.time)} • {item.veterinarian}</Text>
                    </View>
                    <StatusPill label={getReadableStatus(item.status)} backgroundColor={meta.background} borderColor={meta.border} color={meta.color} />
                  </View>
                  <Text style={styles.managementMeta}>{item.reason}</Text>
                </TouchableOpacity>
              );
            }) : (
              <View style={styles.managementCard}>
                <View style={styles.emptyStateCard}>
                  <Text style={styles.emptyStateTitle}>No bookings for this date</Text>
                  <Text style={styles.emptyStateText}>Use "Book Appointment" above to create one for a pet owner.</Text>
                </View>
              </View>
            )}

            <View style={styles.sectionHeaderWrap}>
              <Text style={styles.sectionTitle}>Full Booking List</Text>
              <Text style={styles.sectionSubtitle}>Search every appointment on record</Text>
            </View>
            <View style={styles.managementCard}>
              <TouchableOpacity style={appointmentStyles.manageDateButton} onPress={() => navigateWithUser('StaffAppointmentList')} activeOpacity={0.9}>
                <Text style={appointmentStyles.manageDateButtonText}>Go to List</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        )}

        {/* Appointment detail / manage modal */}
        <Modal transparent animationType="fade" visible={showDetailModal} onRequestClose={closeDetailModal}>
          <View style={styles.modalOverlay}>
            <View style={appointmentStyles.detailModalCard}>
              <ScrollView style={appointmentStyles.detailModalScroll} contentContainerStyle={appointmentStyles.detailModalContent} showsVerticalScrollIndicator={false}>
                <Text style={styles.modalTitle}>{selectedDetail?.petName || 'Booking Details'}</Text>
                <Text style={styles.modalMessage}>Review and manage this appointment.</Text>

                {selectedDetail ? (
                  <>
                    <View style={[appointmentStyles.modalStatusBanner, { backgroundColor: detailStatusMeta.background, borderColor: detailStatusMeta.border }]}>
                      <Text style={[appointmentStyles.modalStatusText, { color: detailStatusMeta.color }]}>{detailStatusMeta.label}</Text>
                    </View>

                    <View style={appointmentStyles.detailInfoCard}>
                      <DetailRow label="Pet owner" value={selectedDetail.ownerName} />
                      <DetailRow label="Pet" value={selectedDetail.petBreed ? `${selectedDetail.petName} - ${selectedDetail.petBreed}` : selectedDetail.petName} />
                      <DetailRow label="Veterinarian" value={selectedDetail.veterinarian} />
                      <DetailRow label="Date / Time" value={`${formatFullDate(selectedDetail.dateKey)} • ${formatTime(selectedDetail.time)}`} />
                      <DetailRow label="Reason for visit" value={selectedDetail.reason} />
                      <DetailRow label="Booking source" value={selectedDetail.bookingType} />
                    </View>

                    {selectedDetail.status === 'Cancelled' && selectedDetail.cancellationReason ? (
                      <View style={appointmentStyles.cancellationDetailCard}>
                        <Text style={appointmentStyles.cancellationDetailTitle}>Cancellation Note</Text>
                        <Text style={appointmentStyles.cancellationDetailText}>{selectedDetail.cancellationReason}</Text>
                      </View>
                    ) : null}

                    {detailError ? <Text style={appointmentStyles.detailErrorText}>{detailError}</Text> : null}

                    {selectedDetail.status === 'Confirmed' && !rescheduleMode ? (
                      <>
                        <View style={appointmentStyles.textAreaCard}>
                          <Text style={appointmentStyles.textAreaLabel}>Cancellation Reason (required to cancel)</Text>
                          <TextInput
                            style={appointmentStyles.textAreaInput}
                            value={cancellationReasonDraft}
                            onChangeText={setCancellationReasonDraft}
                            placeholder="Reason for cancelling this booking"
                            placeholderTextColor="#8aa1b4"
                            multiline
                          />
                        </View>

                        <View style={appointmentStyles.modalActionGrid}>
                          <TouchableOpacity style={appointmentStyles.secondaryActionButton} onPress={startReschedule} activeOpacity={0.9}>
                            <Text style={appointmentStyles.secondaryActionButtonText}>Reschedule</Text>
                          </TouchableOpacity>
                          <TouchableOpacity style={appointmentStyles.completeButton} onPress={handleCompleteBooking} disabled={savingAction} activeOpacity={0.9}>
                            <Text style={appointmentStyles.completeButtonText}>{savingAction ? 'Saving...' : 'Mark Completed'}</Text>
                          </TouchableOpacity>
                        </View>
                        <TouchableOpacity style={appointmentStyles.cancelButton} onPress={handleCancelBooking} disabled={savingAction} activeOpacity={0.9}>
                          <Text style={appointmentStyles.cancelButtonText}>{savingAction ? 'Saving...' : 'Cancel Booking'}</Text>
                        </TouchableOpacity>
                      </>
                    ) : null}

                    {rescheduleMode ? (
                      <View style={appointmentStyles.rescheduleCard}>
                        <Text style={appointmentStyles.rescheduleTitle}>Reschedule Appointment</Text>
                        <Text style={appointmentStyles.rescheduleText}>Choose a new veterinarian, date, and time.</Text>

                        <Text style={styles.fieldLabel}>Veterinarian</Text>
                        <Dropdown
                          style={appointmentStyles.customTimeInput}
                          data={vets.map((vet) => ({ label: vet.full_name, value: vet.id }))}
                          labelField="label" valueField="value" value={rescheduleVetId}
                          placeholder="Select veterinarian"
                          onChange={(item) => setRescheduleVetId(item.value)}
                        />

                        <Text style={styles.fieldLabel}>Date</Text>
                        <Dropdown
                          style={appointmentStyles.customTimeInput}
                          data={dateOptions}
                          labelField="label" valueField="value" value={rescheduleDate}
                          placeholder="Select date"
                          onChange={(item) => setRescheduleDate(item.value)}
                        />

                        <Text style={styles.fieldLabel}>Available Time</Text>
                        <View style={appointmentStyles.rescheduleSlotRow}>
                          {rescheduleSlots.length ? rescheduleSlots.map((slot) => (
                            <TouchableOpacity
                              key={slot}
                              style={[appointmentStyles.rescheduleSlotChip, rescheduleTime === slot && appointmentStyles.rescheduleSlotChipActive]}
                              onPress={() => setRescheduleTime(slot)}
                              activeOpacity={0.9}
                            >
                              <Text style={[appointmentStyles.rescheduleSlotChipText, rescheduleTime === slot && appointmentStyles.rescheduleSlotChipTextActive]}>{formatTime(slot)}</Text>
                            </TouchableOpacity>
                          )) : <Text style={appointmentStyles.rescheduleText}>No available times for this vet/date.</Text>}
                        </View>

                        <TouchableOpacity style={appointmentStyles.saveRescheduleButton} onPress={handleSaveReschedule} disabled={savingAction} activeOpacity={0.9}>
                          <Text style={appointmentStyles.saveRescheduleButtonText}>{savingAction ? 'Saving...' : 'Save New Schedule'}</Text>
                        </TouchableOpacity>
                      </View>
                    ) : null}
                  </>
                ) : null}
              </ScrollView>

              <TouchableOpacity style={appointmentStyles.closeModalButton} onPress={closeDetailModal} activeOpacity={0.9}>
                <Text style={appointmentStyles.closeModalButtonText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* Book appointment for pet owner modal */}
        <Modal transparent animationType="fade" visible={showBookModal} onRequestClose={closeBookModal}>
          <View style={styles.modalOverlay}>
            <View style={appointmentStyles.detailModalCard}>
              <ScrollView style={appointmentStyles.detailModalScroll} contentContainerStyle={appointmentStyles.detailModalContent} showsVerticalScrollIndicator={false}>
                <Text style={styles.modalTitle}>Book Appointment For Pet Owner</Text>
                <Text style={styles.modalMessage}>This creates an already-confirmed booking and notifies the owner instantly.</Text>

                <Text style={styles.fieldLabel}>Pet Owner</Text>
                <Dropdown
                  style={appointmentStyles.customTimeInput}
                  data={petOwners.map((owner) => ({ label: owner.full_name || owner.username || owner.email, value: owner.id }))}
                  labelField="label" valueField="value" value={bookForm.ownerId}
                  placeholder="Select pet owner"
                  onChange={(item) => setBookForm((current) => ({ ...current, ownerId: item.value, petId: '' }))}
                />

                <Text style={styles.fieldLabel}>Pet</Text>
                <Dropdown
                  style={appointmentStyles.customTimeInput}
                  data={ownerPets.map((pet) => ({ label: `${pet.pet_name} — ${pet.species}`, value: pet.id }))}
                  labelField="label" valueField="value" value={bookForm.petId}
                  placeholder={bookForm.ownerId ? (ownerPets.length ? 'Select pet' : 'No registered pets') : 'Select a pet owner first'}
                  disable={!bookForm.ownerId}
                  onChange={(item) => setBookForm((current) => ({ ...current, petId: item.value }))}
                />

                <Text style={styles.fieldLabel}>Veterinarian</Text>
                <Dropdown
                  style={appointmentStyles.customTimeInput}
                  data={vets.map((vet) => ({ label: vet.full_name, value: vet.id }))}
                  labelField="label" valueField="value" value={bookForm.veterinarianId}
                  placeholder="Select veterinarian"
                  onChange={(item) => setBookForm((current) => ({ ...current, veterinarianId: item.value }))}
                />

                <Text style={styles.fieldLabel}>Date</Text>
                <Dropdown
                  style={appointmentStyles.customTimeInput}
                  data={dateOptions}
                  labelField="label" valueField="value" value={bookForm.appointmentDate}
                  placeholder="Select date"
                  onChange={(item) => setBookForm((current) => ({ ...current, appointmentDate: item.value }))}
                />

                <Text style={styles.fieldLabel}>Available Time</Text>
                <Dropdown
                  style={appointmentStyles.customTimeInput}
                  data={bookSlots.map((slot) => ({ value: slot, label: `${formatTime(slot)} – ${formatTime(addTenMinutes(slot))}` }))}
                  labelField="label" valueField="value" value={bookForm.startTime}
                  placeholder={bookSlotLoading ? 'Loading available times...' : bookSlots.length ? 'Select available time' : 'No available slots'}
                  disable={bookSlotLoading || !bookForm.veterinarianId || !bookSlots.length}
                  onChange={(item) => setBookForm((current) => ({ ...current, startTime: item.value }))}
                />

                <Text style={styles.fieldLabel}>Visit Reason (optional)</Text>
                <TextInput style={appointmentStyles.customTimeInput} value={bookForm.visitReason} onChangeText={(value) => setBookForm((current) => ({ ...current, visitReason: value }))} placeholder="Example: Routine checkup" />

                <Text style={styles.fieldLabel}>Notes (optional)</Text>
                <TextInput style={[appointmentStyles.textAreaInput, { marginTop: 0 }]} value={bookForm.notes} onChangeText={(value) => setBookForm((current) => ({ ...current, notes: value }))} placeholder="Additional information for the clinic" multiline />

                <View style={appointmentStyles.detailInfoCard}>
                  <DetailRow label="Pet Owner" value={selectedOwner?.full_name || 'Not selected'} />
                  <DetailRow label="Pet" value={selectedPet?.pet_name || 'Not selected'} />
                  <DetailRow label="Veterinarian" value={selectedVet?.full_name || 'Not selected'} />
                  <DetailRow label="Date" value={bookForm.appointmentDate ? formatFullDate(bookForm.appointmentDate) : 'Not selected'} />
                  <DetailRow label="Time" value={bookForm.startTime ? formatTime(bookForm.startTime) : 'Not selected'} />
                </View>

                {bookError ? <Text style={appointmentStyles.detailErrorText}>{bookError}</Text> : null}

                <TouchableOpacity style={appointmentStyles.saveRescheduleButton} onPress={submitBooking} disabled={bookSaving} activeOpacity={0.9}>
                  <Text style={appointmentStyles.saveRescheduleButtonText}>{bookSaving ? 'Booking...' : 'Confirm Booking'}</Text>
                </TouchableOpacity>
              </ScrollView>

              <TouchableOpacity style={appointmentStyles.closeModalButton} onPress={closeBookModal} activeOpacity={0.9}>
                <Text style={appointmentStyles.closeModalButtonText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    </LinearGradient>
  );
};

export default StaffAppointment;
