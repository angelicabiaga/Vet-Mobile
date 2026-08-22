import { supabase } from '../config/supabaseClient';

// Same schema already live on the web app (final-vet/src/services/transactionService.js)
// -- reused verbatim here, just scoped to the owner viewing their own history.
const TRANSACTION_FIELDS =
  'id,or_number,pet_id,owner_id,medical_record_id,appointment_id,queue_entry_id,staff_id,checkup_fee,items_subtotal,subtotal,discount_amount,total_amount,amount_paid,change_amount,payment_method,payment_status,notes,created_at,updated_at';

const TRANSACTION_ITEM_FIELDS = 'id,transaction_id,item_type,item_name,quantity,unit_price,line_total';

function isMissingTableError(error) {
  return (
    ['PGRST205', '42P01'].includes(error?.code) ||
    String(error?.message || '').toLowerCase().includes('transactions')
  );
}

export async function getOwnerTransactions(ownerId) {
  if (!ownerId) return [];

  const { data, error } = await supabase
    .from('transactions')
    .select(`${TRANSACTION_FIELDS},transaction_items(${TRANSACTION_ITEM_FIELDS})`)
    .eq('owner_id', ownerId)
    .order('created_at', { ascending: false });

  if (error) {
    if (isMissingTableError(error)) {
      throw new Error('Payment history is not available yet. Please check back after your clinic finishes setting up billing.');
    }
    throw new Error(error.message || 'Unable to load your payment history.');
  }

  const rows = data || [];
  if (!rows.length) return [];

  const petIds = [...new Set(rows.map((row) => row.pet_id).filter(Boolean))];
  const petsResult = petIds.length
    ? await supabase.from('pets').select('id,pet_name,species').in('id', petIds)
    : { data: [], error: null };

  if (petsResult.error) console.warn('Payment history pets relation:', petsResult.error);
  const petsById = Object.fromEntries((petsResult.data || []).map((pet) => [String(pet.id), pet]));

  return rows.map((row) => ({
    ...row,
    pet: petsById[String(row.pet_id)] || null,
  }));
}

export function subscribeToOwnerTransactions(ownerId, onChange) {
  if (!ownerId || typeof onChange !== 'function') return () => {};

  const channel = supabase
    .channel(`pawcruz-mobile-owner-transactions-${ownerId}-${Date.now()}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions', filter: `owner_id=eq.${ownerId}` }, () => onChange())
    .subscribe();

  return () => { supabase.removeChannel(channel); };
}

export function formatTransactionDate(value) {
  if (!value) return 'Not recorded';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString([], { month: 'short', day: '2-digit', year: 'numeric' });
}

export function formatCurrency(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '₱0.00';
  return `₱${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
