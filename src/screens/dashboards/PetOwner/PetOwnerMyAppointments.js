import { SafeAreaView } from 'react-native-safe-area-context';
import PetOwnerBottomNav from './PetOwnerBottomNav';
import PetOwnerHeaderGreeting from './PetOwnerHeaderGreeting';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Dropdown } from 'react-native-element-dropdown';
import CalendarDatePicker from '../../../components/CalendarDatePicker';
import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { APPOINTMENT_STATUSES, cancelAppointment, formatTime, getCancellationBlockReason, getOwnerAppointments, todayLocal } from '../../../api/mobileAppointmentService';
import { getQueue, subscribeToQueue } from '../../../api/queueService';
import { supabase } from '../../../config/supabaseClient';

// Same page size as the web Appointments table.
const PAGE_SIZE = 10;
const STATUS_OPTIONS = [{ label: 'All statuses', value: '' }, ...APPOINTMENT_STATUSES.map((status) => ({ label: status, value: status }))];

const pad2 = (value) => String(value).padStart(2, '0');
// A Confirmed visit that hasn't started yet (web isUpcoming): only these get
// Cancel / Rebook; started or past visits are with the clinic now.
function isUpcoming(row) {
  const today = todayLocal();
  const now = new Date();
  return row.status === 'Confirmed' &&
    (row.appointment_date > today ||
      (row.appointment_date === today && String(row.start_time).slice(0, 5) > `${pad2(now.getHours())}:${pad2(now.getMinutes())}`));
}

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
  const [cancelTarget, setCancelTarget] = useState(null);
  const [cancelling, setCancelling] = useState(false);
  // Search / status / date filters and paging, same as the web table.
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [page, setPage] = useState(1);
  const scrollRef = useRef(null);

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

  useEffect(() => { setPage(1); }, [search, statusFilter, dateFilter]);

  const clearFilters = () => {
    setSearch('');
    setStatusFilter('');
    setDateFilter('');
  };

  // Pets booked together share a visit_group_id; a row names the other pets.
  const visitGroups = useMemo(() => {
    const groups = new Map();
    appointments.forEach((row) => {
      if (!row.visit_group_id) return;
      groups.set(row.visit_group_id, [...(groups.get(row.visit_group_id) || []), row]);
    });
    return groups;
  }, [appointments]);

  const visitPartners = (row) => {
    if (!row.visit_group_id) return [];
    const names = (visitGroups.get(row.visit_group_id) || [])
      .filter((other) => other.id !== row.id && other.pet?.pet_name)
      .map((other) => other.pet.pet_name);
    return [...new Set(names)];
  };

  const filteredAppointments = useMemo(() => {
    const query = search.trim().toLowerCase();
    const rows = appointments.filter((row) =>
      (!statusFilter || row.status === statusFilter) &&
      (!dateFilter || row.appointment_date === dateFilter) &&
      (!query || [
        row.pet?.pet_name, row.pet?.species, row.visit_reason, row.status,
        row.veterinarian?.full_name, row.notes, row.appointment_source,
      ].some((value) => String(value || '').toLowerCase().includes(query))));
    // Most recently created/updated first, so whatever was just booked,
    // rebooked or cancelled shows at the top (same order as the web).
    return [...rows].sort((a, b) => {
      const touchedA = new Date(a.updated_at || a.created_at || 0).getTime();
      const touchedB = new Date(b.updated_at || b.created_at || 0).getTime();
      if (touchedA !== touchedB) return touchedB - touchedA;
      if (a.appointment_date !== b.appointment_date) return a.appointment_date < b.appointment_date ? 1 : -1;
      return String(b.start_time || '').localeCompare(String(a.start_time || ''));
    });
  }, [appointments, search, statusFilter, dateFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredAppointments.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = filteredAppointments.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const hasFilters = Boolean(search.trim() || statusFilter || dateFilter);

  const goToPage = (nextPage) => {
    setPage(nextPage);
    setExpandedAppointmentId(null);
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  };

  // Alert.alert does nothing on web, so the confirmation uses the in-app modal.
  const requestCancel = (appointment, blockReason) => {
    if (blockReason) {
      setMessage(blockReason);
      return;
    }
    setCancelTarget(appointment);
  };

  const confirmCancel = async () => {
    const appointment = cancelTarget;
    if (!appointment || cancelling) return;
    try {
      setCancelling(true);
      await cancelAppointment(appointment.id, ownerId);
      setAppointments(await getOwnerAppointments(ownerId));
      setMessage('Appointment cancelled successfully.');
    } catch (error) {
      setMessage(error.message || 'Unable to cancel the appointment.');
    } finally {
      setCancelling(false);
      setCancelTarget(null);
    }
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
        <LinearGradient colors={['#3a7ab8', '#3a7ab8', '#3a7ab8']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.headerBar}>
          <LinearGradient colors={['#1e5a8c', '#256297', '#2c6ba3', '#3a7ab8']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.headerTopBand}>
            <View style={styles.headerTopRow}>
              <TouchableOpacity style={styles.brandSection} onPress={() => navigation.navigate('petowner-screen', { user })} activeOpacity={0.85}>
                <View style={styles.logoWrap}>
                  <Image source={require('../../assets/paw1.png')} style={styles.headerLogo} resizeMode="contain" />
                </View>
                <View style={styles.brandBlock}>
                  <Text style={styles.headerTitle}>PawCruz</Text>
                  <Text style={styles.headerSubtitle}>Appointments</Text>
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
            <PetOwnerHeaderGreeting caption="Your appointment history" user={user} />
          </View>
        </LinearGradient>


        <ScrollView ref={scrollRef} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <LinearGradient colors={['#3a7ab8', '#3a7ab8', '#3a7ab8']} style={styles.heroCard}>
            <Text style={styles.eyebrow}>APPOINTMENT HISTORY</Text>
            <Text style={styles.title}>Appointments</Text>
            <Text style={styles.subtitle}>View, rebook, or cancel your eligible appointments.</Text>
          </LinearGradient>

          <View style={styles.filtersCard}>
            <TextInput
              style={styles.searchInput}
              value={search}
              onChangeText={setSearch}
              placeholder="Search pet, veterinarian, reason, or notes"
              placeholderTextColor="#87a0b1"
              returnKeyType="search"
            />
            <View style={styles.filterRow}>
              <Dropdown
                style={styles.statusDropdown}
                selectedTextStyle={styles.filterText}
                placeholderStyle={styles.filterText}
                itemTextStyle={styles.filterText}
                data={STATUS_OPTIONS}
                labelField="label"
                valueField="value"
                value={statusFilter}
                placeholder="All statuses"
                onChange={(item) => setStatusFilter(item.value)}
              />
              <TouchableOpacity
                style={[styles.clearFiltersButton, !hasFilters && styles.clearFiltersButtonIdle]}
                onPress={clearFilters}
                activeOpacity={0.85}
              >
                <Text style={styles.clearFiltersText}>✕ Clear</Text>
              </TouchableOpacity>
            </View>
            <CalendarDatePicker value={dateFilter} onChange={setDateFilter} placeholder="Any date" />
          </View>

          <View style={styles.card}>
            {!pageRows.length ? <Text style={styles.empty}>No appointments found.</Text> : pageRows.map((item) => {
              const isExpanded = expandedAppointmentId === item.id;
              const canViewQueue = queueEntries.some((entry) => String(entry.appointment_id) === String(item.id));
              // Web rules: Cancel on upcoming visits; Rebook only on your own online booking.
              const canManage = isUpcoming(item);
              const canRebook = canManage && (item.appointment_source || 'Online') === 'Online';
              const cancelBlockReason = canManage ? getCancellationBlockReason(item, { checkedIn: canViewQueue }) : null;
              const partners = visitPartners(item);
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
                      <Text style={styles.petName} numberOfLines={1}>{[item.pet?.pet_name || 'Pet', ...partners].join(', ')}</Text>
                      {item.visit_group_id && !partners.length ? <Text style={styles.visitBadge}>Part of a multi-pet visit</Text> : null}
                      <Text style={styles.appointmentSub} numberOfLines={1}>
                        {item.pet?.species || 'Pet'} · {item.visit_reason || 'General Consultation'}
                      </Text>
                      <Text style={styles.appointmentMeta} numberOfLines={1}>
                        {formatDate(item.appointment_date)} · {formatTime(item.start_time)}
                      </Text>
                      <Text style={styles.appointmentSub} numberOfLines={1}>
                        {item.veterinarian?.full_name || 'Veterinarian'} · {item.appointment_source || 'Online'}
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

                  {canManage && (
                    <>
                      <View style={styles.actionRow}>
                        <TouchableOpacity
                          style={[styles.cancelButton, cancelBlockReason && styles.cancelButtonDisabled]}
                          onPress={() => requestCancel(item, cancelBlockReason)}
                          accessibilityState={{ disabled: Boolean(cancelBlockReason) }}
                        >
                          <Text style={[styles.cancelText, cancelBlockReason && styles.cancelTextDisabled]}>Cancel</Text>
                        </TouchableOpacity>
                        {canRebook ? (
                          <TouchableOpacity style={styles.rebookButton} onPress={() => startReschedule(item)}>
                            <Text style={styles.rebookText}>Rebook</Text>
                          </TouchableOpacity>
                        ) : null}
                      </View>
                      {cancelBlockReason ? <Text style={styles.cancelNote}>{cancelBlockReason}</Text> : null}
                    </>
                  )}

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
                    </View>
                  )}
                </View>
              );
            })}

            {filteredAppointments.length > 0 ? (
              <View style={styles.pagination}>
                <View style={styles.paginationButtons}>
                  <TouchableOpacity
                    style={[styles.pageButton, currentPage <= 1 && styles.pageButtonDisabled]}
                    onPress={() => goToPage(Math.max(1, currentPage - 1))}
                    disabled={currentPage <= 1}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.pageButtonText}>Previous</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.pageButton, currentPage >= totalPages && styles.pageButtonDisabled]}
                    onPress={() => goToPage(Math.min(totalPages, currentPage + 1))}
                    disabled={currentPage >= totalPages}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.pageButtonText}>Next</Text>
                  </TouchableOpacity>
                </View>
                <Text style={styles.paginationText}>
                  {filteredAppointments.length} appointment{filteredAppointments.length === 1 ? '' : 's'} · Page {currentPage} of {totalPages}
                </Text>
              </View>
            ) : null}
          </View>
        </ScrollView>

        <Modal transparent animationType="fade" visible={Boolean(cancelTarget)} onRequestClose={() => { if (!cancelling) setCancelTarget(null); }}>
          <View style={styles.cancelOverlay}>
            <Pressable style={StyleSheet.absoluteFill} onPress={() => { if (!cancelling) setCancelTarget(null); }} />
            {cancelTarget ? (
              <View style={styles.cancelCard}>
                <View style={styles.cancelIconWrap}>
                  <Text style={styles.cancelIconText}>!</Text>
                </View>
                <Text style={styles.cancelTitle}>Cancel Appointment?</Text>
                <Text style={styles.cancelSubtitle}>
                  Cancel {cancelTarget.pet?.pet_name || 'this pet'}'s appointment on {formatDate(cancelTarget.appointment_date)} at {formatTime(cancelTarget.start_time)}? This cannot be undone.
                </Text>

                <View style={styles.cancelSummary}>
                  <View style={styles.cancelSummaryRow}>
                    <Text style={styles.cancelSummaryLabel}>Pet</Text>
                    <Text style={styles.cancelSummaryValue} numberOfLines={1}>{cancelTarget.pet?.pet_name || 'Pet'}</Text>
                  </View>
                  <View style={styles.cancelSummaryRow}>
                    <Text style={styles.cancelSummaryLabel}>Date</Text>
                    <Text style={styles.cancelSummaryValue} numberOfLines={1}>{formatDate(cancelTarget.appointment_date)}</Text>
                  </View>
                  <View style={[styles.cancelSummaryRow, styles.cancelSummaryRowLast]}>
                    <Text style={styles.cancelSummaryLabel}>Time</Text>
                    <Text style={styles.cancelSummaryValue} numberOfLines={1}>{formatTime(cancelTarget.start_time)}</Text>
                  </View>
                </View>

                <View style={styles.modalButtonRow}>
                  <TouchableOpacity style={styles.modalKeepButton} onPress={() => setCancelTarget(null)} disabled={cancelling} activeOpacity={0.9}>
                    <Text style={styles.modalKeepText} numberOfLines={1} adjustsFontSizeToFit>Keep Appointment</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.modalCancelButton, cancelling && styles.modalButtonBusy]} onPress={confirmCancel} disabled={cancelling} activeOpacity={0.9}>
                    <Text style={styles.modalCancelText} numberOfLines={1} adjustsFontSizeToFit>{cancelling ? 'Cancelling…' : 'Yes, Cancel Appointment'}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : null}
          </View>
        </Modal>

        <PetOwnerBottomNav navigation={navigation} user={user} activeKey="myAppointments" />
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
    shadowColor: '#2c6ba3', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.22, shadowRadius: 16, elevation: 8,
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
    width: 46, height: 46, borderRadius: 15, backgroundColor: 'rgba(44, 107, 163, 0.42)',
    borderWidth: 1, borderColor: 'rgba(222, 242, 247, 0.34)', justifyContent: 'center', alignItems: 'center', position: 'relative',
  },
  notifBadge: {
    position: 'absolute', top: 11, right: 12, width: 9, height: 9, borderRadius: 4.5,
    backgroundColor: '#f47c6b', borderWidth: 2, borderColor: '#2c6ba3',
  },
  notifIcon: { width: 21, height: 21, tintColor: '#ffffff' },
  profileButton: {
    width: 46, height: 46, borderRadius: 15, backgroundColor: 'rgba(44, 107, 163, 0.42)',
    borderWidth: 1, borderColor: 'rgba(222, 242, 247, 0.34)', justifyContent: 'center', alignItems: 'center', marginLeft: 10, overflow: 'hidden',
  },
  profileIcon: { width: 20, height: 20, tintColor: '#ffffff' },
  headerBottomRow: { marginTop: 14, paddingTop: 0, borderTopWidth: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  ownerSummary: { flex: 1, alignItems: 'flex-end', marginLeft: 12 },
  headerCaption: { fontSize: 12, color: '#b8d4e5', fontWeight: '700', textAlign: 'right' },
  ownerName: { fontSize: 18, fontWeight: '800', color: '#ffffff', marginTop: 4, textAlign: 'right' },
  menuTriggerButton: {
    width: 58, height: 58, borderRadius: 18, backgroundColor: 'rgba(44, 107, 163, 0.36)',
    borderWidth: 1, borderColor: 'rgba(222, 242, 247, 0.3)', justifyContent: 'center', alignItems: 'center',
  },
  menuTriggerButtonActive: { backgroundColor: 'rgba(44, 107, 163, 0.58)' },
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
  stickyNoticeIcon: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#2c6ba3', alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  stickyNoticeIconText: { color: '#ffffff', fontSize: 20, fontWeight: '900', lineHeight: 22 },
  stickyNoticeText: { flex: 1, color: '#123a5e', fontSize: 13, lineHeight: 18, fontWeight: '800' },
  stickyNoticeClose: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', marginLeft: 4 },
  stickyNoticeCloseText: { color: '#5e7886', fontSize: 26, fontWeight: '500', lineHeight: 28 },
  card: {
    backgroundColor: '#fcfeff', borderRadius: 28, padding: 18, borderWidth: 1, borderColor: '#edf7fd', marginBottom: 20,
    shadowColor: '#3a7ab8', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.15, shadowRadius: 18, elevation: 6,
  },
  viewQueueButton: { minHeight: 40, paddingHorizontal: 11, borderRadius: 13, backgroundColor: '#2c6ba3', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  viewQueueIcon: { width: 17, height: 17, tintColor: '#ffffff' },
  viewQueueText: { color: '#ffffff', fontSize: 12, fontWeight: '900' },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 14, paddingVertical: 5, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#e2ecef' },
  summaryLabel: { color: '#78909b', fontSize: 12, fontWeight: '600', flex: 0.42 },
  summaryValue: { color: '#365f72', fontSize: 12, fontWeight: '800', textAlign: 'right', flex: 0.58 },
  actionRow: { flexDirection: 'row', gap: 10, marginTop: 16 },
  cancelButton: { flex: 1, borderWidth: 1, borderColor: '#e4a6a6', paddingVertical: 12, borderRadius: 16, alignItems: 'center', backgroundColor: '#fff8f8' },
  rebookButton: { flex: 1, paddingVertical: 12, borderRadius: 16, alignItems: 'center', backgroundColor: '#e0982f' },
  rebookText: { color: '#ffffff', fontWeight: '900' },
  filtersCard: {
    backgroundColor: '#fcfeff', borderRadius: 22, padding: 14, borderWidth: 1, borderColor: '#edf7fd', marginBottom: 14, gap: 10,
    shadowColor: '#3a7ab8', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.1, shadowRadius: 12, elevation: 3,
  },
  searchInput: { minHeight: 46, borderWidth: 1, borderColor: '#d6e7ee', borderRadius: 12, paddingHorizontal: 14, backgroundColor: '#ffffff', color: '#1d3a4a', fontSize: 14, fontWeight: '600' },
  filterRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  statusDropdown: { flex: 1, minHeight: 46, borderWidth: 1, borderColor: '#d6e7ee', borderRadius: 12, paddingHorizontal: 12, backgroundColor: '#ffffff' },
  filterText: { fontSize: 14, fontWeight: '700', color: '#2f4a56' },
  clearFiltersButton: { minHeight: 46, paddingHorizontal: 16, borderWidth: 1, borderColor: '#cfe4ed', borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: '#ffffff' },
  clearFiltersButtonIdle: { opacity: 0.6 },
  clearFiltersText: { color: '#257fa9', fontWeight: '800', fontSize: 13 },
  appointmentSub: { color: '#7b8e97', fontSize: 12, fontWeight: '600', marginTop: 3 },
  visitBadge: { alignSelf: 'flex-start', marginTop: 4, paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999, backgroundColor: '#eaf6fc', color: '#2c7fb8', fontSize: 11, fontWeight: '700' },
  pagination: { marginTop: 16, alignItems: 'center', gap: 8 },
  paginationButtons: { flexDirection: 'row', gap: 10 },
  pageButton: { minWidth: 96, paddingVertical: 10, paddingHorizontal: 16, borderRadius: 12, borderWidth: 1, borderColor: '#cfe4ed', backgroundColor: '#ffffff', alignItems: 'center' },
  pageButtonDisabled: { opacity: 0.45 },
  pageButtonText: { color: '#257fa9', fontWeight: '800', fontSize: 13 },
  paginationText: { color: '#52707d', fontSize: 12.5, fontWeight: '600' },
  cancelText: { color: '#b54b4b', fontWeight: '800' },
  cancelButtonDisabled: { borderColor: '#e3e8ec', backgroundColor: '#f4f6f8' },
  cancelTextDisabled: { color: '#9aa8b2' },
  cancelNote: { marginTop: 8, fontSize: 12, fontWeight: '700', color: '#9d6817', lineHeight: 17 },
  cancelOverlay: { flex: 1, backgroundColor: 'rgba(10, 30, 45, 0.45)', alignItems: 'center', justifyContent: 'center', padding: 22 },
  cancelCard: {
    width: '100%', maxWidth: 360, backgroundColor: '#ffffff', borderRadius: 26, paddingHorizontal: 20, paddingTop: 24, paddingBottom: 20,
    alignItems: 'center', shadowColor: '#0a1e2d', shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.18, shadowRadius: 24, elevation: 16,
  },
  cancelIconWrap: { width: 52, height: 52, borderRadius: 26, backgroundColor: '#fde8e8', alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  cancelIconText: { color: '#b54b4b', fontSize: 26, fontWeight: '900', lineHeight: 30 },
  cancelTitle: { fontSize: 19, fontWeight: '900', color: '#123a5e', textAlign: 'center' },
  cancelSubtitle: { marginTop: 6, fontSize: 13, fontWeight: '600', color: '#5f7f94', textAlign: 'center', lineHeight: 19 },
  cancelSummary: { width: '100%', marginTop: 18, marginBottom: 20, borderRadius: 18, backgroundColor: '#f4fbff', borderWidth: 1, borderColor: '#d7edf9', paddingHorizontal: 14 },
  cancelSummaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: '#e3f1f8' },
  cancelSummaryRowLast: { borderBottomWidth: 0 },
  cancelSummaryLabel: { fontSize: 13, fontWeight: '700', color: '#6a8aa0' },
  cancelSummaryValue: { flexShrink: 1, marginLeft: 12, fontSize: 14, fontWeight: '900', color: '#123a5e', textAlign: 'right' },
  modalButtonRow: { flexDirection: 'row', gap: 10, width: '100%' },
  modalKeepButton: { flex: 1, height: 50, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: '#edf6f8', borderWidth: 1, borderColor: '#c6e5ed' },
  modalKeepText: { color: '#2c6ba3', fontSize: 15, fontWeight: '900' },
  modalCancelButton: { flex: 1, height: 50, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: '#c0504d' },
  modalCancelText: { color: '#ffffff', fontSize: 15, fontWeight: '900' },
  modalButtonBusy: { opacity: 0.7 },
  empty: { color: '#758b94', textAlign: 'center', paddingVertical: 24 },
  appointmentCard: { marginTop: 10, borderWidth: 1, borderColor: '#dceef8', borderRadius: 20, padding: 12, backgroundColor: '#fcfeff' },
  compactAppointmentRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  appointmentRowMain: { flex: 1, minWidth: 0, paddingVertical: 3 },
  appointmentRowActions: { alignItems: 'flex-end', gap: 8 },
  appointmentMeta: { color: '#5d7b91', fontSize: 12, fontWeight: '700', marginTop: 4 },
  appointmentHint: { color: '#2c6ba3', fontSize: 11, fontWeight: '800', marginTop: 5 },
  appointmentDetails: { marginTop: 12, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#e2eef2' },
  petName: { color: '#123a5e', fontSize: 16, fontWeight: '900' },
  status: { backgroundColor: '#def4e6', color: '#26704a', fontWeight: '800', fontSize: 11, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 999 },
  statusCancelled: { backgroundColor: '#fde8e8', color: '#a74646' },
  statusCompleted: { backgroundColor: '#e8eefc', color: '#4567a6' },

  quickAssistFloat: {
    position: 'absolute', right: 18, bottom: 16, width: 84, height: 84, borderRadius: 42, backgroundColor: '#2c6ba3',
    borderWidth: 2, borderColor: '#d7eef3', alignItems: 'center', justifyContent: 'center', padding: 10,
    zIndex: 1000, elevation: 18, shadowColor: '#123a5e', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.18, shadowRadius: 16,
  },
  quickAssistTouch: { width: '100%', height: '100%', borderRadius: 37, alignItems: 'center', justifyContent: 'center' },
  quickAssistIconWrap: { width: 52, height: 52, borderRadius: 26, backgroundColor: '#e7f6f8', borderWidth: 1, borderColor: '#c8e4f5', alignItems: 'center', justifyContent: 'center' },
  quickAssistIcon: { width: 30, height: 30, tintColor: '#123a5e' },
});
