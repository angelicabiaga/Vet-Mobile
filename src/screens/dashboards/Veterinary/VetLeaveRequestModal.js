import React from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Dropdown } from 'react-native-element-dropdown';
import {
  EMERGENCY_TYPES,
  LEAVE_TYPES,
  formatClock,
  formatDayLabel,
  formatHours,
  getLeaveImpact,
  submitLeaveRequest,
} from '../../../api/vetLeaveService';

const REASON_LIMIT = 500;
const pad = (value) => String(value).padStart(2, '0');

function addDays(date, count) {
  const [y, m, d] = date.split('-').map(Number);
  const next = new Date(y, m - 1, d + count);
  return `${next.getFullYear()}-${pad(next.getMonth() + 1)}-${pad(next.getDate())}`;
}

const toMinutes = (time) => {
  const [h, m] = String(time).slice(0, 5).split(':').map(Number);
  return h * 60 + m;
};
const fromMinutes = (minutes) => `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;

function timeOptions(from, to, step) {
  const options = [];
  for (let minutes = toMinutes(from); minutes <= toMinutes(to); minutes += step) {
    const value = fromMinutes(minutes);
    options.push({ value, label: formatClock(value) });
  }
  return options;
}

function dateOptions(first, count) {
  return Array.from({ length: count }, (_, index) => {
    const value = addDays(first, index);
    return { value, label: formatDayLabel(value) };
  });
}

// The vet's hours on a date: the 14-day overview when it covers the date,
// otherwise the weekly roster for that weekday. Null when unknown.
function shiftForDate(schedule, date) {
  if (!schedule || !date) return null;
  const day = (schedule.days || []).find((item) => item.date === date);
  if (day) return day.working ? { start: String(day.start_time).slice(0, 5), end: String(day.end_time).slice(0, 5) } : { off: true };
  const [y, m, d] = date.split('-').map(Number);
  const weekly = (schedule.weekly || []).find((item) => item.day_of_week === new Date(y, m - 1, d).getDay());
  if (!weekly) return null;
  return weekly.is_available ? { start: String(weekly.start_time).slice(0, 5), end: String(weekly.end_time).slice(0, 5) } : { off: true };
}

// Emergency default: now, rounded down to the 10-minute grid, inside today's shift.
function defaultEmergencyTime(shiftStart, shiftEnd) {
  const now = new Date();
  const rounded = Math.floor((now.getHours() * 60 + now.getMinutes()) / 10) * 10;
  const min = toMinutes(shiftStart);
  const max = toMinutes(shiftEnd) - 10;
  return fromMinutes(Math.min(Math.max(rounded, min), max));
}

function Chip({ label, active, disabled, danger, onPress }) {
  return (
    <TouchableOpacity
      style={[styles.chip, active && (danger ? styles.chipActiveDanger : styles.chipActive), disabled && styles.chipDisabled]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.85}
    >
      <Text style={[styles.chipText, active && (danger ? styles.chipTextDanger : styles.chipTextActive)]}>{label}</Text>
    </TouchableOpacity>
  );
}

function ImpactPreview({ impact, loading, error }) {
  if (error) return <View style={[styles.box, styles.boxRed]}><Text style={styles.boxRedText}>{error}</Text></View>;
  if (loading && !impact) {
    return <View style={styles.checking}><ActivityIndicator color="#2c6ba3" /><Text style={styles.checkingText}>Checking your schedule…</Text></View>;
  }
  if (!impact) return null;

  const errors = impact.errors || [];
  const booked = (impact.appointment_count || 0) + (impact.queue_count || 0);
  const days = (impact.days || []).filter((day) => day.effect !== 'none' || day.working);
  const conflicts = [
    ...(impact.appointments || []).map((item) => ({ key: item.id, when: `${formatDayLabel(item.appointment_date)} · ${formatClock(item.start_time)}`, pet: item.pet_name, owner: item.owner_name })),
    ...(impact.queue || []).map((item) => ({ key: item.id, when: `Queue #${item.queue_number} · ${item.status}`, pet: item.pet_name, owner: item.owner_name })),
  ];

  return (
    <View style={[styles.impact, loading && { opacity: 0.6 }]}>
      {errors.length ? (
        <View style={[styles.box, styles.boxRed]}>
          <Text style={styles.boxRedTitle}>This can't be filed yet</Text>
          {errors.map((message) => <Text key={message} style={styles.boxRedText}>• {message}</Text>)}
        </View>
      ) : (
        <View style={styles.summaryRow}>
          <Text style={styles.summaryChip}>{impact.working_days} working day{impact.working_days === 1 ? '' : 's'}</Text>
          <Text style={styles.summaryChip}>{impact.appointment_count} booked</Text>
          {impact.queue_count > 0 ? <Text style={styles.summaryChip}>{impact.queue_count} in queue</Text> : null}
          {(impact.coverage_gaps || []).length ? <Text style={[styles.summaryChip, styles.summaryHot]}>coverage gap</Text> : null}
        </View>
      )}

      {!errors.length && days.map((day) => (
        <View key={day.date} style={styles.dayRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.dayTitle}>{day.date === impact.today ? 'Today' : formatDayLabel(day.date)}</Text>
            <Text style={styles.dayMeta}>{day.working ? `Shift ${formatHours(day.shift_start, day.shift_end)}` : 'Day off'}</Text>
          </View>
          <View style={{ alignItems: 'flex-end', flexShrink: 1 }}>
            <Text style={[styles.dayEffect, day.effect === 'off' && { color: '#b0392b' }, day.effect === 'partial' && { color: '#9d6817' }]}>
              {day.effect === 'off' ? 'Whole shift off' : day.effect === 'partial' ? `Available ${formatHours(day.available_start, day.available_end)}` : 'Not affected'}
            </Text>
            {day.appointments > 0 ? <Text style={styles.dayBooked}>{day.appointments} booked</Text> : null}
          </View>
        </View>
      ))}

      {!errors.length && booked > 0 ? (
        <View style={[styles.box, styles.boxInfo]}>
          <Text style={styles.boxInfoTitle}>You can still {impact.normalized?.request_type === 'Emergency' ? 'apply' : 'send'} this</Text>
          <Text style={styles.boxInfoText}>
            {booked} booked patient{booked === 1 ? '' : 's'} fall inside this leave. Staff will offer them another doctor, and each owner confirms the new doctor and time, reschedules, or cancels. Nothing changes for them until they answer.
          </Text>
        </View>
      ) : null}


      {conflicts.length ? (
        <View style={styles.conflicts}>
          {conflicts.map((item) => (
            <View key={item.key} style={styles.conflictRow}>
              <Text style={styles.conflictWhen}>{item.when}</Text>
              <Text style={styles.conflictPet}>{item.pet || 'Pet'} <Text style={styles.conflictOwner}>· {item.owner || 'Owner'}</Text></Text>
            </View>
          ))}
          <Text style={styles.conflictNote}>Staff offer these patients another doctor; each owner confirms first.</Text>
        </View>
      ) : null}
    </View>
  );
}

