import { supabase } from '../config/supabaseClient';

// A doctor change the clinic offered because the booked doctor can't see
// the visit. The owner confirms, reschedules or cancels in My Queue; the
// rules live in the web project's supabase/QUEUE_DOCTOR_CHANGE_CONFIRMATION.sql.

function toError(error, fallback) {
  const text = [error?.message, error?.details].filter(Boolean).join(' ').toLowerCase();
  if (['PGRST202', 'PGRST205', '42883', '42P01'].includes(error?.code) || text.includes('queue_doctor_offers')) {
    return new Error('Visit updates are not available yet. Please check with the clinic.');
  }
  return new Error(error?.message || fallback);
}

const timeOrNull = (value) => (value ? String(value).slice(0, 5) : null);

export async function getMyDoctorOffers(ownerId) {
  if (!ownerId) return [];
  const { data, error } = await supabase
    .from('queue_doctor_offers')
    .select('*')
    .eq('owner_id', ownerId)
    .eq('status', 'Pending')
    .order('created_at');
  if (error) {
    // No offers table yet (SQL not run): nothing to show.
    if (['PGRST205', '42P01'].includes(error.code)) return [];
    throw toError(error, 'Unable to load your visit updates.');
  }
  const offers = data || [];
  if (!offers.length) return [];

  const petIds = [...new Set(offers.flatMap((offer) => offer.pet_ids || []))];
  const vetIds = [...new Set(offers.flatMap((offer) => [offer.original_veterinarian_id, offer.proposed_veterinarian_id]).filter(Boolean))];
  const [{ data: pets }, { data: vets }] = await Promise.all([
    supabase.from('pets').select('id, pet_name').in('id', petIds),
    supabase.from('profiles').select('id, full_name').in('id', vetIds),
  ]);
  const petMap = new Map((pets || []).map((pet) => [pet.id, pet]));
  const vetMap = new Map((vets || []).map((vet) => [vet.id, vet]));
  return offers.map((offer) => ({
    ...offer,
    pets: (offer.pet_ids || []).map((id) => petMap.get(id)).filter(Boolean),
    original_veterinarian: vetMap.get(offer.original_veterinarian_id) || null,
    proposed_veterinarian: vetMap.get(offer.proposed_veterinarian_id) || null,
  }));
}

// action: 'confirm' | 'reschedule' | 'cancel'
export async function respondDoctorOffer(offerId, ownerId, action, { date = null, veterinarianId = null, startTime = null } = {}) {
  const { data, error } = await supabase.rpc('respond_doctor_offer', {
    p_offer_id: offerId,
    p_actor_id: ownerId,
    p_action: action,
    p_new_date: date,
    p_new_veterinarian_id: veterinarianId,
    p_new_time: timeOrNull(startTime),
    p_note: null,
  });
  if (error) throw toError(error, 'Unable to save your answer.');
  return data;
}

export async function getRescheduleOptions(offerId, date) {
  const { data, error } = await supabase.rpc('get_doctor_offer_reschedule_options', { p_offer_id: offerId, p_date: date });
  if (error) throw toError(error, 'Unable to load available times.');
  return data;
}
