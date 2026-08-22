import { supabase } from '../config/supabaseClient';
import { createNotification } from './notificationService';

export const APPOINTMENT_STATUSES = ['Confirmed', 'Completed', 'Cancelled'];
const ACTIVE_STATUSES = ['Confirmed'];
const CLINIC_OPEN_TIME = '09:00';
const CLINIC_CLOSE_TIME = '19:00';
const pad = (value) => String(value).padStart(2, '0');
const normalizeTime = (value) => String(value || '').slice(0, 5);

export const todayLocal = () => {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};

export const addTenMinutes = (value) => {
  const [hour, minute] = normalizeTime(value).split(':').map(Number);
  const date = new Date(2000, 0, 1, hour, minute + 10);
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

export const formatTime = (value) => {
  if (!value) return '—';
  const [hour, minute] = normalizeTime(value).split(':').map(Number);
  const date = new Date(2000, 0, 1, hour, minute);
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
};

const formatFullDate = (value) => {
  if (!value) return '—';
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString([], { month: 'long', day: 'numeric', year: 'numeric' });
};

export async function getPetsByOwner(ownerId) {
  if (!ownerId) return [];
  const { data, error } = await supabase
    .from('pets')
    .select('id, pet_name, species, breed, owner_id')
    .eq('owner_id', ownerId)
    .eq('is_archived', false)
    .order('pet_name');
  if (error) throw new Error('Unable to load your registered pets.');
  return data || [];
}

export async function getVeterinarians() {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, email, role, account_status')
    .order('full_name');
  if (error) throw new Error('Unable to load veterinarians.');
  return (data || []).filter((item) =>
    String(item.role || '').toLowerCase() === 'veterinarian' &&
    String(item.account_status || '').toLowerCase() === 'active'
  );
}

export async function getAvailableSlots(veterinarianId, appointmentDate, excludeAppointmentId = null) {
  if (!veterinarianId || !appointmentDate || appointmentDate < todayLocal()) return [];
  const dayOfWeek = new Date(`${appointmentDate}T12:00:00`).getDay();

  const { data: override, error: overrideError } = await supabase
    .from('veterinarian_schedule_overrides')
    .select('start_time, end_time, is_available')
    .eq('veterinarian_id', veterinarianId)
    .eq('schedule_date', appointmentDate)
    .maybeSingle();

  const overrideMissing = ['42P01', 'PGRST205'].includes(overrideError?.code) ||
    String(overrideError?.message || '').toLowerCase().includes('veterinarian_schedule_overrides');
  if (overrideError && !overrideMissing) throw new Error('Unable to load the selected date schedule.');

  let schedule = overrideMissing ? null : override;
  if (!schedule) {
    const { data: weekly, error: scheduleError } = await supabase
      .from('veterinarian_schedules')
      .select('start_time, end_time, is_available')
      .eq('veterinarian_id', veterinarianId)
      .eq('day_of_week', dayOfWeek)
      .maybeSingle();
    if (scheduleError) throw new Error('Unable to load the veterinarian schedule.');
    schedule = weekly;
  }

  if (!schedule?.is_available || !schedule.start_time || !schedule.end_time) return [];

  let bookedQuery = supabase
    .from('appointments')
    .select('id, start_time')
    .eq('veterinarian_id', veterinarianId)
    .eq('appointment_date', appointmentDate)
    .in('status', ACTIVE_STATUSES);
  if (excludeAppointmentId) bookedQuery = bookedQuery.neq('id', excludeAppointmentId);

  const { data: booked, error: bookedError } = await bookedQuery;
  if (bookedError) throw new Error('Unable to load booked appointment times.');

  const bookedTimes = new Set((booked || []).map((item) => normalizeTime(item.start_time)));
  const slots = [];
  let current = normalizeTime(schedule.start_time);
  if (current < CLINIC_OPEN_TIME) current = CLINIC_OPEN_TIME;

  // Web and mobile share the same clinic booking window.
  // The final 10-minute slot starts at 6:50 PM and ends at 7:00 PM.
  const end = CLINIC_CLOSE_TIME;
  while (current < end) {
    if (!bookedTimes.has(current)) slots.push(current);
    current = addTenMinutes(current);
  }
  return slots;
}

const isMissingTableError = (error, tableName) =>
  ['42P01', 'PGRST205'].includes(error?.code) ||
  String(error?.message || '').toLowerCase().includes(tableName);

// Read-only view of a veterinarian's own weekly availability, for the
// Schedule nav item. Reuses the exact table getAvailableSlots already reads
// when building the pet-owner booking calendar -- no new schema.
export async function getVeterinarianWeeklySchedule(veterinarianId) {
  if (!veterinarianId) return [];
  const { data, error } = await supabase
    .from('veterinarian_schedules')
    .select('day_of_week, start_time, end_time, is_available')
    .eq('veterinarian_id', veterinarianId)
    .order('day_of_week', { ascending: true });

  if (error) {
    if (isMissingTableError(error, 'veterinarian_schedules')) return [];
    throw new Error('Unable to load your weekly schedule.');
  }
  return data || [];
}

// Date-specific availability overrides (day off, extended hours, etc.),
// upcoming only.
export async function getVeterinarianScheduleOverrides(veterinarianId) {
  if (!veterinarianId) return [];
  const { data, error } = await supabase
    .from('veterinarian_schedule_overrides')
    .select('schedule_date, start_time, end_time, is_available')
    .eq('veterinarian_id', veterinarianId)
    .gte('schedule_date', todayLocal())
    .order('schedule_date', { ascending: true });

  if (error) {
    if (isMissingTableError(error, 'veterinarian_schedule_overrides')) return [];
    throw new Error('Unable to load your schedule overrides.');
  }
  return data || [];
}

function validatePayload(payload) {
  if (!payload.petId) throw new Error('Select a pet.');
  if (!payload.ownerId) throw new Error('Pet owner is missing.');
  if (!payload.veterinarianId) throw new Error('Select a veterinarian.');
  if (!payload.appointmentDate || payload.appointmentDate < todayLocal()) throw new Error('Select today or a future date.');
  if (!payload.startTime) throw new Error('Select an available time.');
}

export async function createAppointment(payload) {
  validatePayload(payload);

  const latestSlots = await getAvailableSlots(
    payload.veterinarianId,
    payload.appointmentDate
  );
  if (!latestSlots.includes(normalizeTime(payload.startTime))) {
    throw new Error('That appointment time is no longer available. Please select another available time.');
  }

  const row = {
    pet_id: payload.petId,
    owner_id: payload.ownerId,
    veterinarian_id: payload.veterinarianId,
    appointment_date: payload.appointmentDate,
    start_time: normalizeTime(payload.startTime),
    end_time: addTenMinutes(payload.startTime),
    appointment_source: payload.appointmentSource || 'Online',
    consultation_type: 'General Consultation',
    visit_reason: payload.visitReason?.trim() || null,
    notes: payload.notes?.trim() || null,
    status: 'Confirmed',
    created_by: payload.createdBy || payload.ownerId,
  };

  const { data, error } = await supabase.from('appointments').insert(row).select('*').single();
  if (error) {
    const message = String(error.message || '').toLowerCase();
    if (
      error.code === '23505' ||
      message.includes('already booked') ||
      message.includes('duplicate')
    ) {
      throw new Error('That appointment time was just booked. Please select another available time.');
    }
    throw new Error(error.message || 'Unable to book the appointment.');
  }

  const selfBooked = (payload.createdBy || payload.ownerId) === payload.ownerId;
  createNotification({
    recipientId: payload.ownerId,
    type: 'Appointment',
    title: selfBooked ? 'Appointment Confirmed' : 'Appointment Booked For You',
    message: selfBooked
      ? `Your appointment on ${formatFullDate(payload.appointmentDate)} at ${formatTime(payload.startTime)} is confirmed.`
      : `Our staff booked an appointment for you on ${formatFullDate(payload.appointmentDate)} at ${formatTime(payload.startTime)}.`,
    relatedModule: 'Appointments',
    relatedRecord: data.id,
    createdBy: payload.createdBy || payload.ownerId,
  }).catch(() => {});

  return data;
}

export async function getOwnerAppointments(ownerId) {
  if (!ownerId) return [];
  const { data, error } = await supabase
    .from('appointments')
    .select(`
      id, pet_id, owner_id, veterinarian_id, appointment_date, start_time, end_time,
      appointment_source, consultation_type, visit_reason, notes, status, created_by,
      created_at, updated_at,
      pet:pets(id, pet_name, species, breed),
      owner:profiles!appointments_owner_id_fkey(id, full_name, email, username),
      veterinarian:profiles!appointments_veterinarian_id_fkey(id, full_name)
    `)
    .eq('owner_id', ownerId)
    .order('appointment_date', { ascending: false })
    .order('start_time', { ascending: true });
  if (error) throw new Error('Unable to load your appointments.');

  const rows = data || [];
  const creatorIds = [...new Set(rows.map((item) => item.created_by).filter(Boolean))];
  let creators = {};
  if (creatorIds.length) {
    const { data: creatorRows } = await supabase.from('profiles').select('id, full_name, username').in('id', creatorIds);
    creators = Object.fromEntries((creatorRows || []).map((item) => [String(item.id), item]));
  }
  return rows.map((item) => ({ ...item, creator: creators[String(item.created_by)] || null }));
}

export async function cancelAppointment(id, ownerId) {
  const { error } = await supabase
    .from('appointments')
    .update({ status: 'Cancelled' })
    .eq('id', id)
    .eq('owner_id', ownerId)
    .eq('status', 'Confirmed');
  if (error) throw new Error('Unable to cancel the appointment.');
}

export async function rescheduleAppointment(id, values, ownerId, changedBy) {
  validatePayload({ ...values, ownerId });

  const latestSlots = await getAvailableSlots(
    values.veterinarianId,
    values.appointmentDate,
    id
  );
  if (!latestSlots.includes(normalizeTime(values.startTime))) {
    throw new Error('That appointment time is no longer available. Please select another available time.');
  }

  const { error } = await supabase
    .from('appointments')
    .update({
      veterinarian_id: values.veterinarianId,
      appointment_date: values.appointmentDate,
      start_time: normalizeTime(values.startTime),
      end_time: addTenMinutes(values.startTime),
      status: 'Confirmed',
      created_by: changedBy || ownerId,
    })
    .eq('id', id)
    .eq('owner_id', ownerId)
    .eq('status', 'Confirmed');
  if (error) {
    const message = String(error.message || '').toLowerCase();
    if (
      error.code === '23505' ||
      message.includes('already booked') ||
      message.includes('duplicate')
    ) {
      throw new Error('That time is already booked. Please select another slot.');
    }
    throw new Error('Unable to reschedule the appointment.');
  }

  createNotification({
    recipientId: ownerId,
    type: 'Appointment',
    title: 'Appointment Rescheduled',
    message: `Your appointment was moved to ${formatFullDate(values.appointmentDate)} at ${formatTime(values.startTime)}.`,
    relatedModule: 'Appointments',
    relatedRecord: id,
    createdBy: changedBy || ownerId,
  }).catch(() => {});
}

export async function getVeterinarianAppointments(veterinarianId) {
  if (!veterinarianId) return [];
  const { data, error } = await supabase
    .from('appointments')
    .select(`
      id, pet_id, owner_id, veterinarian_id, appointment_date, start_time, end_time,
      appointment_source, consultation_type, visit_reason, notes, status, created_by,
      created_at, updated_at,
      pet:pets(id, pet_name, species, breed),
      owner:profiles!appointments_owner_id_fkey(id, full_name, email, username),
      veterinarian:profiles!appointments_veterinarian_id_fkey(id, full_name)
    `)
    .eq('veterinarian_id', veterinarianId)
    .order('appointment_date', { ascending: false })
    .order('start_time', { ascending: true });
  if (error) throw new Error('Unable to load assigned appointments.');

  const rows = data || [];
  const creatorIds = [...new Set(rows.map((item) => item.created_by).filter(Boolean))];
  let creators = {};
  if (creatorIds.length) {
    const { data: creatorRows } = await supabase.from('profiles').select('id, full_name, username').in('id', creatorIds);
    creators = Object.fromEntries((creatorRows || []).map((item) => [String(item.id), item]));
  }
  return rows.map((item) => ({ ...item, creator: creators[String(item.created_by)] || null }));
}

const APPOINTMENT_SELECT = `
  id, pet_id, owner_id, veterinarian_id, appointment_date, start_time, end_time,
  appointment_source, consultation_type, visit_reason, notes, status, created_by,
  created_at, updated_at,
  pet:pets(id, pet_name, species, breed),
  owner:profiles!appointments_owner_id_fkey(id, full_name, email, username),
  veterinarian:profiles!appointments_veterinarian_id_fkey(id, full_name)
`;

async function hydrateCreators(rows) {
  const creatorIds = [...new Set(rows.map((item) => item.created_by).filter(Boolean))];
  let creators = {};
  if (creatorIds.length) {
    const { data: creatorRows } = await supabase.from('profiles').select('id, full_name, username').in('id', creatorIds);
    creators = Object.fromEntries((creatorRows || []).map((item) => [String(item.id), item]));
  }
  return rows.map((item) => ({ ...item, creator: creators[String(item.created_by)] || null }));
}

export async function getAllAppointments() {
  const { data, error } = await supabase
    .from('appointments')
    .select(APPOINTMENT_SELECT)
    .order('appointment_date', { ascending: false })
    .order('start_time', { ascending: true });
  if (error) throw new Error('Unable to load appointments.');
  return hydrateCreators(data || []);
}

export async function getActivePetOwners() {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, email, username, role, account_status')
    .order('full_name');
  if (error) throw new Error('Unable to load pet owners.');
  return (data || []).filter((item) =>
    String(item.role || '').toLowerCase() === 'pet_owner' &&
    String(item.account_status || '').toLowerCase() === 'active'
  );
}

export async function staffCancelAppointment(id, staffId, reason) {
  const updatePayload = { status: 'Cancelled' };
  const trimmedReason = reason?.trim();
  if (trimmedReason) {
    const { data: current } = await supabase.from('appointments').select('notes').eq('id', id).maybeSingle();
    updatePayload.notes = [current?.notes || null, `Cancelled by staff: ${trimmedReason}`].filter(Boolean).join(' | ');
  }
  const { error } = await supabase
    .from('appointments')
    .update(updatePayload)
    .eq('id', id)
    .eq('status', 'Confirmed');
  if (error) throw new Error('Unable to cancel the appointment.');
}

export async function staffRescheduleAppointment(id, values, staffId, ownerId) {
  if (!values.veterinarianId) throw new Error('Select a veterinarian.');
  if (!values.appointmentDate || values.appointmentDate < todayLocal()) throw new Error('Select today or a future date.');
  if (!values.startTime) throw new Error('Select an available time.');

  const latestSlots = await getAvailableSlots(values.veterinarianId, values.appointmentDate, id);
  if (!latestSlots.includes(normalizeTime(values.startTime))) {
    throw new Error('That appointment time is no longer available. Please select another available time.');
  }

  const { error } = await supabase
    .from('appointments')
    .update({
      veterinarian_id: values.veterinarianId,
      appointment_date: values.appointmentDate,
      start_time: normalizeTime(values.startTime),
      end_time: addTenMinutes(values.startTime),
      status: 'Confirmed',
      created_by: staffId,
    })
    .eq('id', id)
    .eq('status', 'Confirmed');
  if (error) {
    const message = String(error.message || '').toLowerCase();
    if (error.code === '23505' || message.includes('already booked') || message.includes('duplicate')) {
      throw new Error('That time is already booked. Please select another slot.');
    }
    throw new Error('Unable to reschedule the appointment.');
  }

  if (ownerId) {
    createNotification({
      recipientId: ownerId,
      type: 'Appointment',
      title: 'Appointment Rescheduled',
      message: `Staff moved your appointment to ${formatFullDate(values.appointmentDate)} at ${formatTime(values.startTime)}.`,
      relatedModule: 'Appointments',
      relatedRecord: id,
      createdBy: staffId,
    }).catch(() => {});
  }
}

export async function completeAppointment(id, staffId) {
  const { error } = await supabase
    .from('appointments')
    .update({ status: 'Completed', created_by: staffId || undefined })
    .eq('id', id)
    .eq('status', 'Confirmed');
  if (error) throw new Error('Unable to mark the appointment as completed.');
}
