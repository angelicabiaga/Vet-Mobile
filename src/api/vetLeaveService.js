import { supabase } from '../config/supabaseClient';

// Veterinarian leave & emergency requests. The rules (file one day ahead,
// emergency = today only, overlaps, partial-day shapes, conflicts,
// coverage) live in the Supabase functions from the web project's
// supabase/VET_LEAVE_REQUESTS.sql, so mobile and web always agree.

export const LEAVE_TYPES = ['Vacation Leave', 'Sick Leave', 'Personal Leave', 'Training / Seminar', 'Other'];
export const EMERGENCY_TYPES = ['Sudden Illness', 'Family Emergency', 'Personal Emergency', 'Other'];

const SETUP_MESSAGE = 'Leave requests are not set up yet. Ask the clinic admin to run VET_LEAVE_REQUESTS.sql in Supabase.';

function isSetupMissing(error) {
  const text = [error?.message, error?.details, error?.hint].filter(Boolean).join(' ').toLowerCase();
  return ['PGRST202', 'PGRST205', '42883', '42P01'].includes(error?.code) ||
    text.includes('could not find the function') ||
    text.includes('veterinarian_leave_requests');
}

function toError(error, fallback) {
  if (isSetupMissing(error)) {
    const setupError = new Error(SETUP_MESSAGE);
    setupError.setupMissing = true;
    return setupError;
  }
  return new Error(error?.message || fallback);
}

const timeOrNull = (value) => (value ? String(value).slice(0, 5) : null);

// startDate (optional) loads any week, past weeks included; needs the web
// project's supabase/VET_SCHEDULE_CALENDAR.sql.
export async function getScheduleOverview(veterinarianId, days = 14, startDate = null) {
  const { data, error } = await supabase.rpc('get_vet_schedule_overview', {
    p_veterinarian_id: veterinarianId,
    p_days: days,
    ...(startDate ? { p_start_date: startDate } : {}),
  });
  if (error) throw toError(error, 'Unable to load your schedule.');
  return data;
}

export async function getMyLeaveRequests(veterinarianId) {
  if (!veterinarianId) return [];
  const { data, error } = await supabase
    .from('veterinarian_leave_requests')
    .select('*, reviewer:profiles!veterinarian_leave_requests_reviewed_by_fkey(id, full_name)')
    .eq('veterinarian_id', veterinarianId)
    .order('created_at', { ascending: false })
    .limit(60);
  if (error) throw toError(error, 'Unable to load your leave requests.');
  return data || [];
}

export async function getLeaveImpact({ veterinarianId, requestType, startDate, endDate, isFullDay = true, startTime, endTime }) {
  const { data, error } = await supabase.rpc('get_vet_leave_impact', {
    p_veterinarian_id: veterinarianId,
    p_request_type: requestType,
    p_start_date: startDate || null,
    p_end_date: endDate || null,
    p_is_full_day: isFullDay,
    p_start_time: timeOrNull(startTime),
    p_end_time: timeOrNull(endTime),
    p_exclude_request_id: null,
  });
  if (error) throw toError(error, 'Unable to check this leave against your schedule.');
  return data;
}

export async function submitLeaveRequest({ veterinarianId, requestType, leaveType, startDate, endDate, isFullDay = true, startTime, endTime, reason }) {
  const { data, error } = await supabase.rpc('submit_vet_leave_request', {
    p_veterinarian_id: veterinarianId,
    p_request_type: requestType,
    p_leave_type: leaveType,
    p_start_date: startDate || null,
    p_end_date: endDate || null,
    p_is_full_day: isFullDay,
    p_start_time: timeOrNull(startTime),
    p_end_time: timeOrNull(endTime),
    p_reason: reason,
  });
  if (error) throw toError(error, 'Unable to file this request.');
  return data;
}

export async function cancelLeaveRequest(requestId, veterinarianId) {
  const { data, error } = await supabase.rpc('cancel_vet_leave_request', {
    p_request_id: requestId,
    p_veterinarian_id: veterinarianId,
    p_note: null,
  });
  if (error) throw toError(error, 'Unable to cancel this request.');
  return data?.request;
}

// Everything that changes this vet's schedule screen: their leave requests,
// date overrides (approvals/revokes), bookings and queue.
export function subscribeToVetSchedule(veterinarianId, callback) {
  if (!veterinarianId) return () => {};
  const filter = `veterinarian_id=eq.${veterinarianId}`;
  const channel = supabase
    .channel(`mobile-vet-schedule-${veterinarianId}-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'veterinarian_leave_requests', filter }, () => callback?.())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'veterinarian_schedule_overrides', filter }, () => callback?.())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'appointments', filter }, () => callback?.())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'queue_entries', filter }, () => callback?.())
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}

// Display helpers shared by VetSchedule and VetLeaveRequestModal.

export function formatDayLabel(date) {
  if (!date) return '—';
  const [y, m, d] = String(date).slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

export function formatClock(time) {
  if (!time) return '—';
  const [hour, minute] = String(time).slice(0, 5).split(':').map(Number);
  const period = hour >= 12 ? 'PM' : 'AM';
  return `${hour % 12 || 12}:${String(minute).padStart(2, '0')} ${period}`;
}

export const formatHours = (start, end) => (start && end ? `${formatClock(start)} – ${formatClock(end)}` : '—');

export function formatLeavePeriod(request, today) {
  if (!request) return '—';
  const sameDay = request.start_date === request.end_date;
  const dateText = sameDay
    ? (request.start_date === today ? 'Today' : formatDayLabel(request.start_date))
    : `${formatDayLabel(request.start_date)} – ${formatDayLabel(request.end_date)}`;
  if (request.is_full_day) return sameDay ? `${dateText} · whole day` : dateText;
  const start = String(request.start_time || '').slice(0, 5);
  const end = String(request.end_time || '').slice(0, 5);
  if (request.request_type === 'Emergency') return `${dateText} from ${formatClock(start)}`;
  if (start <= '09:00') return `${dateText} · arriving at ${formatClock(end)}`;
  if (end >= '19:00') return `${dateText} · leaving at ${formatClock(start)}`;
  return `${dateText} · ${formatHours(start, end)}`;
}

export function leaveStatusMeta(request, today) {
  if (request.status === 'Pending') return { label: 'Pending review', tone: 'amber' };
  if (request.status === 'Rejected') return { label: 'Declined', tone: 'red' };
  if (request.status === 'Cancelled') {
    return request.cancelled_by && request.cancelled_by !== request.veterinarian_id
      ? { label: 'Revoked', tone: 'muted' }
      : { label: 'Withdrawn', tone: 'muted' };
  }
  if (request.end_date < today) return { label: 'Completed', tone: 'muted' };
  if (request.request_type === 'Emergency' && !request.acknowledged_at) return { label: 'Active · awaiting staff', tone: 'red' };
  if (request.start_date <= today) return { label: 'On leave now', tone: 'blue' };
  return { label: 'Approved', tone: 'green' };
}
