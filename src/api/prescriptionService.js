import { supabase } from '../config/supabaseClient';

// Veterinarian prescriptions for one consultation, the same queries the web
// app's billingService uses (getPrescriptionsForConsultation,
// getPrescriptionPurchaseHistory, markPrescriptionElsewhere). Every error is
// a plain sentence for the user; database codes are only logged.

const PRESCRIPTION_FIELDS =
  'id,queue_entry_id,medical_record_id,pet_id,owner_id,veterinarian_id,inventory_item_id,item_name,unit_price,prescribed_quantity,total_quantity_purchased,fulfillment_status,sig,created_at';

export const LOAD_PRESCRIPTIONS_ERROR = 'Unable to load prescription details for this visit right now.';
export const ALREADY_FULLY_PURCHASED = 'This prescription is already fully purchased.';
const SAVE_ERROR = 'Unable to update this prescription right now. Please try again.';

export const PURCHASABLE_STATUSES = ['Not Purchased', 'Partially Purchased'];

const quantity = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};

export const prescribedQuantity = (rx) => quantity(rx?.prescribed_quantity);
export const purchasedQuantity = (rx) => quantity(rx?.total_quantity_purchased);
export const remainingQuantity = (rx) => Math.max(0, prescribedQuantity(rx) - purchasedQuantity(rx));

// One ticket can cover several pets: keep only this pet's medicines.
function belongsToRecord(rx, record) {
  if (rx.medical_record_id) return String(rx.medical_record_id) === String(record.id);
  return String(rx.pet_id || '') === String(record.pet_id || '');
}

function fail(message, error) {
  if (error) console.warn(message, error.code, error.message);
  return new Error(message);
}

// { prescriptions, historyByRxId, billed } for a medical record's visit.
export async function getConsultationPrescriptions(record) {
  const queueEntryId = record?.queue_entry_id;
  if (!queueEntryId) return { prescriptions: [], historyByRxId: {}, billed: false };

  const [rxResult, billingResult] = await Promise.all([
    supabase.from('prescriptions').select(PRESCRIPTION_FIELDS).eq('queue_entry_id', queueEntryId).order('item_name', { ascending: true }),
    // Billing is done once a POS transaction exists for the visit.
    supabase.from('transactions').select('id', { count: 'exact', head: true }).eq('queue_entry_id', queueEntryId),
  ]);
  if (rxResult.error) throw fail(LOAD_PRESCRIPTIONS_ERROR, rxResult.error);
  if (billingResult.error) throw fail(LOAD_PRESCRIPTIONS_ERROR, billingResult.error);

  const prescriptions = (rxResult.data || []).filter((rx) => belongsToRecord(rx, record));
  const historyByRxId = {};
  if (prescriptions.length) {
    const { data, error } = await supabase
      .from('transaction_items')
      .select('id,prescription_id,quantity,created_at')
      .in('prescription_id', prescriptions.map((rx) => rx.id))
      .order('created_at', { ascending: true });
    if (error) throw fail(LOAD_PRESCRIPTIONS_ERROR, error);
    (data || []).forEach((row) => {
      (historyByRxId[row.prescription_id] ||= []).push(row);
    });
  }
  return { prescriptions, historyByRxId, billed: (billingResult.count || 0) > 0 };
}

// Pet owner: "I'll buy this elsewhere". Never overrides a fully purchased one.
export async function markPrescriptionElsewhere(rx, userId) {
  const { data, error } = await supabase
    .from('prescriptions')
    .update({ fulfillment_status: 'Purchasing Elsewhere' })
    .eq('id', rx.id)
    .neq('fulfillment_status', 'Fully Purchased')
    .select('id');
  if (error) throw fail(SAVE_ERROR, error);
  if (!data?.length) throw new Error(ALREADY_FULLY_PURCHASED);

  // The audit trail must never block the owner's choice.
  const { error: logError } = await supabase.from('prescription_activity_log').insert({
    prescription_id: rx.id,
    queue_entry_id: rx.queue_entry_id,
    pet_id: rx.pet_id,
    owner_id: rx.owner_id,
    item_name: rx.item_name,
    action: 'Purchasing Elsewhere',
    remaining_quantity: remainingQuantity(rx),
    performed_by: userId || null,
  });
  if (logError) console.warn('Prescription activity log not saved:', logError.code, logError.message);
}
