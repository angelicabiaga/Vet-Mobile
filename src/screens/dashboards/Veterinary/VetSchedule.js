import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import VetShell, { getVetUser } from './VetShell';
import VetLeaveRequestModal from './VetLeaveRequestModal';
import { useLowerHeaderMotion } from './useLowerHeaderMotion';
import { formatTime, getVeterinarianScheduleOverrides, getVeterinarianWeeklySchedule, todayLocal } from '../../../api/mobileAppointmentService';
import {
  cancelLeaveRequest,
  formatDayLabel,
  formatHours,
  formatLeavePeriod,
  getMyLeaveRequests,
  getScheduleOverview,
  leaveStatusMeta,
  subscribeToVetSchedule,
} from '../../../api/vetLeaveService';

const WEEK_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function formatOverrideDate(value) {
  if (!value) return '';
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
}

// How one of the next 14 days reads in the list.
function describeDay(day) {
  const pending = day.request?.status === 'Pending';
  if (day.source === 'leave' && !day.working) return { kind: 'leave', hours: 'On leave', tag: day.request?.leave_type || 'Approved leave' };
  if (day.source === 'leave') return { kind: 'short', hours: formatHours(day.start_time, day.end_time), tag: `Short day · ${day.request?.leave_type || 'leave'}` };
  if (day.source === 'none') return { kind: 'off', hours: 'No schedule yet', tag: 'Not open for booking' };
  if (!day.working) return { kind: 'off', hours: 'Day off', tag: pending ? 'Leave pending' : '' };
  if (pending) return { kind: 'pending', hours: formatHours(day.start_time, day.end_time), tag: 'Leave pending' };
  if (day.source === 'adjusted') return { kind: 'adjusted', hours: formatHours(day.start_time, day.end_time), tag: 'Adjusted hours' };
  return { kind: 'work', hours: formatHours(day.start_time, day.end_time), tag: '' };
}

