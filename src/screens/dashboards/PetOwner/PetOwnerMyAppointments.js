import { SafeAreaView } from 'react-native-safe-area-context';
import PetOwnerBottomNav from './PetOwnerBottomNav';
import PetOwnerHeaderGreeting from './PetOwnerHeaderGreeting';
import CollapsingHeaderRow from '../../../components/CollapsingHeaderRow';
import { useLowerHeaderMotion } from '../Veterinary/useLowerHeaderMotion';
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
import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { Dropdown } from 'react-native-element-dropdown';
import { cancelAppointment, consultationTypeLabel, formatTime, getCancellationBlockReason, getOwnerAppointments, todayLocal } from '../../../api/mobileAppointmentService';
import { getQueue, subscribeToQueue } from '../../../api/queueService';
import { supabase } from '../../../config/supabaseClient';

// Same page size as the web Appointments table.
const PAGE_SIZE = 10;

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

// "Neil Cruz" / "Dr. Neil Cruz" -> "Dr. Neil Cruz".
const vetLabel = (name) => {
  const bare = String(name || '').trim().replace(/^(?:dr\.\s*|dr\s+)+/i, '').trim();
  return bare ? `Dr. ${bare}` : 'Veterinarian';
};
const getOwnerId = (user) => user?.id || user?.user_id || user?.profile_id || '';
const formatDate = (value) => {
  if (!value) return '—';
  const date = new Date(`${value}T12:00:00`);
  return date.toLocaleDateString([], { month: 'long', day: 'numeric', year: 'numeric' });
};
// Same filter as the vet's Appointments screen, plus Confirmed (owners have
// upcoming visits).
const STATUS_FILTERS = [
  { label: 'All Statuses', value: 'All' },
  { label: 'Confirmed', value: 'Confirmed' },
  { label: 'Completed', value: 'Completed' },
  { label: 'Cancelled', value: 'Cancelled' },
];

// Every way someone might type an appointment's date, so the one search box
// finds "2026-10-08", "Oct 8", "October 8, 2026", "10/08/2026" or "Thursday".
const dateSearchText = (value) => {
  if (!value) return '';
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const year = date.getFullYear();
  return [
    value,
    formatDate(value),
    date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }),
    date.toLocaleDateString([], { weekday: 'long' }),
    `${month}/${day}/${year}`,
    `${String(month).padStart(2, '0')}/${String(day).padStart(2, '0')}/${year}`,
  ].join(' ');
};

