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
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { styles } from '../../styles/StaffAppointmentDesign';
import { appointmentStyles } from './StaffAppointmentStyles';
import { DetailRow, StatusPill } from './StaffAppointmentParts';
import {
  SLOT_STATUS_META,
  TODAY_DATE_KEY,
  formatFullDate,
  fromDateKey,
  getReadableStatus,
  getSlotStatusKeyForAppointment,
  toAppointmentViewModel,
} from './StaffAppointmentData';
import PetOwnerSideDrawer from '../PetOwner/PetOwnerSideDrawer';
import { getAllAppointments, formatTime } from '../../../api/mobileAppointmentService';
import { supabase } from '../../../config/supabaseClient';

const DEFAULT_PROFILE_IMAGE = require('../../assets/Profile.png');

const BUCKET_FILTERS = [
  { key: 'all', label: 'All Records' },
  { key: 'new', label: 'Upcoming' },
  { key: 'old', label: 'Past / Closed' },
];

const STATUS_FILTERS = [
  { key: 'all', label: 'All Status' },
  { key: 'Confirmed', label: 'Confirmed' },
  { key: 'Completed', label: 'Completed' },
  { key: 'Cancelled', label: 'Cancelled' },
];

const getBucketMeta = (bucketKey) =>
  bucketKey === 'old'
    ? { label: 'Past / Closed', color: '#6d7f90', background: '#eef3f6', border: '#d7e1e7' }
    : { label: 'Upcoming', color: '#2f8d59', background: '#e9f8ef', border: '#bfe8cf' };

const getRecordBucket = (appointment) => {
  if (appointment.status === 'Cancelled' || appointment.status === 'Completed') return 'old';
  const appointmentDate = fromDateKey(appointment.dateKey);
  const todayDate = fromDateKey(TODAY_DATE_KEY);
  return appointmentDate < todayDate ? 'old' : 'new';
};

const matchesSearch = (appointment, searchValue) => {
  const query = searchValue.trim().toLowerCase();
  if (!query) return true;
  const fields = [
    appointment.ownerName,
    appointment.petName,
    appointment.petBreed,
    appointment.reason,
    appointment.veterinarian,
    appointment.status,
    getReadableStatus(appointment.status),
    formatFullDate(appointment.dateKey),
  ];
  return fields.some((field) => String(field || '').toLowerCase().includes(query));
};

