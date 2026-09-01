import { supabase } from '../config/supabaseClient';

// Read-only mirror of the web app's billing/prescriptions lookups scoped to
// one consultation (final-vet/src/services/billingService.js). Mobile never
// writes billing or prescription rows -- Staff owns that flow on the web app.
const TRANSACTION_FIELDS =
  'id,or_number,pet_id,owner_id,medical_record_id,appointment_id,queue_entry_id,checkup_fee,items_subtotal,subtotal,discount_amount,total_amount,amount_paid,change_amount,payment_method,payment_status,notes,created_at,updated_at';

const PRESCRIPTION_FIELDS =
  'id,queue_entry_id,medical_record_id,pet_id,owner_id,veterinarian_id,inventory_item_id,item_name,unit_price,prescribed_quantity,total_quantity_purchased,fulfillment_status,sig,created_at,updated_at';

function uniq(values = []) {
  return [...new Set(values.filter(Boolean))];
}

export async function getTransactionsForQueueEntry(queueEntryId) {
  if (!queueEntryId) return [];
  const { data, error } = await supabase
    .from('transactions')
    .select(TRANSACTION_FIELDS)
    .eq('queue_entry_id', queueEntryId)
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message || 'Unable to load billing for this consultation.');
  return data || [];
}

export async function getPrescriptionsForConsultation(queueEntryId) {
  if (!queueEntryId) return [];
  const { data, error } = await supabase
    .from('prescriptions')
    .select(PRESCRIPTION_FIELDS)
    .eq('queue_entry_id', queueEntryId)
    .order('item_name', { ascending: true });
  if (error) throw new Error(error.message || 'Unable to load prescriptions for this consultation.');
  return data || [];
}

export async function getPrescriptionPurchaseHistory(prescriptionIds) {
  const ids = uniq(prescriptionIds);
  if (!ids.length) return [];
  const { data, error } = await supabase
    .from('transaction_items')
    .select('id,prescription_id,quantity,unit_price,created_at')
    .in('prescription_id', ids)
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message || 'Unable to load purchase history.');
  return data || [];
}

export function formatMoney(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '₱0.00';
  return `₱${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function invoiceBalance(invoice) {
  return Math.max(0, Number(invoice?.total_amount || 0) - Number(invoice?.amount_paid || 0));
}

export function formatPurchaseDateTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString([], { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}
