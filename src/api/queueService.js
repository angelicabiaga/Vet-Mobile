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
  const entryIds = uniq(rows.map((row) => row.id));
  const petIds = uniq(rows.map((row) => row.pet_id));
  const profileIds = uniq(rows.flatMap((row) => [row.owner_id, row.veterinarian_id]));
  const appointmentIds = uniq(rows.map((row) => row.appointment_id));

  const [petsResult, profilesResult, appointmentsResult, entryPetsResult] = await Promise.all([
    petIds.length
      ? supabase.from('pets').select('id,pet_name,species,breed').in('id', petIds)
      : Promise.resolve({ data: [], error: null }),
    profileIds.length
      ? supabase.from('profiles').select('id,full_name,username,email,role').in('id', profileIds)
      : Promise.resolve({ data: [], error: null }),
    appointmentIds.length
      ? supabase.from('appointments').select('id,appointment_date,start_time,visit_reason,status').in('id', appointmentIds)
      : Promise.resolve({ data: [], error: null }),
    // Multi-pet check-ins (one queue number covering several pets in the
    // same visit) live in this join table on the web app. Missing/not-yet
    // migrated on some environments, so a failure here just falls back to
    // the single pet_id column below instead of breaking the whole queue.
    entryIds.length
      ? supabase.from('queue_entry_pets').select('queue_entry_id,appointment_id,pet:pets(id,pet_name,species,breed)').in('queue_entry_id', entryIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (petsResult.error) throw petsResult.error;
  if (profilesResult.error) throw profilesResult.error;
  if (appointmentsResult.error) throw appointmentsResult.error;

  const petMap = new Map((petsResult.data || []).map((item) => [item.id, item]));
  const profileMap = new Map((profilesResult.data || []).map((item) => [item.id, item]));
  const appointmentMap = new Map((appointmentsResult.data || []).map((item) => [item.id, item]));

  const petsByEntry = new Map();
  (entryPetsResult.data || []).forEach((row) => {
    if (!row.pet) return;
    const list = petsByEntry.get(row.queue_entry_id) || [];
    list.push({ ...row.pet, appointmentId: row.appointment_id || null });
    petsByEntry.set(row.queue_entry_id, list);
  });

  return rows.map((row) => {
    const groupedPets = petsByEntry.get(row.id);
    const singlePet = petMap.get(row.pet_id) || null;
    const pets = groupedPets && groupedPets.length ? groupedPets : (singlePet ? [{ ...singlePet, appointmentId: row.appointment_id || null }] : []);
    return {
      ...row,
      pet: singlePet || pets[0] || null,
      pets,
      visitDurationMinutes: Math.max(pets.length, 1) * 10,
      owner: profileMap.get(row.owner_id) || null,
      veterinarian: profileMap.get(row.veterinarian_id) || null,
      appointment: appointmentMap.get(row.appointment_id) || null,
    };
  });
}

export async function getQueue({ ownerId, veterinarianId, date = todayLocal() } = {}) {
  // ownerId narrows which rows the caller gets back, but must NOT narrow the
  // pool the DB query fetches -- clientsAhead/estimatedWaitMinutes below has
  // to see the clinic's whole live queue for the day to count correctly.
  // Filtering the query itself by owner_id would leave `rows` holding only
  // that owner's own entry, so ahead would always compute to 0 regardless of
  // how many other clients are actually waiting. It's applied as a final
  // step instead, after the real queue-wide stats are computed.
  let query = supabase
    .from('queue_entries')
    .select('*')
    .eq('queue_date', date)
    .in('status', ACTIVE_STATUSES)
    .order('manual_order', { ascending: true, nullsFirst: false })
    .order('arrived_at', { ascending: true });

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

  const withQueueStats = rows.map((row, index) => {
    // Same-owner entries (e.g. a second walk-in pet) never count as
    // "ahead" of that owner's own place in line.
    const ahead = rows
      .slice(0, index)
      .filter((item) => item.veterinarian_id === row.veterinarian_id && item.owner_id !== row.owner_id && ACTIVE_STATUSES.includes(item.status));
    const estimatedWaitMinutes = ahead.reduce((sum, item) => sum + (item.visitDurationMinutes || 10), 0);
    return {
      ...row,
      clientsAhead: ahead.length,
      estimatedWaitMinutes,
    };
  });

  return ownerId ? withQueueStats.filter((row) => row.owner_id === ownerId) : withQueueStats;
}

export function subscribeToQueue(callback, { ownerId, veterinarianId } = {}) {
  // A pet owner's clientsAhead/estimatedWaitMinutes depend on every other
  // owner's queue entries for the day, so their subscription must listen to
  // the whole queue -- filtering by owner_id would miss the very changes
  // (another client being served, added, or leaving) that move their place
  // in line. Only the veterinarian's own-queue view can safely scope this.
  const filter = !ownerId && veterinarianId
    ? `veterinarian_id=eq.${veterinarianId}`
    : undefined;

  const config = { event: '*', schema: 'public', table: 'queue_entries' };
  if (filter) config.filter = filter;

  const appointmentFilter = !ownerId && veterinarianId
    ? `veterinarian_id=eq.${veterinarianId}`
    : undefined;
  const appointmentConfig = { event: '*', schema: 'public', table: 'appointments' };
  if (appointmentFilter) appointmentConfig.filter = appointmentFilter;

  // Listen to both queue changes and appointment status changes. A Staff action
  // that completes/cancels the appointment therefore clears the Pet Owner queue
  // immediately even before the fallback refresh runs.
  const offerConfig = { event: '*', schema: 'public', table: 'queue_doctor_offers' };
  if (ownerId) offerConfig.filter = `owner_id=eq.${ownerId}`;

  const channel = supabase
    .channel(`mobile-queue-${ownerId || veterinarianId || 'live'}-${Date.now()}`)
    .on('postgres_changes', config, () => callback?.())
    .on('postgres_changes', appointmentConfig, () => callback?.())
    .on('postgres_changes', offerConfig, () => callback?.())
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}

export { todayLocal };
