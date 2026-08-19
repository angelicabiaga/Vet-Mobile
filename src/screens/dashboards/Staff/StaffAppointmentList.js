import { SafeAreaView } from 'react-native-safe-area-context';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { Dropdown } from 'react-native-element-dropdown';
import { styles } from '../../styles/StaffAppointmentDesign';
import { appointmentStyles } from './StaffAppointmentStyles';
import { DetailRow, StatusPill } from './StaffAppointmentParts';
import {
  SLOT_STATUS_META,
  formatFullDate,
  fromDateKey,
  getReadableStatus,
  getSlotStatusKeyForAppointment,
  toAppointmentViewModel,
} from './StaffAppointmentData';
import PetOwnerSideDrawer from '../PetOwner/PetOwnerSideDrawer';
import {
  getAllAppointments,
  getVeterinarians,
  getAvailableSlots,
  staffCancelAppointment,
  staffRescheduleAppointment,
  completeAppointment,
  formatTime,
} from '../../../api/mobileAppointmentService';
import { supabase } from '../../../config/supabaseClient';

const DEFAULT_PROFILE_IMAGE = require('../../assets/Profile.png');
const STATUS_FILTER_OPTIONS = [
  { label: 'All', value: 'all' },
  { label: 'Confirmed', value: 'Confirmed' },
  { label: 'Completed', value: 'Completed' },
  { label: 'Cancelled', value: 'Cancelled' },
];

const getStaffId = (user) => user?.id || user?.user_id || user?.profile_id || '';

const getSearchableFields = (appointment) => [
  appointment.ownerName,
  appointment.petName,
  appointment.petBreed,
  appointment.veterinarian,
  appointment.referenceCode,
  appointment.reason,
  appointment.status,
  getReadableStatus(appointment.status),
  formatFullDate(appointment.dateKey),
];

const matchesSearch = (appointment, searchValue) => {
  const query = searchValue.trim().toLowerCase();
  if (!query) return true;
  return getSearchableFields(appointment).some((field) => String(field || '').toLowerCase().includes(query));
};

const sortAppointments = (appointments) =>
  [...appointments].sort((left, right) => {
    const dateDifference = fromDateKey(left.dateKey) - fromDateKey(right.dateKey);
    if (dateDifference !== 0) return dateDifference;
    return String(left.time).localeCompare(String(right.time));
  });