export default function VetLeaveRequestModal({ visible, mode = 'Leave', veterinarianId, today, initialDate, schedule, onClose, onSubmitted }) {
  const isEmergency = mode === 'Emergency';
  const tomorrow = today ? addDays(today, 1) : null;
  const todayShift = shiftForDate(schedule, today);
  const shiftStart = todayShift?.start && todayShift.start > '09:00' ? todayShift.start : '09:00';
  const shiftEnd = todayShift?.end || '19:00';

  const [leaveType, setLeaveType] = React.useState(LEAVE_TYPES[0]);
  const [startDate, setStartDate] = React.useState(null);
  const [endDate, setEndDate] = React.useState(null);
  const [duration, setDuration] = React.useState('full');
  const [partialTime, setPartialTime] = React.useState('12:00');
  const [emergencyMode, setEmergencyMode] = React.useState('from');
  const [fromTime, setFromTime] = React.useState('09:00');
  const [reason, setReason] = React.useState('');
  const [reasonMissing, setReasonMissing] = React.useState(false);
  const scrollRef = React.useRef(null);
  const reasonRef = React.useRef(null);
  const reasonY = React.useRef(0);
  const [impact, setImpact] = React.useState(null);
  const [checking, setChecking] = React.useState(false);
  const [checkError, setCheckError] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [submitError, setSubmitError] = React.useState('');
  const sequence = React.useRef(0);

  // Fresh form every time it opens.
  React.useEffect(() => {
    if (!visible || !today) return;
    const first = initialDate && initialDate > today ? initialDate : addDays(today, 1);
    setLeaveType(isEmergency ? EMERGENCY_TYPES[0] : LEAVE_TYPES[0]);
    setStartDate(first);
    setEndDate(first);
    setDuration('full');
    setPartialTime('');
    setEmergencyMode('from');
    setFromTime(defaultEmergencyTime(shiftStart, shiftEnd));
    setReason('');
    setImpact(null);
    setSubmitError('');
    setSaving(false);
  }, [visible, isEmergency, initialDate, today, shiftStart, shiftEnd]);

  const singleDay = Boolean(startDate) && startDate === endDate;

  const payload = React.useMemo(() => {
    if (isEmergency) {
      const whole = emergencyMode === 'whole';
      return { requestType: 'Emergency', startDate: today, endDate: today, isFullDay: whole, startTime: whole ? null : fromTime, endTime: null };
    }
    const partial = singleDay && duration !== 'full';
    return {
      requestType: 'Leave',
      startDate,
      endDate,
      isFullDay: !partial,
      startTime: partial ? (duration === 'late' ? '09:00' : partialTime) : null,
      endTime: partial ? (duration === 'late' ? partialTime : '19:00') : null,
    };
  }, [isEmergency, emergencyMode, fromTime, today, singleDay, duration, partialTime, startDate, endDate]);

  React.useEffect(() => {
    if (!visible || !veterinarianId || !today || (!isEmergency && !startDate)) return undefined;
    const current = ++sequence.current;
    setChecking(true);
    setCheckError('');
    const timer = setTimeout(async () => {
      try {
        const result = await getLeaveImpact({ veterinarianId, ...payload });
        if (current === sequence.current) setImpact(result);
      } catch (error) {
        if (current === sequence.current) {
          setImpact(null);
          setCheckError(error.message);
        }
      } finally {
        if (current === sequence.current) setChecking(false);
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [visible, veterinarianId, today, isEmergency, startDate, payload]);

  // The chosen type is the reason; only "Other" asks for one in words
  // (matches the web app). The button stays tappable and points to the box.
  const needsReason = leaveType === 'Other';
  const hasReason = !needsReason || reason.trim().length > 0;
  const canSubmit = !saving && !checking && impact?.ok;

  const submit = async () => {
    if (!canSubmit) return;
    if (!hasReason) {
      setReasonMissing(true);
      scrollRef.current?.scrollTo({ y: Math.max(reasonY.current - 24, 0), animated: true });
      reasonRef.current?.focus();
      return;
    }
    try {
      setSaving(true);
      setSubmitError('');
      const result = await submitLeaveRequest({ veterinarianId, leaveType, reason: needsReason ? reason.trim() : leaveType, ...payload });
      onSubmitted?.(result);
    } catch (error) {
      setSubmitError(error.message);
      setSaving(false);
    }
  };

  const firstDayOptions = tomorrow ? dateOptions(tomorrow, 90) : [];
  const lastDayOptions = startDate ? dateOptions(startDate, 31) : [];
  // Part-day choices stay inside that day's shift (e.g. 9:30 AM-4:30 PM for
  // a 9-5 shift); clinic hours when the shift isn't known.
  const dayShift = shiftForDate(schedule, startDate);
  const partialFrom = dayShift?.start ? fromMinutes(toMinutes(dayShift.start) + 30) : '09:30';
  const partialTo = dayShift?.end ? fromMinutes(toMinutes(dayShift.end) - 30) : '18:30';
  const partialOptions = React.useMemo(() => timeOptions(partialFrom, partialTo, 30), [partialFrom, partialTo]);
  const emergencyOptions = timeOptions(shiftStart, fromMinutes(toMinutes(shiftEnd) - 10), 10);

  React.useEffect(() => {
    if (partialOptions.length && !partialOptions.some((option) => option.value === partialTime)) {
      setPartialTime(partialOptions[Math.floor(partialOptions.length / 2)].value);
    }
  }, [partialOptions, partialTime]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={() => !saving && onClose()}>
      <KeyboardAvoidingView style={styles.overlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => !saving && onClose()} accessibilityLabel="Close" />
        <View style={styles.sheet}>
          <View style={styles.sheetHeader}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.title, isEmergency && { color: '#b0392b' }]}>{isEmergency ? 'Emergency Leave (Today)' : 'Request Leave'}</Text>
              <Text style={styles.subtitle}>
                {isEmergency
                  ? 'Takes effect as soon as you submit. New bookings stop right away, and staff offer your booked patients another doctor (each owner confirms).'
                  : 'File at least one day ahead. Your schedule changes only after staff or an administrator approves it.'}
              </Text>
            </View>
            <TouchableOpacity style={styles.closeButton} onPress={onClose} disabled={saving}><Text style={styles.closeText}>×</Text></TouchableOpacity>
          </View>

          <ScrollView ref={scrollRef} contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
            <Text style={styles.label}>{isEmergency ? 'What happened?' : 'Leave type'}</Text>
            <View style={styles.chipRow}>
              {(isEmergency ? EMERGENCY_TYPES : LEAVE_TYPES).map((type) => (
                <Chip key={type} label={type} active={leaveType === type} danger={isEmergency} onPress={() => { setLeaveType(type); setReasonMissing(false); }} />
              ))}
            </View>

            {needsReason ? (
              <>
                <Text style={styles.label} onLayout={(event) => { reasonY.current = event.nativeEvent.layout.y; }}>
                  Please describe <Text style={styles.required}>(required)</Text>
                </Text>
                <TextInput
                  ref={reasonRef}
                  style={[styles.reason, reasonMissing && !hasReason && styles.reasonInvalid]}
                  multiline
                  maxLength={REASON_LIMIT}
                  value={reason}
                  onChangeText={setReason}
                  placeholder={isEmergency ? 'A short note for staff' : 'e.g. Wedding, moving house'}
                  placeholderTextColor="#8aa2b4"
                />
                {reasonMissing && !hasReason ? <Text style={styles.reasonError}>Describe what happened so staff can plan coverage.</Text> : null}
                <Text style={styles.counter}>{reason.length}/{REASON_LIMIT}</Text>
              </>
            ) : null}

            {isEmergency ? (
              <>
                <Text style={styles.label}>When are you unavailable?</Text>
                <View style={styles.chipRow}>
                  <Chip label="Leaving from a time" active={emergencyMode === 'from'} danger onPress={() => setEmergencyMode('from')} />
                  <Chip label="Can't work today" active={emergencyMode === 'whole'} danger onPress={() => setEmergencyMode('whole')} />
                </View>
                {emergencyMode === 'from' ? (
                  <Dropdown
                    style={styles.dropdown}
                    data={emergencyOptions}
                    labelField="label"
                    valueField="value"
                    value={fromTime}
                    placeholder="Select time"
                    onChange={(item) => setFromTime(item.value)}
                  />
                ) : null}
                {emergencyMode === 'from' ? <Text style={styles.hint}>Until the end of your shift ({formatClock(shiftEnd)}).</Text> : null}
              </>
            ) : (
              <>
                <Text style={styles.label}>First day</Text>
                <Dropdown
                  style={styles.dropdown}
                  data={firstDayOptions}
                  labelField="label"
                  valueField="value"
                  value={startDate}
                  placeholder="Select date"
                  onChange={(item) => {
                    const keepsEnd = endDate && endDate >= item.value && endDate <= addDays(item.value, 30);
                    const nextEnd = keepsEnd ? endDate : item.value;
                    setStartDate(item.value);
                    setEndDate(nextEnd);
                    if (nextEnd !== item.value) setDuration('full');
                  }}
                />
                <Text style={styles.label}>Last day</Text>
                <Dropdown
                  style={styles.dropdown}
                  data={lastDayOptions}
                  labelField="label"
                  valueField="value"
                  value={endDate}
                  placeholder="Select date"
                  onChange={(item) => {
                    setEndDate(item.value);
                    if (item.value !== startDate) setDuration('full');
                  }}
                />
                <Text style={styles.label}>Duration</Text>
                <View style={styles.chipRow}>
                  <Chip label={singleDay ? 'Whole day' : 'Whole days'} active={duration === 'full'} onPress={() => setDuration('full')} />
                  <Chip label="Arrive late" active={duration === 'late'} disabled={!singleDay} onPress={() => setDuration('late')} />
                  <Chip label="Leave early" active={duration === 'early'} disabled={!singleDay} onPress={() => setDuration('early')} />
                </View>
                {duration !== 'full' ? (
                  <>
                    <Text style={styles.hint}>{duration === 'late' ? 'You will start at:' : 'You will leave at:'}</Text>
                    <Dropdown
                      style={styles.dropdown}
                      data={partialOptions}
                      labelField="label"
                      valueField="value"
                      value={partialTime}
                      placeholder="Select time"
                      onChange={(item) => setPartialTime(item.value)}
                    />
                  </>
                ) : null}
                {!singleDay ? <Text style={styles.hint}>Part-day leave is only for a single date.</Text> : null}
                {singleDay && dayShift?.start ? <Text style={styles.hint}>Your shift that day: {formatHours(dayShift.start, dayShift.end)}</Text> : null}
                {singleDay && dayShift?.off ? <Text style={styles.hint}>You're not scheduled that day.</Text> : null}
              </>
            )}

            <Text style={styles.sectionTitle}>Impact on your schedule</Text>
            <ImpactPreview impact={impact} loading={checking} error={checkError} />
          </ScrollView>

          <View style={styles.footer}>
            {submitError ? <Text style={styles.submitError}>{submitError}</Text> : null}
            {canSubmit && !hasReason ? <Text style={styles.footerHint}>Describe what happened above to continue.</Text> : null}
            <View style={styles.footerButtons}>
              <TouchableOpacity style={styles.secondaryButton} onPress={onClose} disabled={saving} activeOpacity={0.9}>
                <Text style={styles.secondaryText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.primaryButton, isEmergency && styles.primaryDanger, !canSubmit && styles.buttonDisabled]}
                onPress={submit}
                disabled={!canSubmit}
                activeOpacity={0.9}
              >
                <Text style={styles.primaryText}>{saving ? 'Submitting…' : isEmergency ? 'Apply now' : 'Send for approval'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(8,32,48,0.45)' },
  sheet: { maxHeight: '92%', backgroundColor: '#ffffff', borderTopLeftRadius: 26, borderTopRightRadius: 26, overflow: 'hidden' },
  sheetHeader: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 20, paddingTop: 20, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: '#edf4f8' },
  title: { fontSize: 19, fontWeight: '900', color: '#123a5e' },
  subtitle: { marginTop: 5, fontSize: 12.5, lineHeight: 18, fontWeight: '600', color: '#5f7f8a' },
  closeButton: { width: 34, height: 34, borderRadius: 12, backgroundColor: '#edf4f8', alignItems: 'center', justifyContent: 'center', marginLeft: 10 },
  closeText: { fontSize: 22, lineHeight: 24, color: '#456472', fontWeight: '700' },
  body: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 18 },
  label: { marginTop: 14, marginBottom: 8, fontSize: 12, fontWeight: '900', color: '#55798b', textTransform: 'uppercase' },
  hint: { marginTop: 6, fontSize: 12, fontWeight: '600', color: '#7a95a7' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 13, paddingVertical: 9, borderRadius: 999, borderWidth: 1, borderColor: '#d7e8f0', backgroundColor: '#f7fbfd' },
  chipActive: { borderColor: '#2c6ba3', backgroundColor: '#e8f3fb' },
  chipActiveDanger: { borderColor: '#d9776c', backgroundColor: '#fdf0ee' },
  chipDisabled: { opacity: 0.45 },
  chipText: { fontSize: 12.5, fontWeight: '800', color: '#4f7384' },
  chipTextActive: { color: '#1e5a8c' },
  chipTextDanger: { color: '#b0392b' },
  dropdown: { minHeight: 48, borderRadius: 14, borderWidth: 1, borderColor: '#d7e8f0', backgroundColor: '#fbfeff', paddingHorizontal: 12 },
  reason: { minHeight: 84, borderRadius: 14, borderWidth: 1, borderColor: '#d7e8f0', backgroundColor: '#fbfeff', padding: 12, fontSize: 14, color: '#123a5e', textAlignVertical: 'top' },
  reasonInvalid: { borderColor: '#e08a80', backgroundColor: '#fffafa' },
  reasonError: { color: '#c0392b', fontSize: 12.5, fontWeight: '700', marginTop: 6 },
  required: { color: '#8aa0ab', fontWeight: '600' },
  footerHint: { color: '#9d6817', fontSize: 13, fontWeight: '700', marginBottom: 8 },
  counter: { alignSelf: 'flex-end', marginTop: 4, fontSize: 11, color: '#8aa0ab', fontWeight: '700' },
  sectionTitle: { marginTop: 16, marginBottom: 8, fontSize: 15, fontWeight: '900', color: '#123a5e' },
  impact: { gap: 8 },
  checking: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 14, backgroundColor: '#f4fbfd' },
  checkingText: { color: '#4b6571', fontWeight: '700' },
  box: { borderRadius: 14, padding: 12, gap: 4 },
  boxRed: { backgroundColor: '#fff1f1', borderWidth: 1, borderColor: '#f4cccc' },
  boxRedTitle: { fontWeight: '900', color: '#a33f3f' },
  boxRedText: { color: '#a33f3f', fontSize: 12.5, lineHeight: 18, fontWeight: '600' },
  boxAmber: { backgroundColor: '#fff8e8', borderWidth: 1, borderColor: '#f1dfb0' },
  boxAmberTitle: { fontWeight: '900', color: '#865e12' },
  boxAmberText: { color: '#865e12', fontSize: 12.5, lineHeight: 18, fontWeight: '600' },
  boxInfo: { backgroundColor: '#eef8fc', borderWidth: 1, borderColor: '#cfe7f2' },
  boxInfoTitle: { fontWeight: '900', color: '#2c5f78' },
  boxInfoText: { color: '#2c5f78', fontSize: 12.5, lineHeight: 18, fontWeight: '600' },
  summaryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  summaryChip: { overflow: 'hidden', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5, backgroundColor: '#eef8fc', color: '#2d6f8f', fontSize: 11.5, fontWeight: '800' },
  summaryHot: { backgroundColor: '#fff1e6', color: '#a4561b' },
  dayRow: { flexDirection: 'row', gap: 10, alignItems: 'center', borderRadius: 12, borderWidth: 1, borderColor: '#e5f0f5', backgroundColor: '#f7fbfd', padding: 10 },
  dayTitle: { fontSize: 13, fontWeight: '900', color: '#123a5e' },
  dayMeta: { marginTop: 2, fontSize: 11.5, fontWeight: '600', color: '#6f8591' },
  dayEffect: { fontSize: 12, fontWeight: '800', color: '#2d6f8f', textAlign: 'right' },
  dayBooked: { marginTop: 2, fontSize: 11, fontWeight: '800', color: '#a4561b' },
  conflicts: { gap: 6 },
  conflictRow: { borderRadius: 12, borderWidth: 1, borderColor: '#e8f1f5', backgroundColor: '#fbfdfe', padding: 10 },
  conflictWhen: { fontSize: 11.5, fontWeight: '800', color: '#52707d' },
  conflictPet: { marginTop: 2, fontSize: 13, fontWeight: '900', color: '#123a5e' },
  conflictOwner: { fontWeight: '600', color: '#6f8591' },
  conflictNote: { fontSize: 11.5, fontWeight: '600', color: '#6f8591' },
  footer: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 20, borderTopWidth: 1, borderTopColor: '#edf4f8', backgroundColor: '#fbfdfe' },
  submitError: { marginBottom: 10, color: '#a33f3f', fontWeight: '700', fontSize: 12.5 },
  footerButtons: { flexDirection: 'row', gap: 10 },
  secondaryButton: { flex: 1, minHeight: 48, borderRadius: 16, backgroundColor: '#edf4f8', alignItems: 'center', justifyContent: 'center' },
  secondaryText: { fontSize: 13.5, fontWeight: '900', color: '#24566d' },
  primaryButton: { flex: 1.4, minHeight: 48, borderRadius: 16, backgroundColor: '#2c6ba3', alignItems: 'center', justifyContent: 'center' },
  primaryDanger: { backgroundColor: '#c0392b' },
  primaryText: { fontSize: 13.5, fontWeight: '900', color: '#ffffff' },
  buttonDisabled: { opacity: 0.5 },
});