const StaffAppointmentDatabase = ({ navigation, route }) => {
  const loggedInUser = route?.params?.user;
  const profileImageUri = loggedInUser?.profileImageUri || loggedInUser?.avatar || '';
  const headerDisplayName = loggedInUser?.username || loggedInUser?.name || loggedInUser?.fullName || loggedInUser?.full_name || 'Staff';

  const [isMenuVisible, setIsMenuVisible] = useState(false);
  const [loading, setLoading] = useState(true);
  const [appointmentRecords, setAppointmentRecords] = useState([]);
  const [searchValue, setSearchValue] = useState('');
  const [activeBucket, setActiveBucket] = useState('all');
  const [activeStatus, setActiveStatus] = useState('all');
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [showRecordModal, setShowRecordModal] = useState(false);

  const navigateWithUser = (screenName) => navigation.navigate(screenName, { user: loggedInUser });

  const loadAppointments = useCallback(async () => {
    try {
      const rows = await getAllAppointments();
      setAppointmentRecords(rows.map(toAppointmentViewModel));
    } catch (error) {
      console.warn('Unable to load appointments:', error?.message || error);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { loadAppointments(); }, [loadAppointments]));

  useEffect(() => {
    const channel = supabase
      .channel(`staff-appointments-database-${Date.now()}-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'appointments' }, () => loadAppointments())
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [loadAppointments]);

  const summaryCards = useMemo(() => ([
    { key: 'all', title: 'All Records', value: appointmentRecords.length },
    { key: 'new', title: 'Upcoming', value: appointmentRecords.filter((item) => getRecordBucket(item) === 'new').length },
    { key: 'old', title: 'Past / Closed', value: appointmentRecords.filter((item) => getRecordBucket(item) === 'old').length },
    { key: 'cancelled', title: 'Cancelled', value: appointmentRecords.filter((item) => item.status === 'Cancelled').length },
  ]), [appointmentRecords]);

  const filteredAppointments = useMemo(
    () => [...appointmentRecords]
      .filter((item) => activeBucket === 'all' || getRecordBucket(item) === activeBucket)
      .filter((item) => activeStatus === 'all' || item.status === activeStatus)
      .filter((item) => matchesSearch(item, searchValue))
      .sort((left, right) => fromDateKey(right.dateKey) - fromDateKey(left.dateKey) || String(right.time).localeCompare(String(left.time))),
    [activeBucket, activeStatus, appointmentRecords, searchValue]
  );

  const filteredLabel = filteredAppointments.length === appointmentRecords.length
    ? `Showing all ${appointmentRecords.length} booking records`
    : `Showing ${filteredAppointments.length} of ${appointmentRecords.length} booking records`;

  const selectedRecordStatusMeta = selectedRecord ? SLOT_STATUS_META[getSlotStatusKeyForAppointment(selectedRecord.status)] : null;
  const selectedRecordBucketMeta = selectedRecord ? getBucketMeta(getRecordBucket(selectedRecord)) : null;

  const openRecordModal = (appointment) => { setSelectedRecord(appointment); setShowRecordModal(true); };
  const closeRecordModal = () => { setShowRecordModal(false); setSelectedRecord(null); };

  const renderFilterChip = (item, currentValue, onPress) => {
    const isActive = item.key === currentValue;
    return (
      <TouchableOpacity key={item.key} style={[databaseStyles.filterChip, isActive && databaseStyles.filterChipActive]} onPress={() => onPress(item.key)} activeOpacity={0.9}>
        <Text style={[databaseStyles.filterChipText, isActive && databaseStyles.filterChipTextActive]}>{item.label}</Text>
      </TouchableOpacity>
    );
  };

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
            <TouchableOpacity style={styles.menuTriggerButton} onPress={() => setIsMenuVisible(true)} activeOpacity={0.85}>
              <Image source={require('../../assets/List.png')} style={styles.menuTriggerIcon} resizeMode="contain" />
            </TouchableOpacity>
            <View style={styles.ownerSummary}>
              <Text style={styles.headerCaption}>Searchable booking records</Text>
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
              <Text style={styles.sectionTitle}>Overview</Text>
              <Text style={styles.sectionSubtitle}>Search upcoming and past bookings in one staff-friendly appointment database</Text>
            </View>

            <View style={appointmentStyles.summaryGrid}>
              {summaryCards.map((item) => (
                <SummaryCard key={item.key} title={item.title} value={item.value} />
              ))}
            </View>

            <View style={styles.sectionHeaderWrap}>
              <Text style={styles.sectionTitle}>Database Controls</Text>
              <Text style={styles.sectionSubtitle}>Use search and filters to find records</Text>
            </View>

            <View style={styles.managementCard}>
              <View style={databaseStyles.searchCard}>
                <Text style={databaseStyles.searchLabel}>Search Booking Records</Text>
                <TextInput
                  value={searchValue}
                  onChangeText={setSearchValue}
                  placeholder="Search by owner, pet, veterinarian, or reason"
                  placeholderTextColor="#8aa1b4"
                  style={databaseStyles.searchInput}
                />
              </View>

              <View style={databaseStyles.toolbarRow}>
                <TouchableOpacity style={databaseStyles.calendarButton} onPress={() => navigateWithUser('StaffAppointment')} activeOpacity={0.9}>
                  <Text style={databaseStyles.calendarButtonText}>Open Calendar View</Text>
                </TouchableOpacity>
                {searchValue ? (
                  <TouchableOpacity style={databaseStyles.clearButton} onPress={() => setSearchValue('')} activeOpacity={0.9}>
                    <Text style={databaseStyles.clearButtonText}>Clear Search</Text>
                  </TouchableOpacity>
                ) : null}
              </View>

              <Text style={databaseStyles.filterTitle}>Record Type</Text>
              <View style={databaseStyles.filterRow}>{BUCKET_FILTERS.map((item) => renderFilterChip(item, activeBucket, setActiveBucket))}</View>

              <Text style={databaseStyles.filterTitle}>Status</Text>
              <View style={databaseStyles.filterRow}>{STATUS_FILTERS.map((item) => renderFilterChip(item, activeStatus, setActiveStatus))}</View>

              <View style={databaseStyles.resultSummaryCard}>
                <Text style={databaseStyles.resultSummaryTitle}>Current Result Set</Text>
                <Text style={databaseStyles.resultSummaryText}>{filteredLabel}</Text>
              </View>
            </View>

            <View style={styles.sectionHeaderWrap}>
              <Text style={styles.sectionTitle}>Booking Records</Text>
              <Text style={styles.sectionSubtitle}>Compact list view for every appointment</Text>
            </View>

            {filteredAppointments.length ? filteredAppointments.map((appointment) => {
              const appointmentMeta = SLOT_STATUS_META[getSlotStatusKeyForAppointment(appointment.status)];
              const bucketMeta = getBucketMeta(getRecordBucket(appointment));
              return (
                <View key={appointment.id} style={styles.managementCard}>
                  <View style={databaseStyles.recordHeader}>
                    <View style={databaseStyles.recordHeaderCopy}>
                      <Text style={styles.managementTitle}>{appointment.petName}</Text>
                      <Text style={styles.managementMeta}>{appointment.ownerName} | {appointment.petBreed}</Text>
                    </View>
                    <View style={databaseStyles.recordHeaderPills}>
                      <View style={[databaseStyles.bucketPill, { backgroundColor: bucketMeta.background, borderColor: bucketMeta.border }]}>
                        <Text style={[databaseStyles.bucketPillText, { color: bucketMeta.color }]}>{bucketMeta.label}</Text>
                      </View>
                      <StatusPill label={getReadableStatus(appointment.status)} backgroundColor={appointmentMeta.background} borderColor={appointmentMeta.border} color={appointmentMeta.color} />
                    </View>
                  </View>

                  <View style={databaseStyles.recordGrid}>
                    <View style={databaseStyles.recordGridItem}>
                      <Text style={databaseStyles.recordGridLabel}>Date</Text>
                      <Text style={databaseStyles.recordGridValue}>{formatFullDate(appointment.dateKey)}</Text>
                    </View>
                    <View style={databaseStyles.recordGridItem}>
                      <Text style={databaseStyles.recordGridLabel}>Time</Text>
                      <Text style={databaseStyles.recordGridValue}>{formatTime(appointment.time)}</Text>
                    </View>
                    <View style={databaseStyles.recordGridItem}>
                      <Text style={databaseStyles.recordGridLabel}>Veterinarian</Text>
                      <Text style={databaseStyles.recordGridValue}>{appointment.veterinarian || 'Not assigned yet'}</Text>
                    </View>
                    <View style={databaseStyles.recordGridItem}>
                      <Text style={databaseStyles.recordGridLabel}>Reason</Text>
                      <Text style={databaseStyles.recordGridValue}>{appointment.reason}</Text>
                    </View>
                  </View>

                  {appointment.status === 'Cancelled' && appointment.cancellationReason ? (
                    <View style={appointmentStyles.cancellationNote}>
                      <Text style={appointmentStyles.cancellationNoteTitle}>Cancellation Reason</Text>
                      <Text style={appointmentStyles.cancellationNoteText}>{appointment.cancellationReason}</Text>
                    </View>
                  ) : null}

                  <TouchableOpacity style={databaseStyles.recordActionButton} onPress={() => openRecordModal(appointment)} activeOpacity={0.9}>
                    <Text style={databaseStyles.recordActionButtonText}>View Record</Text>
                  </TouchableOpacity>
                </View>
              );
            }) : (
              <View style={styles.managementCard}>
                <View style={styles.emptyStateCard}>
                  <Text style={styles.emptyStateTitle}>No matching booking records</Text>
                  <Text style={styles.emptyStateText}>Try a different search term or switch the record filters to see more results.</Text>
                </View>
              </View>
            )}
          </ScrollView>
        )}

        <Modal transparent animationType="fade" visible={showRecordModal} onRequestClose={closeRecordModal}>
          <View style={styles.modalOverlay}>
            <View style={databaseStyles.modalCard}>
              <ScrollView style={databaseStyles.modalScroll} contentContainerStyle={databaseStyles.modalContent} showsVerticalScrollIndicator={false}>
                <Text style={styles.modalTitle}>{selectedRecord ? `${selectedRecord.petName} Record` : 'Booking Record'}</Text>
                <Text style={styles.modalMessage}>Full staff view for this appointment record.</Text>

                {selectedRecord ? (
                  <>
                    <View style={databaseStyles.modalPillRow}>
                      <View style={[databaseStyles.bucketPill, { backgroundColor: selectedRecordBucketMeta.background, borderColor: selectedRecordBucketMeta.border }]}>
                        <Text style={[databaseStyles.bucketPillText, { color: selectedRecordBucketMeta.color }]}>{selectedRecordBucketMeta.label}</Text>
                      </View>
                      <StatusPill label={getReadableStatus(selectedRecord.status)} backgroundColor={selectedRecordStatusMeta.background} borderColor={selectedRecordStatusMeta.border} color={selectedRecordStatusMeta.color} />
                    </View>

                    <View style={appointmentStyles.detailInfoCard}>
                      <DetailRow label="Owner name" value={selectedRecord.ownerName} />
                      <DetailRow label="Pet" value={`${selectedRecord.petName} - ${selectedRecord.petBreed}`} />
                      <DetailRow label="Veterinarian" value={selectedRecord.veterinarian || 'Not assigned yet'} />
                      <DetailRow label="Appointment date" value={formatFullDate(selectedRecord.dateKey)} />
                      <DetailRow label="Time" value={formatTime(selectedRecord.time)} />
                      <DetailRow label="Reason" value={selectedRecord.reason} />
                      <DetailRow label="Status" value={getReadableStatus(selectedRecord.status)} />
                      <DetailRow label="Booked by" value={selectedRecord.creatorName || selectedRecord.ownerName} />
                    </View>

                    {selectedRecord.status === 'Cancelled' && selectedRecord.cancellationReason ? (
                      <View style={appointmentStyles.cancellationNote}>
                        <Text style={appointmentStyles.cancellationNoteTitle}>Cancellation Reason</Text>
                        <Text style={appointmentStyles.cancellationNoteText}>{selectedRecord.cancellationReason}</Text>
                      </View>
                    ) : null}
                  </>
                ) : null}
              </ScrollView>

              <View style={databaseStyles.modalButtonRow}>
                <TouchableOpacity style={databaseStyles.modalSecondaryButton} onPress={closeRecordModal} activeOpacity={0.9}>
                  <Text style={databaseStyles.modalSecondaryButtonText}>Close</Text>
                </TouchableOpacity>
                <TouchableOpacity style={databaseStyles.modalPrimaryButton} onPress={() => { closeRecordModal(); navigateWithUser('StaffAppointment'); }} activeOpacity={0.9}>
                  <Text style={databaseStyles.modalPrimaryButtonText}>Open Calendar</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    </LinearGradient>
  );
};

const SummaryCard = ({ title, value }) => (
  <View style={[appointmentStyles.summaryCard, { backgroundColor: '#ebf3ff', borderColor: '#c6dbff' }]}>
    <Text style={[appointmentStyles.summaryValue, { color: '#2f80ed' }]}>{value}</Text>
    <Text style={appointmentStyles.summaryLabel}>{title}</Text>
  </View>
);

const databaseStyles = StyleSheet.create({
  searchCard: { borderRadius: 20, backgroundColor: '#f4fbff', borderWidth: 1, borderColor: '#d7edf9', padding: 14, marginBottom: 14 },
  searchLabel: { fontSize: 12, fontWeight: '900', color: '#173f5c', marginBottom: 8, textTransform: 'uppercase' },
  searchInput: { minHeight: 48, borderRadius: 16, borderWidth: 1, borderColor: '#d7edf9', backgroundColor: '#ffffff', paddingHorizontal: 14, fontSize: 14, fontWeight: '700', color: '#173f5c' },
  toolbarRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginBottom: 14 },
  calendarButton: { minHeight: 46, borderRadius: 16, backgroundColor: '#173f5c', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 16, marginBottom: 10, flexGrow: 1, marginRight: 10 },
  calendarButtonText: { fontSize: 13, fontWeight: '900', color: '#ffffff' },
  clearButton: { minHeight: 46, borderRadius: 16, backgroundColor: '#eef5fb', borderWidth: 1, borderColor: '#d7e4ef', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 16, marginBottom: 10 },
  clearButtonText: { fontSize: 12, fontWeight: '800', color: '#4e6a7b' },
  filterTitle: { fontSize: 12, fontWeight: '900', color: '#173f5c', textTransform: 'uppercase', marginBottom: 8 },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 10 },
  filterChip: { borderRadius: 999, borderWidth: 1, borderColor: '#d7e4ef', backgroundColor: '#f5f9fc', paddingHorizontal: 14, paddingVertical: 9, marginRight: 8, marginBottom: 8 },
  filterChipActive: { backgroundColor: '#173f5c', borderColor: '#173f5c' },
  filterChipText: { fontSize: 12, fontWeight: '800', color: '#547285' },
  filterChipTextActive: { color: '#ffffff' },
  resultSummaryCard: { borderRadius: 18, borderWidth: 1, borderColor: '#d7edf9', backgroundColor: '#eef8ff', padding: 14 },
  resultSummaryTitle: { fontSize: 12, fontWeight: '900', color: '#173f5c', marginBottom: 4, textTransform: 'uppercase' },
  resultSummaryText: { fontSize: 13, lineHeight: 19, fontWeight: '700', color: '#59788e' },
  recordHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 },
  recordHeaderCopy: { flex: 1, marginRight: 12 },
  recordHeaderPills: { alignItems: 'flex-end' },
  bucketPill: { borderRadius: 999, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 6, marginBottom: 8 },
  bucketPillText: { fontSize: 10, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.4 },
  recordGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginBottom: 14 },
  recordGridItem: { width: '48.5%', borderRadius: 18, borderWidth: 1, borderColor: '#d7edf9', backgroundColor: '#f4fbff', padding: 12, marginBottom: 10 },
  recordGridLabel: { fontSize: 11, fontWeight: '900', color: '#6d8ca1', textTransform: 'uppercase', marginBottom: 5 },
  recordGridValue: { fontSize: 13, lineHeight: 18, fontWeight: '800', color: '#173f5c' },
  recordActionButton: { minHeight: 48, borderRadius: 16, backgroundColor: '#eef8ff', borderWidth: 1, borderColor: '#d7edf9', justifyContent: 'center', alignItems: 'center' },
  recordActionButtonText: { fontSize: 13, fontWeight: '900', color: '#173f5c' },
  modalCard: { width: '100%', maxHeight: '88%', backgroundColor: '#f8fcff', borderRadius: 28, borderWidth: 1, borderColor: '#dceef8', paddingTop: 20, paddingHorizontal: 18, paddingBottom: 16 },
  modalScroll: { flexGrow: 0 },
  modalContent: { paddingBottom: 16 },
  modalPillRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', marginTop: 14, marginBottom: 16 },
  modalButtonRow: { flexDirection: 'row', justifyContent: 'space-between' },
  modalSecondaryButton: { flex: 1, minHeight: 48, borderRadius: 16, backgroundColor: '#eaf1f6', justifyContent: 'center', alignItems: 'center', marginRight: 8 },
  modalSecondaryButtonText: { fontSize: 13, fontWeight: '800', color: '#4f6a7b' },
  modalPrimaryButton: { flex: 1, minHeight: 48, borderRadius: 16, backgroundColor: '#173f5c', justifyContent: 'center', alignItems: 'center' },
  modalPrimaryButtonText: { fontSize: 13, fontWeight: '900', color: '#ffffff' },
});

export default StaffAppointmentDatabase;