const formatTimestamp = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString([], { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
};

export default function PetOwnerMyAppointments({ navigation, route }) {
  // Lower header row hides on scroll down, like the Veterinarian header.
  const headerMotion = useLowerHeaderMotion();
  const user = route?.params?.user || {};
  const ownerId = getOwnerId(user);
  const ownerName = user?.full_name || user?.fullName || user?.name || user?.username || 'Pet Owner';

  const [appointments, setAppointments] = useState([]);
  const [queueEntries, setQueueEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  // The appointment whose details sheet is open (same as the vet's Appointments).
  const [selected, setSelected] = useState(null);
  const [message, setMessage] = useState('');
  const [isSidebarVisible, setIsSidebarVisible] = useState(false);
  const [cancelTarget, setCancelTarget] = useState(null);
  const [cancelling, setCancelling] = useState(false);
  // Search / status / date filters and paging, same as the web table.
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
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

  useEffect(() => { setPage(1); }, [search, statusFilter]);

  const hasActiveFilters = Boolean(search) || statusFilter !== 'All';
  const clearFilters = () => {
    setSearch('');
    setStatusFilter('All');
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
    // One search box for everything: pet, vet, reason, notes, status, date and
    // time. Each word must match somewhere ("completed oct 8", "chu confirmed").
    const terms = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const rows = appointments.filter((row) => {
      if (statusFilter !== 'All' && row.status !== statusFilter) return false;
      if (!terms.length) return true;
      const haystack = [
        row.pet?.pet_name, row.pet?.species, row.visit_reason, row.status,
        row.veterinarian?.full_name, row.notes, row.appointment_source,
        dateSearchText(row.appointment_date), formatTime(row.start_time),
      ].map((value) => String(value || '')).join(' | ').toLowerCase();
      return terms.every((term) => haystack.includes(term));
    });
    // Most recently created/updated first, so whatever was just booked,
    // rebooked or cancelled shows at the top (same order as the web).
    return [...rows].sort((a, b) => {
      const touchedA = new Date(a.updated_at || a.created_at || 0).getTime();
      const touchedB = new Date(b.updated_at || b.created_at || 0).getTime();
      if (touchedA !== touchedB) return touchedB - touchedA;
      if (a.appointment_date !== b.appointment_date) return a.appointment_date < b.appointment_date ? 1 : -1;
      return String(b.start_time || '').localeCompare(String(a.start_time || ''));
    });
  }, [appointments, search, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredAppointments.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = filteredAppointments.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const goToPage = (nextPage) => {
    setPage(nextPage);
    setExpandedAppointmentId(null);
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  };

  // Web rules: Cancel on upcoming visits; Rebook only on your own online booking.
  const actionsFor = (item) => {
    const canViewQueue = queueEntries.some((entry) => String(entry.appointment_id) === String(item.id));
    const canManage = isUpcoming(item);
    return {
      canViewQueue,
      canManage,
      canRebook: canManage && (item.appointment_source || 'Online') === 'Online',
      cancelBlockReason: canManage ? getCancellationBlockReason(item, { checkedIn: canViewQueue }) : null,
    };
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

          <CollapsingHeaderRow animation={headerMotion.lowerHeaderAnimation}>
            <View style={styles.headerBottomRow}>
              <PetOwnerHeaderGreeting caption="Your appointment history" user={user} />
            </View>
          </CollapsingHeaderRow>
        </LinearGradient>


        <ScrollView onScroll={headerMotion.handleScroll} scrollEventThrottle={16} ref={scrollRef} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <View style={styles.searchBar}>
            <View style={styles.searchRow}>
              <TextInput
                style={styles.searchInput}
                value={search}
                onChangeText={setSearch}
                placeholder="Search pet, vet, reason, date"
                placeholderTextColor="#8aa2b4"
                returnKeyType="search"
              />
              {hasActiveFilters ? (
                <TouchableOpacity style={styles.clearButton} onPress={clearFilters} activeOpacity={0.85}>
                  <Text style={styles.clearButtonText}>Clear</Text>
                </TouchableOpacity>
              ) : null}
            </View>
            <Dropdown
              style={styles.statusDropdown}
              containerStyle={styles.statusDropdownList}
              data={STATUS_FILTERS}
              labelField="label"
              valueField="value"
              value={statusFilter}
              placeholder="Filter by status"
              selectedTextStyle={styles.statusDropdownText}
              placeholderStyle={styles.statusDropdownText}
              onChange={(item) => setStatusFilter(item.value)}
            />
          </View>

          {/* Cards sit directly on the page, like the vet's Appointments list. */}
          <View style={styles.appointmentList}>
            {!pageRows.length ? <Text style={styles.empty}>No appointments found.</Text> : pageRows.map((item) => {
              const partners = visitPartners(item);
              return (
                <TouchableOpacity
                  key={item.id}
                  style={styles.appointmentCard}
                  onPress={() => setSelected(item)}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityLabel={`Show details for ${item.pet?.pet_name || 'pet'} appointment`}
                >
                  <View style={styles.listRowTop}>
                    <Text style={styles.petName} numberOfLines={1}>{[item.pet?.pet_name || 'Pet', ...partners].join(', ')}</Text>
                    <Text style={[styles.status, item.status === 'Cancelled' && styles.statusCancelled, item.status === 'Completed' && styles.statusCompleted]}>{item.status}</Text>
                  </View>
                  {item.visit_group_id && !partners.length ? <Text style={styles.visitBadge}>Part of a multi-pet visit</Text> : null}
                  <Text style={styles.listOwner} numberOfLines={1}>{vetLabel(item.veterinarian?.full_name)}</Text>
                  <Text style={styles.appointmentMeta}>
                    {formatDate(item.appointment_date)} · {formatTime(item.start_time)}{item.end_time ? ` – ${formatTime(item.end_time)}` : ''}
                  </Text>
                  <Text style={styles.listReason} numberOfLines={1}>
                    {consultationTypeLabel(item)}{item.visit_reason ? ` — ${item.visit_reason}` : ''}
                  </Text>
                </TouchableOpacity>
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

        {/* Details sheet: same layout as the vet's Appointments details. */}
        <Modal transparent animationType="fade" visible={Boolean(selected)} onRequestClose={() => setSelected(null)}>
          <View style={styles.detailOverlay}>
            {selected ? (() => {
              const { canViewQueue, canManage, canRebook, cancelBlockReason } = actionsFor(selected);
              const close = (next) => { setSelected(null); next?.(); };
              return (
                <View style={styles.detailCard}>
                  <ScrollView showsVerticalScrollIndicator={false}>
                    <View style={styles.detailHeaderRow}>
                      <Text style={styles.detailTitle}>{[selected.pet?.pet_name || 'Pet', ...visitPartners(selected)].join(', ')}</Text>
                      <Text style={[styles.status, selected.status === 'Cancelled' && styles.statusCancelled, selected.status === 'Completed' && styles.statusCompleted]}>{selected.status}</Text>
                    </View>
                    <SummaryRow label="Pet Owner" value={selected.owner?.full_name || ownerName} />
                    <SummaryRow label="Veterinarian" value={selected.veterinarian?.full_name || '—'} />
                    <SummaryRow label="Date" value={formatDate(selected.appointment_date)} />
                    <SummaryRow label="Start Time" value={formatTime(selected.start_time)} />
                    <SummaryRow label="End Time" value={formatTime(selected.end_time)} />
                    <SummaryRow label="Appointment Source" value={selected.appointment_source || 'Online'} />
                    <SummaryRow label="Consultation Type" value={consultationTypeLabel(selected)} />
                    <SummaryRow label="Visit Reason" value={selected.visit_reason || '—'} />
                    <SummaryRow label="Notes" value={selected.notes || '—'} />
                    <SummaryRow label="Status" value={selected.status || '—'} />
                    <SummaryRow label="Created By" value={selected.creator?.full_name || selected.creator?.username || (String(selected.created_by) === String(ownerId) ? ownerName : selected.created_by || '—')} />
                    <SummaryRow label="Created Date" value={formatTimestamp(selected.created_at)} />
                    <SummaryRow label="Updated Date" value={formatTimestamp(selected.updated_at)} />
                  </ScrollView>

                  {canViewQueue ? (
                    <TouchableOpacity
                      style={[styles.viewQueueButton, styles.detailQueueButton]}
                      onPress={() => close(() => navigation.navigate('PetOwnerQueue', { user }))}
                      activeOpacity={0.88}
                    >
                      <Image source={require('../../assets/List.png')} style={styles.viewQueueIcon} resizeMode="contain" />
                      <Text style={styles.viewQueueText}>View Queue</Text>
                    </TouchableOpacity>
                  ) : null}

                  {canManage ? (
                    <>
                      <View style={styles.actionRow}>
                        <TouchableOpacity
                          style={[styles.cancelButton, cancelBlockReason && styles.cancelButtonDisabled]}
                          onPress={() => { if (!cancelBlockReason) close(() => requestCancel(selected, null)); }}
                          accessibilityState={{ disabled: Boolean(cancelBlockReason) }}
                        >
                          <Text style={[styles.cancelText, cancelBlockReason && styles.cancelTextDisabled]}>Cancel</Text>
                        </TouchableOpacity>
                        {canRebook ? (
                          <TouchableOpacity style={styles.rebookButton} onPress={() => close(() => startReschedule(selected))}>
                            <Text style={styles.rebookText}>Rebook</Text>
                          </TouchableOpacity>
                        ) : null}
                      </View>
                      {cancelBlockReason ? <Text style={styles.cancelNote}>{cancelBlockReason}</Text> : null}
                    </>
                  ) : null}

                  <TouchableOpacity style={styles.detailCloseButton} onPress={() => setSelected(null)} activeOpacity={0.9}>
                    <Text style={styles.detailCloseText}>Close</Text>
                  </TouchableOpacity>
                </View>
              );
            })() : null}
          </View>
        </Modal>

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
  viewQueueButton: { minHeight: 40, paddingHorizontal: 11, borderRadius: 13, backgroundColor: '#2c6ba3', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  viewQueueIcon: { width: 17, height: 17, tintColor: '#ffffff' },
  viewQueueText: { color: '#ffffff', fontSize: 12, fontWeight: '900' },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#e6eef2' },
  summaryLabel: { color: '#78909b', fontSize: 12, fontWeight: '600', flex: 0.42 },
  summaryValue: { color: '#365f72', fontSize: 12, fontWeight: '800', textAlign: 'right', flex: 0.58 },
  actionRow: { flexDirection: 'row', gap: 10, marginTop: 16 },
  cancelButton: { flex: 1, borderWidth: 1, borderColor: '#e4a6a6', paddingVertical: 12, borderRadius: 16, alignItems: 'center', backgroundColor: '#fff8f8' },
  rebookButton: { flex: 1, paddingVertical: 12, borderRadius: 16, alignItems: 'center', backgroundColor: '#e0982f' },
  rebookText: { color: '#ffffff', fontWeight: '900' },
  // Filter panel: same as the vet's Appointments screen.
  searchBar: { backgroundColor: '#fcfeff', borderRadius: 18, borderWidth: 1, borderColor: '#d7edf9', padding: 12, marginBottom: 14, gap: 10 },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  searchInput: { flex: 1, minHeight: 46, borderRadius: 14, borderWidth: 1, borderColor: '#d7edf9', backgroundColor: '#ffffff', paddingHorizontal: 14, fontSize: 14, fontWeight: '700', color: '#123a5e' },
  clearButton: { minHeight: 46, paddingHorizontal: 16, borderRadius: 14, backgroundColor: '#eef4f8', alignItems: 'center', justifyContent: 'center' },
  clearButtonText: { color: '#2c6ba3', fontWeight: '900', fontSize: 12 },
  statusDropdown: { minHeight: 46, borderWidth: 1, borderColor: '#d7edf9', borderRadius: 14, paddingHorizontal: 14, backgroundColor: '#ffffff' },
  statusDropdownList: { borderRadius: 14, borderColor: '#d7edf9' },
  statusDropdownText: { fontSize: 14, fontWeight: '700', color: '#123a5e' },
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
  appointmentList: { marginBottom: 20 },
  appointmentCard: { marginBottom: 10, borderWidth: 1, borderColor: '#dceef8', borderRadius: 18, paddingVertical: 12, paddingHorizontal: 14, backgroundColor: '#ffffff' },
  listRowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 4 },
  listOwner: { fontSize: 13, fontWeight: '700', color: '#3f5f70' },
  listReason: { fontSize: 12, fontWeight: '600', color: '#78909b', marginTop: 2 },
  detailOverlay: { flex: 1, backgroundColor: 'rgba(20,40,50,0.45)', justifyContent: 'center', padding: 20 },
  detailCard: { backgroundColor: '#ffffff', borderRadius: 22, padding: 20, maxHeight: '82%' },
  detailHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  detailTitle: { fontSize: 19, fontWeight: '900', color: '#123a5e', flex: 1, marginRight: 10 },
  detailQueueButton: { marginTop: 14 },
  detailCloseButton: { marginTop: 16, minHeight: 46, borderRadius: 14, backgroundColor: '#2c6ba3', alignItems: 'center', justifyContent: 'center' },
  detailCloseText: { color: '#ffffff', fontWeight: '900', fontSize: 13 },
  appointmentMeta: { color: '#5d7b91', fontSize: 12, fontWeight: '700', marginTop: 2 },
  petName: { color: '#123a5e', fontSize: 16, fontWeight: '900', flex: 1 },
  status: { backgroundColor: '#e7f6f8', color: '#2c6ba3', fontWeight: '900', fontSize: 11, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
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