const StaffAppointmentList = ({ navigation, route }) => {
  const loggedInUser = route?.params?.user;
  const staffId = getStaffId(loggedInUser);
  const { width: screenWidth } = useWindowDimensions();
  const isCompactScreen = screenWidth <= 390;
  const profileImageUri = loggedInUser?.profileImageUri || loggedInUser?.avatar || '';
  const headerDisplayName = loggedInUser?.username || loggedInUser?.name || loggedInUser?.fullName || loggedInUser?.full_name || 'Staff';

  const [isMenuVisible, setIsMenuVisible] = useState(false);
  const [loading, setLoading] = useState(true);
  const [appointments, setAppointments] = useState([]);
  const [searchValue, setSearchValue] = useState('');
  const [activeStatus, setActiveStatus] = useState('all');
  const [vets, setVets] = useState([]);

  const [selectedAppointment, setSelectedAppointment] = useState(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [cancellationReasonDraft, setCancellationReasonDraft] = useState('');
  const [rescheduleMode, setRescheduleMode] = useState(false);
  const [rescheduleVetId, setRescheduleVetId] = useState('');
  const [rescheduleDate, setRescheduleDate] = useState('');
  const [rescheduleTime, setRescheduleTime] = useState('');
  const [rescheduleSlots, setRescheduleSlots] = useState([]);
  const [savingAction, setSavingAction] = useState(false);

  const navigateWithUser = (screenName) => navigation.navigate(screenName, { user: loggedInUser });

  const loadAppointments = useCallback(async () => {
    try {
      const rows = await getAllAppointments();
      setAppointments(sortAppointments(rows.map(toAppointmentViewModel)));
    } catch (error) {
      console.warn('Unable to load appointments:', error?.message || error);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { loadAppointments(); }, [loadAppointments]));

  useEffect(() => { getVeterinarians().then(setVets).catch(() => setVets([])); }, []);

  useEffect(() => {
    const channel = supabase
      .channel(`staff-appointments-list-${Date.now()}-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'appointments' }, () => loadAppointments())
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [loadAppointments]);

  const filteredAppointments = useMemo(
    () => appointments.filter((item) => (activeStatus === 'all' || item.status === activeStatus) && matchesSearch(item, searchValue)),
    [appointments, activeStatus, searchValue]
  );

  const resetDetailWorkflow = () => {
    setDetailError('');
    setCancellationReasonDraft('');
    setRescheduleMode(false);
    setRescheduleVetId('');
    setRescheduleDate('');
    setRescheduleTime('');
    setRescheduleSlots([]);
  };

  const openDetailModal = (appointment) => {
    resetDetailWorkflow();
    setSelectedAppointment(appointment);
    setShowDetailModal(true);
  };

  const closeDetailModal = () => {
    setShowDetailModal(false);
    setSelectedAppointment(null);
    resetDetailWorkflow();
  };

  useEffect(() => {
    let active = true;
    if (!rescheduleMode || !rescheduleVetId || !rescheduleDate) { setRescheduleSlots([]); return undefined; }
    (async () => {
      try {
        const rows = await getAvailableSlots(rescheduleVetId, rescheduleDate, selectedAppointment?.id || null);
        if (active) setRescheduleSlots(rows);
      } catch {
        if (active) setRescheduleSlots([]);
      }
    })();
    return () => { active = false; };
  }, [rescheduleMode, rescheduleVetId, rescheduleDate, selectedAppointment?.id]);

  const startReschedule = () => {
    if (!selectedAppointment) return;
    setRescheduleMode(true);
    setRescheduleVetId(selectedAppointment.veterinarianId || '');
    setRescheduleDate(selectedAppointment.dateKey);
    setRescheduleTime('');
    setDetailError('');
  };

  const handleSaveReschedule = async () => {
    if (!selectedAppointment) return;
    if (!rescheduleVetId || !rescheduleDate || !rescheduleTime) {
      setDetailError('Choose a veterinarian, date, and time to reschedule.');
      return;
    }
    try {
      setSavingAction(true);
      await staffRescheduleAppointment(selectedAppointment.id, { veterinarianId: rescheduleVetId, appointmentDate: rescheduleDate, startTime: rescheduleTime }, staffId, selectedAppointment.ownerId);
      await loadAppointments();
      closeDetailModal();
    } catch (error) {
      setDetailError(error.message || 'Unable to reschedule the appointment.');
    } finally {
      setSavingAction(false);
    }
  };

  const handleCancelBooking = async () => {
    if (!selectedAppointment) return;
    if (!cancellationReasonDraft.trim()) {
      setDetailError('Add a cancellation reason before cancelling this booking.');
      return;
    }
    try {
      setSavingAction(true);
      await staffCancelAppointment(selectedAppointment.id, staffId, cancellationReasonDraft.trim());
      await loadAppointments();
      closeDetailModal();
    } catch (error) {
      setDetailError(error.message || 'Unable to cancel the appointment.');
    } finally {
      setSavingAction(false);
    }
  };

  const handleMarkCompleted = async (appointmentId) => {
    try {
      await completeAppointment(appointmentId, staffId);
      await loadAppointments();
    } catch (error) {
      console.warn('Unable to mark completed:', error?.message || error);
    }
  };

  const selectedStatusMeta = selectedAppointment
    ? SLOT_STATUS_META[getSlotStatusKeyForAppointment(selectedAppointment.status)]
    : null;

  return (
    <LinearGradient colors={['#022c42', '#0c212b', '#15394e']} style={styles.background}>
      <SafeAreaView style={styles.container}>
        <LinearGradient colors={['#123554', '#1b4d74', '#245f8e']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.headerBar}>
          <View style={styles.headerTopRow}>
            <TouchableOpacity style={styles.brandSection} onPress={() => navigateWithUser('staff-screen')} activeOpacity={0.85}>
              <View style={styles.logoWrap}><Image source={require('../../assets/paw1.png')} style={styles.headerLogo} resizeMode="contain" /></View>
              <View style={styles.brandBlock}>
                <Text style={styles.headerTitle}>PawCruz</Text>
                <Text style={styles.headerSubtitle}>Appointment Database</Text>
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

          <View style={styles.headerBottomRow}>
            <View style={listStyles.headerNavButtonsRow}>
              <TouchableOpacity style={styles.menuTriggerButton} onPress={() => setIsMenuVisible(true)} activeOpacity={0.85}>
                <Image source={require('../../assets/List.png')} style={styles.menuTriggerIcon} resizeMode="contain" />
              </TouchableOpacity>
              <TouchableOpacity style={listStyles.headerBackButton} onPress={() => navigateWithUser('StaffAppointment')} activeOpacity={0.85}>
                <Image source={require('../../assets/back.png')} style={listStyles.headerBackIcon} resizeMode="contain" />
              </TouchableOpacity>
            </View>
            <View style={styles.ownerSummary}>
              <Text style={styles.headerCaption}>Search and manage bookings</Text>
              <Text style={styles.ownerName}>{headerDisplayName}</Text>
            </View>
          </View>
        </LinearGradient>

        <PetOwnerSideDrawer visible={isMenuVisible} onClose={() => setIsMenuVisible(false)} navigation={navigation} user={loggedInUser} activeKey="appointment" role="staff" />

        {loading ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator size="large" color="#ffffff" />
          </View>
        ) : (
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
            <View style={styles.sectionHeaderWrap}>
              <Text style={styles.sectionTitle}>Appointment Database</Text>
              <Text style={styles.sectionSubtitle}>Search, filter, and manage every appointment on record</Text>
            </View>

            <View style={listStyles.topToolsBlock}>
              <TextInput
                value={searchValue}
                onChangeText={setSearchValue}
                placeholder="Search by owner, pet, veterinarian, or reason"
                placeholderTextColor="#8aa1b4"
                style={listStyles.searchInput}
              />
              <View style={listStyles.dropdownFieldCard}>
                <Text style={listStyles.dropdownFieldLabel}>Status Filter</Text>
                <Dropdown
                  style={listStyles.dropdown}
                  containerStyle={listStyles.dropdownContainer}
                  placeholderStyle={listStyles.dropdownPlaceholder}
                  selectedTextStyle={listStyles.dropdownSelectedText}
                  itemTextStyle={listStyles.dropdownItemText}
                  activeColor="#edf7fd"
                  data={STATUS_FILTER_OPTIONS}
                  labelField="label"
                  valueField="value"
                  value={activeStatus}
                  placeholder="Select status"
                  onChange={(item) => setActiveStatus(item.value)}
                />
              </View>
            </View>

            <View style={listStyles.listShell}>
              <View style={listStyles.tableHeader}>
                <Text style={listStyles.tableHeaderText}>Owner / Pet</Text>
                <Text style={listStyles.tableHeaderText}>Status / Actions</Text>
              </View>

              {filteredAppointments.length ? filteredAppointments.map((appointment, index) => {
                const statusMeta = SLOT_STATUS_META[getSlotStatusKeyForAppointment(appointment.status)];
                const canComplete = appointment.status === 'Confirmed';

                return (
                  <View key={appointment.id} style={[listStyles.listRow, index === filteredAppointments.length - 1 && listStyles.listRowLast]}>
                    <View style={[listStyles.rowTop, isCompactScreen && listStyles.rowTopCompact]}>
                      <View style={[listStyles.rowIdentity, isCompactScreen && listStyles.rowIdentityCompact]}>
                        <Text style={listStyles.rowPrimary}>{appointment.ownerName}</Text>
                        <Text style={listStyles.rowSecondary}>{appointment.petName} - {appointment.petBreed}</Text>
                        <Text style={listStyles.rowReference}>{formatFullDate(appointment.dateKey)} • {formatTime(appointment.time)}</Text>
                      </View>
                      <View style={isCompactScreen ? listStyles.rowStatusWrapCompact : null}>
                        <StatusPill label={getReadableStatus(appointment.status)} backgroundColor={statusMeta.background} borderColor={statusMeta.border} color={statusMeta.color} />
                      </View>
                    </View>

                    <View style={[listStyles.actionRow, isCompactScreen && listStyles.actionRowCompact]}>
                      <TouchableOpacity style={[listStyles.actionButton, listStyles.actionButtonNeutral, isCompactScreen && listStyles.actionButtonCompact]} onPress={() => openDetailModal(appointment)} activeOpacity={0.9}>
                        <Text style={[listStyles.actionButtonText, listStyles.actionButtonTextDark]}>View Details</Text>
                      </TouchableOpacity>
                      {canComplete ? (
                        <TouchableOpacity style={[listStyles.actionButton, listStyles.actionButtonSuccess, isCompactScreen && listStyles.actionButtonCompact]} onPress={() => handleMarkCompleted(appointment.id)} activeOpacity={0.9}>
                          <Text style={listStyles.actionButtonText}>Complete</Text>
                        </TouchableOpacity>
                      ) : null}
                    </View>
                  </View>
                );
              }) : (
                <View style={listStyles.emptyRow}>
                  <Text style={styles.emptyStateTitle}>No appointments found</Text>
                  <Text style={styles.emptyStateText}>Try changing the search or status filter.</Text>
                </View>
              )}
            </View>
          </ScrollView>
        )}

        <Modal transparent animationType="fade" visible={showDetailModal} onRequestClose={closeDetailModal}>
          <View style={styles.modalOverlay}>
            <View style={appointmentStyles.detailModalCard}>
              <ScrollView style={appointmentStyles.detailModalScroll} contentContainerStyle={appointmentStyles.detailModalContent} showsVerticalScrollIndicator={false}>
                <Text style={styles.modalTitle}>{selectedAppointment ? `${selectedAppointment.petName} Details` : 'Details'}</Text>
                <Text style={styles.modalMessage}>Review and manage this appointment record.</Text>

                {selectedAppointment ? (
                  <>
                    <View style={[appointmentStyles.modalStatusBanner, { backgroundColor: selectedStatusMeta.background, borderColor: selectedStatusMeta.border }]}>
                      <Text style={[appointmentStyles.modalStatusText, { color: selectedStatusMeta.color }]}>{getReadableStatus(selectedAppointment.status)}</Text>
                    </View>

                    <View style={appointmentStyles.detailInfoCard}>
                      <DetailRow label="Pet owner name" value={selectedAppointment.ownerName} />
                      <DetailRow label="Pet name" value={`${selectedAppointment.petName} - ${selectedAppointment.petBreed}`} />
                      <DetailRow label="Veterinarian assigned" value={selectedAppointment.veterinarian || 'Not assigned'} />
                      <DetailRow label="Appointment date" value={formatFullDate(selectedAppointment.dateKey)} />
                      <DetailRow label="Appointment time" value={formatTime(selectedAppointment.time)} />
                      <DetailRow label="Service type" value={selectedAppointment.reason} />
                      <DetailRow label="Booking type" value={selectedAppointment.bookingType || 'Online'} />
                    </View>

                    {selectedAppointment.status === 'Cancelled' && selectedAppointment.cancellationReason ? (
                      <View style={appointmentStyles.cancellationNote}>
                        <Text style={appointmentStyles.cancellationNoteTitle}>Cancellation Reason</Text>
                        <Text style={appointmentStyles.cancellationNoteText}>{selectedAppointment.cancellationReason}</Text>
                      </View>
                    ) : null}

                    {detailError ? <Text style={appointmentStyles.detailErrorText}>{detailError}</Text> : null}

                    {selectedAppointment.status === 'Confirmed' && !rescheduleMode ? (
                      <>
                        <View style={appointmentStyles.textAreaCard}>
                          <Text style={appointmentStyles.textAreaLabel}>Cancellation Reason (required to cancel)</Text>
                          <TextInput style={appointmentStyles.textAreaInput} value={cancellationReasonDraft} onChangeText={setCancellationReasonDraft} placeholder="Reason for cancelling this booking" placeholderTextColor="#8aa1b4" multiline />
                        </View>
                        <View style={appointmentStyles.modalActionGrid}>
                          <TouchableOpacity style={appointmentStyles.secondaryActionButton} onPress={startReschedule} activeOpacity={0.9}>
                            <Text style={appointmentStyles.secondaryActionButtonText}>Reschedule</Text>
                          </TouchableOpacity>
                          <TouchableOpacity style={appointmentStyles.completeButton} onPress={() => { handleMarkCompleted(selectedAppointment.id); closeDetailModal(); }} activeOpacity={0.9}>
                            <Text style={appointmentStyles.completeButtonText}>Mark Completed</Text>
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

                        <Text style={appointmentStyles.textAreaLabel}>Veterinarian</Text>
                        <Dropdown
                          style={appointmentStyles.customTimeInput}
                          data={vets.map((vet) => ({ label: vet.full_name, value: vet.id }))}
                          labelField="label" valueField="value" value={rescheduleVetId}
                          placeholder="Select veterinarian"
                          onChange={(item) => setRescheduleVetId(item.value)}
                        />

                        <Text style={[appointmentStyles.textAreaLabel, { marginTop: 12 }]}>New Time</Text>
                        <View style={appointmentStyles.rescheduleSlotRow}>
                          {rescheduleSlots.length ? rescheduleSlots.map((slot) => (
                            <TouchableOpacity key={slot} style={[appointmentStyles.rescheduleSlotChip, rescheduleTime === slot && appointmentStyles.rescheduleSlotChipActive]} onPress={() => setRescheduleTime(slot)} activeOpacity={0.9}>
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
      </SafeAreaView>
    </LinearGradient>
  );
};

const listStyles = StyleSheet.create({
  headerNavButtonsRow: { flexDirection: 'row', alignItems: 'center' },
  headerBackButton: { width: 58, height: 58, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.12)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)', justifyContent: 'center', alignItems: 'center', marginLeft: 10 },
  headerBackIcon: { width: 30, height: 30, tintColor: '#ffffff' },
  topToolsBlock: { marginBottom: 18 },
  searchInput: { minHeight: 50, borderRadius: 18, borderWidth: 1, borderColor: '#d7edf9', backgroundColor: '#f8fcff', paddingHorizontal: 16, fontSize: 14, fontWeight: '700', color: '#173f5c', marginBottom: 12 },
  dropdownFieldCard: { borderRadius: 18, borderWidth: 1, borderColor: '#d7edf9', backgroundColor: '#f8fcff', paddingHorizontal: 14, paddingTop: 12, paddingBottom: 6, marginBottom: 10 },
  dropdownFieldLabel: { fontSize: 12, fontWeight: '900', color: '#173f5c', textTransform: 'uppercase', marginBottom: 6 },
  dropdown: { minHeight: 48 },
  dropdownContainer: { borderRadius: 18, borderWidth: 1, borderColor: '#d7edf9', backgroundColor: '#ffffff', overflow: 'hidden' },
  dropdownPlaceholder: { fontSize: 14, fontWeight: '700', color: '#87a0b1' },
  dropdownSelectedText: { fontSize: 14, fontWeight: '800', color: '#173f5c' },
  dropdownItemText: { fontSize: 14, fontWeight: '700', color: '#173f5c' },
  listShell: { borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#d7e4ef', backgroundColor: '#f8fcff' },
  tableHeader: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 12, backgroundColor: '#eef5fb', borderBottomWidth: 1, borderBottomColor: '#d7e4ef' },
  tableHeaderText: { fontSize: 11, fontWeight: '900', color: '#6d8ca1', textTransform: 'uppercase', letterSpacing: 0.5 },
  listRow: { paddingHorizontal: 14, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#e2edf5', backgroundColor: '#ffffff' },
  listRowLast: { borderBottomWidth: 0 },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
  rowTopCompact: { flexDirection: 'column' },
  rowIdentity: { flex: 1, marginRight: 12 },
  rowIdentityCompact: { width: '100%', marginRight: 0 },
  rowStatusWrapCompact: { alignSelf: 'flex-start', marginTop: 8 },
  rowPrimary: { fontSize: 15, fontWeight: '900', color: '#173f5c', marginBottom: 4 },
  rowSecondary: { fontSize: 13, fontWeight: '800', color: '#385973', marginBottom: 4 },
  rowReference: { fontSize: 12, fontWeight: '700', color: '#6d8ca1' },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap' },
  actionRowCompact: { justifyContent: 'space-between' },
  actionButton: { minHeight: 38, borderRadius: 14, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 12, marginRight: 8, marginBottom: 8 },
  actionButtonCompact: { width: '48.5%', marginRight: 0, paddingHorizontal: 10 },
  actionButtonNeutral: { backgroundColor: '#eef5fb', borderWidth: 1, borderColor: '#d7e4ef' },
  actionButtonSuccess: { backgroundColor: '#2fa866' },
  actionButtonText: { fontSize: 12, fontWeight: '900', color: '#ffffff' },
  actionButtonTextDark: { color: '#173f5c' },
  emptyRow: { paddingHorizontal: 14, paddingVertical: 24, backgroundColor: '#ffffff' },
});

export default StaffAppointmentList;
