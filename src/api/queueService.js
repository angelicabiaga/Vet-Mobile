import { supabase } from '../config/supabaseClient';

const ACTIVE_STATUSES = ['Waiting', 'Serving', 'Now Serving'];
const todayLocal = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};
const uniq = (values) => [...new Set(values.filter(Boolean))];

async function enrich(rows) {
  if (!rows.length) return [];
  const petIds = uniq(rows.map((row) => row.pet_id));
  const profileIds = uniq(rows.flatMap((row) => [row.owner_id, row.veterinarian_id]));
  const appointmentIds = uniq(rows.map((row) => row.appointment_id));

  const [petsResult, profilesResult, appointmentsResult] = await Promise.all([
    petIds.length
      ? supabase.from('pets').select('id,pet_name,species,breed').in('id', petIds)
      : Promise.resolve({ data: [], error: null }),
    profileIds.length
      ? supabase.from('profiles').select('id,full_name,username,email,role').in('id', profileIds)
      : Promise.resolve({ data: [], error: null }),
    appointmentIds.length
      ? supabase.from('appointments').select('id,appointment_date,start_time,visit_reason,status').in('id', appointmentIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (petsResult.error) throw petsResult.error;
  if (profilesResult.error) throw profilesResult.error;
  if (appointmentsResult.error) throw appointmentsResult.error;

  const petMap = new Map((petsResult.data || []).map((item) => [item.id, item]));
  const profileMap = new Map((profilesResult.data || []).map((item) => [item.id, item]));
  const appointmentMap = new Map((appointmentsResult.data || []).map((item) => [item.id, item]));

  return rows.map((row) => ({
    ...row,
    pet: petMap.get(row.pet_id) || null,
    owner: profileMap.get(row.owner_id) || null,
    veterinarian: profileMap.get(row.veterinarian_id) || null,
    appointment: appointmentMap.get(row.appointment_id) || null,
  }));
}

export async function getQueue({ ownerId, veterinarianId, date = todayLocal() } = {}) {
  let query = supabase
    .from('queue_entries')
    .select('*')
    .eq('queue_date', date)
    .in('status', ACTIVE_STATUSES)
    .order('manual_order', { ascending: true, nullsFirst: false })
    .order('arrived_at', { ascending: true });

  if (ownerId) query = query.eq('owner_id', ownerId);
  if (veterinarianId) query = query.eq('veterinarian_id', veterinarianId);

  const { data, error } = await query;
  if (error) throw new Error(error.message || 'Unable to load queue.');

  const enrichedRows = await enrich(data || []);
  // A queue number is active only while its queue status is Waiting/Serving AND
  // the linked appointment has not already been Completed or Cancelled.
  // This prevents stale queue numbers from remaining visible on Pet Owner mobile.
  const rows = enrichedRows.filter((row) => {
    if (!ACTIVE_STATUSES.includes(row.status)) return false;
    if (!row.appointment_id) return true; // walk-in queue
    return !['Completed', 'Cancelled'].includes(row.appointment?.status);
  });

  return rows.map((row, index) => {
    const clientsAhead = rows
      .slice(0, index)
      .filter((item) => item.veterinarian_id === row.veterinarian_id && ACTIVE_STATUSES.includes(item.status))
      .length;
    return {
      ...row,
      clientsAhead,
      estimatedWaitMinutes: clientsAhead * 10,
    };
  });
}

export function subscribeToQueue(callback, { ownerId, veterinarianId } = {}) {
  const filter = ownerId
    ? `owner_id=eq.${ownerId}`
    : veterinarianId
      ? `veterinarian_id=eq.${veterinarianId}`
      : undefined;

  const config = { event: '*', schema: 'public', table: 'queue_entries' };
  if (filter) config.filter = filter;

  const appointmentFilter = ownerId
    ? `owner_id=eq.${ownerId}`
    : veterinarianId
      ? `veterinarian_id=eq.${veterinarianId}`
      : undefined;
  const appointmentConfig = { event: '*', schema: 'public', table: 'appointments' };
  if (appointmentFilter) appointmentConfig.filter = appointmentFilter;

  // Listen to both queue changes and appointment status changes. A Staff action
  // that completes/cancels the appointment therefore clears the Pet Owner queue
  // immediately even before the fallback refresh runs.
  const channel = supabase
    .channel(`mobile-queue-${ownerId || veterinarianId || 'live'}-${Date.now()}`)
    .on('postgres_changes', config, () => callback?.())
    .on('postgres_changes', appointmentConfig, () => callback?.())
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

export { todayLocal };