export default function VetSchedule({ navigation, route }) {
  const currentUser = getVetUser(route);
  const vetId = currentUser?.id || currentUser?.user_id || currentUser?.profile_id || null;
  const { scrollViewRef, lowerHeaderAnimation, handleScroll } = useLowerHeaderMotion();

  const [overview, setOverview] = useState(null);
  const [requests, setRequests] = useState([]);
  // Read-only fallback (the previous version of this screen) until the
  // clinic runs VET_LEAVE_REQUESTS.sql.
  const [legacy, setLegacy] = useState(null);
  const [setupNotice, setSetupNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [modal, setModal] = useState(null);
  const [tab, setTab] = useState('active');
  const [cancellingId, setCancellingId] = useState(null);

  const loadSchedule = useCallback(async () => {
    if (!vetId) return;
    try {
      const [nextOverview, nextRequests] = await Promise.all([
        getScheduleOverview(vetId, 14),
        getMyLeaveRequests(vetId),
      ]);
      setOverview(nextOverview);
      setRequests(nextRequests);
      setLegacy(null);
      setSetupNotice('');
      setError('');
    } catch (loadError) {
      if (loadError?.setupMissing) {
        try {
          const [weeklyRows, overrideRows] = await Promise.all([
            getVeterinarianWeeklySchedule(vetId),
            getVeterinarianScheduleOverrides(vetId),
          ]);
          setLegacy({ weekly: weeklyRows, overrides: overrideRows });
          setOverview(null);
          setSetupNotice(loadError.message);
          setError('');
        } catch (legacyError) {
          setError(legacyError?.message || 'Unable to load your schedule.');
        }
      } else {
        setError(loadError?.message || 'Unable to load your schedule.');
      }
    } finally {
      setLoading(false);
    }
  }, [vetId]);

  useFocusEffect(
    useCallback(() => {
      loadSchedule();
      const unsubscribe = subscribeToVetSchedule(vetId, loadSchedule);
      const timer = setInterval(loadSchedule, 60000);
      return () => {
        unsubscribe();
        clearInterval(timer);
      };
    }, [loadSchedule, vetId])
  );

  React.useEffect(() => {
    if (!notice) return undefined;
    const timer = setTimeout(() => setNotice(''), 7000);
    return () => clearTimeout(timer);
  }, [notice]);

  const today = overview?.today || todayLocal();
  const days = useMemo(() => overview?.days || [], [overview]);
  const todayInfo = days[0] || null;
  const nowTime = String(overview?.now || '').slice(0, 5);
  const weekly = overview?.weekly || legacy?.weekly || [];

  const activeTodayRequest = useMemo(() => requests.find((request) =>
    ['Pending', 'Approved'].includes(request.status) && request.start_date <= today && request.end_date >= today
  ), [requests, today]);
  const activeEmergency = activeTodayRequest?.request_type === 'Emergency' && activeTodayRequest.status === 'Approved' ? activeTodayRequest : null;

  const todayStatus = useMemo(() => {
    if (!todayInfo) return { headline: '—', detail: '', tone: 'duty' };
    if (todayInfo.source === 'leave' && !todayInfo.working) {
      return { headline: activeEmergency ? 'Emergency leave' : 'On leave today', detail: activeTodayRequest?.leave_type || 'Approved leave', tone: 'leave' };
    }
    if (todayInfo.source === 'leave') {
      return { headline: activeEmergency ? 'Emergency leave' : 'Short day', detail: `Available ${formatHours(todayInfo.start_time, todayInfo.end_time)} only`, tone: 'short' };
    }
    if (!todayInfo.working) return { headline: 'Off today', detail: "You're not scheduled today.", tone: 'off' };
    const ended = nowTime && nowTime >= String(todayInfo.end_time).slice(0, 5);
    return { headline: ended ? 'Shift finished' : 'On duty', detail: formatHours(todayInfo.start_time, todayInfo.end_time), tone: 'duty' };
  }, [todayInfo, activeEmergency, activeTodayRequest, nowTime]);

  const emergencyBlockedReason = useMemo(() => {
    if (!todayInfo) return 'Your schedule is still loading.';
    if (activeTodayRequest) return 'You already have a leave request covering today.';
    if (!todayInfo.working) return "You're not scheduled to work today.";
    if (nowTime && nowTime >= String(todayInfo.end_time).slice(0, 5)) return 'Your shift today has already ended.';
    return '';
  }, [todayInfo, activeTodayRequest, nowTime]);

  const visibleRequests = useMemo(() => requests.filter((request) => {
    const active = request.status === 'Pending' || (request.status === 'Approved' && request.end_date >= today);
    return tab === 'active' ? active : !active;
  }), [requests, tab, today]);

  const handleSubmitted = (result) => {
    setModal(null);
    setNotice(result?.request?.request_type === 'Emergency'
      ? 'Emergency leave applied. New bookings are blocked, and staff were alerted to offer your booked patients another doctor.'
      : "Leave request sent. You'll be notified when staff approve or decline it.");
    loadSchedule();
  };

  const doCancel = async (request) => {
    try {
      setCancellingId(request.id);
      await cancelLeaveRequest(request.id, vetId);
      setNotice(request.status === 'Pending' ? 'Leave request withdrawn.' : 'Leave cancelled. Your regular hours are back and staff were notified.');
      await loadSchedule();
    } catch (cancelError) {
      Alert.alert('Unable to cancel', cancelError?.message || 'Please try again.');
    } finally {
      setCancellingId(null);
    }
  };

  const confirmCancel = (request) => {
    const copy = request.request_type === 'Emergency' && request.status === 'Approved'
      ? ['Are you available again?', 'Your remaining hours today reopen for bookings and staff are notified. Patients already moved to another doctor stay where they are.', "Yes, I'm available"]
      : request.status === 'Approved'
        ? ['Cancel this approved leave?', 'Your regular hours come back and pet owners can book you again for these dates. Staff will be notified.', 'Cancel leave']
        : ['Withdraw this request?', 'Staff will no longer see it for review.', 'Withdraw'];
    Alert.alert(copy[0], copy[1], [
      { text: 'Keep it', style: 'cancel' },
      { text: copy[2], style: 'destructive', onPress: () => doCancel(request) },
    ]);
  };

  const toneStyle = { leave: styles.todayLeave, short: styles.todayShort, off: styles.todayOff, duty: styles.todayDuty }[todayStatus.tone];

  return (
    <VetShell
      navigation={navigation}
      route={route}
      subtitle="Schedule"
      caption="Hours & leave"
      lowerHeaderAnimation={lowerHeaderAnimation}
    >
      <ScrollView
        ref={scrollViewRef}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        refreshControl={<RefreshControl refreshing={false} onRefresh={loadSchedule} />}
      >
        {loading && !overview && !legacy ? (
          <View style={styles.emptyCard}>
            <ActivityIndicator size="large" color="#2c6ba3" />
            <Text style={styles.emptyText}>Loading your schedule...</Text>
          </View>
        ) : null}

        {!loading && error ? (
          <View style={styles.emptyCard}>
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity style={styles.retryButton} onPress={loadSchedule} activeOpacity={0.9}>
              <Text style={styles.retryText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {notice ? <View style={styles.noticeCard}><Text style={styles.noticeText}>{notice}</Text></View> : null}
        {setupNotice ? <View style={styles.setupCard}><Text style={styles.setupText}>{setupNotice}</Text></View> : null}

        {overview && todayInfo ? (
          <View style={[styles.todayCard, toneStyle]}>
            <Text style={styles.todayEyebrow}>TODAY · {formatDayLabel(today).toUpperCase()}</Text>
            <Text style={styles.todayHeadline}>{todayStatus.headline}</Text>
            <Text style={styles.todayDetail}>{todayStatus.detail}</Text>
            <View style={styles.metaRow}>
              <Text style={styles.metaPill}>{todayInfo.appointments || 0} booked today</Text>
              <Text style={styles.metaPill}>{overview.queue_today || 0} in your queue</Text>
            </View>
            <View style={styles.actionRow}>
              <TouchableOpacity style={styles.primaryButton} onPress={() => setModal({ mode: 'Leave' })} activeOpacity={0.9}>
                <Text style={styles.primaryText}>Request leave</Text>
              </TouchableOpacity>
              {activeEmergency ? (
                <TouchableOpacity style={styles.availableButton} onPress={() => confirmCancel(activeEmergency)} disabled={cancellingId === activeEmergency.id} activeOpacity={0.9}>
                  <Text style={styles.availableText}>{cancellingId === activeEmergency.id ? 'Saving…' : "I'm available again"}</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={[styles.dangerButton, emergencyBlockedReason ? styles.buttonDisabled : null]}
                  onPress={() => setModal({ mode: 'Emergency' })}
                  disabled={Boolean(emergencyBlockedReason)}
                  activeOpacity={0.9}
                >
                  <Text style={styles.dangerText}>Emergency leave</Text>
                </TouchableOpacity>
              )}
            </View>
            {emergencyBlockedReason && !activeEmergency ? <Text style={styles.blockedText}>{emergencyBlockedReason}</Text> : null}
          </View>
        ) : null}

        {overview ? (
          <>
            <View style={styles.sectionHeaderWrap}>
              <Text style={styles.sectionTitle}>Next 14 Days</Text>
              <Text style={styles.sectionSubtitle}>Your hours as pet owners see them. Tap a future working day to request leave.</Text>
            </View>
            <View style={styles.card}>
              {days.map((day, index) => {
                const info = describeDay(day);
                const canRequest = day.date > today && day.working && !day.request;
                return (
                  <TouchableOpacity
                    key={day.date}
                    style={[styles.dayRow, index === days.length - 1 && styles.lastRow]}
                    disabled={!canRequest}
                    onPress={() => setModal({ mode: 'Leave', date: day.date })}
                    activeOpacity={0.85}
                  >
                    <View style={styles.dayDateWrap}>
                      <Text style={[styles.dayLabel, day.is_today && styles.dayToday]}>{day.is_today ? 'Today' : formatDayLabel(day.date)}</Text>
                      {info.tag ? <Text style={[styles.dayTag, info.kind === 'leave' && styles.dayTagLeave]}>{info.tag}</Text> : null}
                    </View>
                    <View style={styles.dayRight}>
                      <View style={[styles.dayBadge, styles[`badge_${info.kind}`]]}>
                        <Text style={[styles.dayBadgeText, styles[`badgeText_${info.kind}`]]}>{info.hours}</Text>
                      </View>
                      {day.appointments > 0 ? <Text style={styles.bookedText}>{day.appointments} booked</Text> : null}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </>
        ) : null}

        {(overview || legacy) && !error ? (
          <>
            <View style={styles.sectionHeaderWrap}>
              <Text style={styles.sectionTitle}>Weekly Availability</Text>
              <Text style={styles.sectionSubtitle}>Your standard clinic hours, set by clinic staff</Text>
            </View>

            <View style={styles.card}>
              {WEEK_LABELS.map((label, dayIndex) => {
                const entry = weekly.find((row) => row.day_of_week === dayIndex) || null;
                const available = Boolean(entry?.is_available && entry?.start_time && entry?.end_time);
                return (
                  <View key={label} style={[styles.dayRow, dayIndex === WEEK_LABELS.length - 1 && styles.lastRow]}>
                    <Text style={styles.dayLabel}>{label}</Text>
                    <View style={[styles.dayBadge, available ? styles.dayBadgeOpen : styles.dayBadgeClosed]}>
                      <Text style={[styles.dayBadgeText, available ? styles.dayBadgeTextOpen : styles.dayBadgeTextClosed]}>
                        {available ? `${formatTime(entry.start_time)} - ${formatTime(entry.end_time)}` : 'Not available'}
                      </Text>
                    </View>
                  </View>
                );
              })}
              {!weekly.length ? (
                <Text style={styles.mutedText}>No weekly schedule has been set up for you yet.</Text>
              ) : null}
            </View>
          </>
        ) : null}

        {legacy && !error ? (
          <>
            <View style={styles.sectionHeaderWrap}>
              <Text style={styles.sectionTitle}>Upcoming Overrides</Text>
              <Text style={styles.sectionSubtitle}>Date-specific changes to your usual hours</Text>
            </View>
            <View style={styles.card}>
              {legacy.overrides.length ? legacy.overrides.map((entry, index) => {
                const available = Boolean(entry.is_available && entry.start_time && entry.end_time);
                return (
                  <View key={`${entry.schedule_date}-${index}`} style={styles.dayRow}>
                    <Text style={styles.dayLabel}>{formatOverrideDate(entry.schedule_date)}</Text>
                    <View style={[styles.dayBadge, available ? styles.dayBadgeOpen : styles.dayBadgeClosed]}>
                      <Text style={[styles.dayBadgeText, available ? styles.dayBadgeTextOpen : styles.dayBadgeTextClosed]}>
                        {available ? `${formatTime(entry.start_time)} - ${formatTime(entry.end_time)}` : 'Unavailable'}
                      </Text>
                    </View>
                  </View>
                );
              }) : (
                <Text style={styles.mutedText}>No upcoming schedule overrides on record.</Text>
              )}
            </View>
          </>
        ) : null}

        {overview ? (
          <>
            <View style={[styles.sectionHeaderWrap, styles.requestsHeader]}>
              <View style={{ flex: 1 }}>
                <Text style={styles.sectionTitle}>My Leave Requests</Text>
                <Text style={styles.sectionSubtitle}>Status updates also arrive as notifications</Text>
              </View>
              <View style={styles.toggle}>
                {['active', 'history'].map((key) => (
                  <TouchableOpacity key={key} style={[styles.toggleItem, tab === key && styles.toggleItemActive]} onPress={() => setTab(key)} activeOpacity={0.85}>
                    <Text style={[styles.toggleText, tab === key && styles.toggleTextActive]}>{key === 'active' ? 'Active' : 'History'}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {visibleRequests.length ? visibleRequests.map((request) => {
              const status = leaveStatusMeta(request, today);
              const cancellable = request.status === 'Pending' || (request.status === 'Approved' && request.end_date >= today);
              return (
                <View key={request.id} style={styles.requestCard}>
                  <View style={styles.requestTop}>
                    <Text style={[styles.typeBadge, request.request_type === 'Emergency' && styles.typeBadgeEmergency]}>{request.request_type.toUpperCase()}</Text>
                    <Text style={[styles.statusPill, styles[`pill_${status.tone}`]]}>{status.label}</Text>
                  </View>
                  <Text style={styles.requestTitle}>{request.leave_type}</Text>
                  <Text style={styles.requestPeriod}>{formatLeavePeriod(request, today)}</Text>
                  {request.reason && String(request.reason).trim().toLowerCase() !== String(request.leave_type || '').trim().toLowerCase() ? (
                    <Text style={styles.requestReason}>“{request.reason}”</Text>
                  ) : null}
                  {request.review_note && request.status !== 'Pending' ? <Text style={styles.requestNote}>Staff note: {request.review_note}</Text> : null}
                  {request.cancel_note ? <Text style={styles.requestNote}>Note: {request.cancel_note}</Text> : null}
                  <View style={styles.requestFoot}>
                    <Text style={styles.requestMeta}>Filed {formatOverrideDate(String(request.created_at).slice(0, 10))}{request.reviewer?.full_name ? ` · by ${request.reviewer.full_name}` : ''}</Text>
                    {cancellable ? (
                      <TouchableOpacity onPress={() => confirmCancel(request)} disabled={cancellingId === request.id} activeOpacity={0.8}>
                        <Text style={styles.cancelLink}>
                          {cancellingId === request.id ? 'Saving…' : request.status === 'Pending' ? 'Withdraw' : request.request_type === 'Emergency' ? "I'm available" : 'Cancel leave'}
                        </Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                </View>
              );
            }) : (
              <View style={styles.card}><Text style={styles.mutedText}>{tab === 'active' ? 'No pending or upcoming leave.' : 'No past requests yet.'}</Text></View>
            )}
          </>
        ) : null}
      </ScrollView>

      <VetLeaveRequestModal
        visible={Boolean(modal)}
        mode={modal?.mode}
        veterinarianId={vetId}
        today={today}
        initialDate={modal?.date}
        schedule={overview}
        onClose={() => setModal(null)}
        onSubmitted={handleSubmitted}
      />
    </VetShell>
  );
}

const styles = StyleSheet.create({
  scrollContent: { paddingHorizontal: 18, paddingTop: 8, paddingBottom: 120 },
  sectionHeaderWrap: { marginBottom: 10, marginTop: 4 },
  sectionTitle: { fontSize: 17, fontWeight: '900', color: '#123a5e' },
  sectionSubtitle: { marginTop: 3, fontSize: 12, fontWeight: '600', color: '#5f7f8a' },
  card: { backgroundColor: '#fcfeff', borderRadius: 22, borderWidth: 1, borderColor: '#dceef8', padding: 14, marginBottom: 18 },
  dayRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#edf4f8' },
  lastRow: { borderBottomWidth: 0 },
  dayDateWrap: { flex: 1, paddingRight: 8 },
  dayLabel: { fontSize: 13.5, fontWeight: '800', color: '#123a5e' },
  dayToday: { color: '#2c6ba3' },
  dayTag: { marginTop: 2, fontSize: 11, fontWeight: '800', color: '#9d6817' },
  dayTagLeave: { color: '#b0392b' },
  dayRight: { alignItems: 'flex-end' },
  bookedText: { marginTop: 3, fontSize: 11, fontWeight: '800', color: '#2c6ba3' },
  dayBadge: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999 },
  dayBadgeOpen: { backgroundColor: '#e5f4ea' },
  dayBadgeClosed: { backgroundColor: '#f2f5f6' },
  dayBadgeText: { fontSize: 11.5, fontWeight: '800' },
  dayBadgeTextOpen: { color: '#2f8f5b' },
  dayBadgeTextClosed: { color: '#7a8d96' },
  badge_work: { backgroundColor: '#e5f4ea' },
  badgeText_work: { color: '#2f8f5b' },
  badge_off: { backgroundColor: '#f2f5f6' },
  badgeText_off: { color: '#7a8d96' },
  badge_leave: { backgroundColor: '#fdecec' },
  badgeText_leave: { color: '#b0392b' },
  badge_short: { backgroundColor: '#fff4e2' },
  badgeText_short: { color: '#9d6817' },
  badge_pending: { backgroundColor: '#fffbef' },
  badgeText_pending: { color: '#9d6817' },
  badge_adjusted: { backgroundColor: '#e8f3fb' },
  badgeText_adjusted: { color: '#1e5a8c' },
  mutedText: { paddingVertical: 10, fontSize: 13, lineHeight: 19, color: '#7a95a7', fontWeight: '600', textAlign: 'center' },
  emptyCard: { backgroundColor: '#fcfeff', borderRadius: 22, borderWidth: 1, borderColor: '#dceef8', padding: 18, alignItems: 'center', marginBottom: 14 },
  emptyText: { marginTop: 10, fontSize: 13, color: '#6a8aa0', fontWeight: '600' },
  errorText: { color: '#a33b3b', fontWeight: '700', textAlign: 'center' },
  retryButton: { marginTop: 12, backgroundColor: '#2c6ba3', paddingHorizontal: 18, paddingVertical: 10, borderRadius: 14 },
  retryText: { color: '#fff', fontWeight: '900' },
  noticeCard: { backgroundColor: '#eaf8ef', borderRadius: 16, padding: 12, marginBottom: 12 },
  noticeText: { color: '#26754a', fontWeight: '700', fontSize: 13, lineHeight: 19 },
  setupCard: { backgroundColor: '#fff8e8', borderRadius: 16, borderWidth: 1, borderColor: '#f1dfb0', padding: 12, marginBottom: 12 },
  setupText: { color: '#865e12', fontWeight: '700', fontSize: 12.5, lineHeight: 18 },
  todayCard: { backgroundColor: '#fcfeff', borderRadius: 24, borderWidth: 1, borderColor: '#dceef8', borderLeftWidth: 6, padding: 16, marginBottom: 18 },
  todayDuty: { borderLeftColor: '#2d9d63' },
  todayLeave: { borderLeftColor: '#c0392b' },
  todayShort: { borderLeftColor: '#d68a1c' },
  todayOff: { borderLeftColor: '#9aabb4' },
  todayEyebrow: { fontSize: 11, fontWeight: '900', color: '#3a7ab8', letterSpacing: 1 },
  todayHeadline: { marginTop: 6, fontSize: 24, fontWeight: '900', color: '#123a5e' },
  todayDetail: { marginTop: 2, fontSize: 13.5, fontWeight: '700', color: '#56707e' },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  metaPill: { overflow: 'hidden', borderRadius: 999, borderWidth: 1, borderColor: '#e1eef4', backgroundColor: '#ffffff', paddingHorizontal: 10, paddingVertical: 5, fontSize: 11.5, fontWeight: '800', color: '#3e6273' },
  actionRow: { flexDirection: 'row', gap: 10, marginTop: 14 },
  primaryButton: { flex: 1, minHeight: 46, borderRadius: 15, backgroundColor: '#2c6ba3', alignItems: 'center', justifyContent: 'center' },
  primaryText: { fontSize: 13, fontWeight: '900', color: '#ffffff' },
  dangerButton: { flex: 1, minHeight: 46, borderRadius: 15, borderWidth: 1, borderColor: '#efb7b0', backgroundColor: '#ffffff', alignItems: 'center', justifyContent: 'center' },
  dangerText: { fontSize: 13, fontWeight: '900', color: '#c0392b' },
  availableButton: { flex: 1, minHeight: 46, borderRadius: 15, borderWidth: 1, borderColor: '#bfe3cc', backgroundColor: '#eef8f2', alignItems: 'center', justifyContent: 'center' },
  availableText: { fontSize: 13, fontWeight: '900', color: '#26754a' },
  buttonDisabled: { opacity: 0.45 },
  blockedText: { marginTop: 8, fontSize: 11.5, fontWeight: '600', color: '#7b909b' },
  requestsHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  toggle: { flexDirection: 'row', backgroundColor: '#eef6fa', borderRadius: 12, padding: 3 },
  toggleItem: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 9 },
  toggleItemActive: { backgroundColor: '#ffffff' },
  toggleText: { fontSize: 12, fontWeight: '800', color: '#4f7384' },
  toggleTextActive: { color: '#123a5e' },
  requestCard: { backgroundColor: '#fcfeff', borderRadius: 20, borderWidth: 1, borderColor: '#dceef8', padding: 14, marginBottom: 12 },
  requestTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  typeBadge: { overflow: 'hidden', borderRadius: 7, paddingHorizontal: 8, paddingVertical: 3, backgroundColor: '#e6f4fb', color: '#2c6ba3', fontSize: 10.5, fontWeight: '900' },
  typeBadgeEmergency: { backgroundColor: '#fdecec', color: '#c0392b' },
  statusPill: { overflow: 'hidden', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, fontSize: 11, fontWeight: '900' },
  pill_amber: { backgroundColor: '#fff4e2', color: '#9d6817' },
  pill_green: { backgroundColor: '#e7f7ed', color: '#26754a' },
  pill_blue: { backgroundColor: '#eaf8fd', color: '#2c6ba3' },
  pill_red: { backgroundColor: '#fdecec', color: '#b34848' },
  pill_muted: { backgroundColor: '#eef2f4', color: '#6a7c85' },
  requestTitle: { marginTop: 8, fontSize: 15.5, fontWeight: '900', color: '#123a5e' },
  requestPeriod: { marginTop: 3, fontSize: 13, fontWeight: '800', color: '#2f5566' },
  requestReason: { marginTop: 5, fontSize: 13, fontStyle: 'italic', color: '#56707e' },
  requestNote: { marginTop: 6, fontSize: 12.5, color: '#4b6571', backgroundColor: '#f3f9fc', borderRadius: 10, padding: 8 },
  requestFoot: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 },
  requestMeta: { flex: 1, fontSize: 11.5, fontWeight: '600', color: '#80949d', paddingRight: 8 },
  cancelLink: { fontSize: 12.5, fontWeight: '900', color: '#c0392b' },
});
