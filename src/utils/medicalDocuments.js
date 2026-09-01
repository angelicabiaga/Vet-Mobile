import * as Print from 'expo-print';
import { formatMedicalDate, formatMedicalTime12h } from '../api/medicalRecordService';
import { formatMoney, invoiceBalance } from '../api/consultationBillingService';

// Lightweight HTML->native-print-sheet documents, standing in for the web
// app's jsPDF letterhead documents (final-vet/src/utils/invoicePdf.js).
// expo-print's OS print dialog already offers "Save as PDF" on both
// platforms, so this covers "Download"/"Print" without a jsPDF/canvas port.
const na = (value) => (value === undefined || value === null || value === '' ? 'Not recorded' : String(value));
const esc = (value) => na(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const BASE_STYLE = `
  body { font-family: -apple-system, Helvetica, Arial, sans-serif; color: #1e313a; padding: 24px; }
  h1 { font-size: 20px; color: #255065; margin: 0 0 4px; text-align: center; }
  .subtitle { text-align: center; color: #617681; font-size: 12px; margin-bottom: 2px; }
  .address { text-align: center; color: #78878f; font-size: 10.5px; margin-bottom: 14px; }
  hr { border: none; border-top: 1px solid #d6e4eb; margin: 12px 0; }
  h2 { font-size: 13px; color: #255065; margin: 18px 0 6px; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  td { padding: 4px 0; vertical-align: top; }
  td.label { color: #61767f; width: 34%; }
  td.value { color: #1e313a; font-weight: 600; }
  .notes { background: #fbfdfe; border: 1px solid #e1edf2; border-radius: 8px; padding: 10px; font-size: 12px; margin-top: 6px; }
  .items li { margin-bottom: 4px; }
`;

function fieldRows(rows) {
  return rows
    .map(([label, value]) => `<tr><td class="label">${esc(label)}</td><td class="value">${esc(value)}</td></tr>`)
    .join('');
}

export async function printMedicalRecord(record, pet, meta = {}) {
  const visitDate = meta.visitDateTime || `${formatMedicalDate(record.consultation_date)}${formatMedicalTime12h(record) ? ` · ${formatMedicalTime12h(record)}` : ''}`;
  const html = `<html><head><meta charset="utf-8" /><style>${BASE_STYLE}</style></head><body>
    <h1>PawCruz Veterinary Clinic</h1>
    <div class="subtitle">Official Medical Record / Consultation Summary</div>
    <div class="address">2189 Stall G, Felimarc Pet Center, A. Luna St, Pasay City</div>
    <hr />
    <h2>Visit</h2>
    <table>${fieldRows([
      ['Date', visitDate],
      ['Pet', `${pet?.pet_name || pet?.name || '—'} (${pet?.species || '—'}${pet?.breed ? ` / ${pet.breed}` : ''})`],
      ['Owner', pet?.owner?.full_name || '—'],
      ['Veterinarian', meta.veterinarianName ? `Dr. ${String(meta.veterinarianName).replace(/^dr\.?\s*/i, '')}` : 'Not recorded'],
      ['Status', record.record_status || 'Draft'],
    ])}</table>
    <h2>Consultation</h2>
    <table>${fieldRows([
      ['Chief Complaint', record.chief_complaint],
      ['Symptoms', record.symptoms],
      ['Vital Signs', record.vital_signs],
      ['Weight', record.weight != null ? `${record.weight} kg` : ''],
      ['Temperature', record.temperature != null ? `${record.temperature} °C` : ''],
      ['Diagnosis', record.diagnosis],
      ['Treatment', record.treatment || record.treatment_plan],
      ['Medication', record.medication ? `${record.medication}${record.dosage ? ` · ${record.dosage}` : ''}${record.frequency ? ` · ${record.frequency}` : ''}${record.duration ? ` · ${record.duration}` : ''}` : ''],
      ['Laboratory Results', record.laboratory_result],
      ['Vaccination', record.vaccination],
      ['Follow-up Date', record.follow_up_date ? formatMedicalDate(record.follow_up_date) : ''],
    ])}</table>
    <h2>Notes</h2>
    <div class="notes">${esc(record.veterinarian_notes || 'No additional notes.')}</div>
  </body></html>`;

  await Print.printAsync({ html });
}

export async function printInvoice(invoice) {
  const html = `<html><head><meta charset="utf-8" /><style>${BASE_STYLE}</style></head><body>
    <h1>PawCruz Veterinary Clinic</h1>
    <div class="subtitle">Official Receipt</div>
    <hr />
    <table>${fieldRows([
      ['OR Number', invoice.or_number],
      ['Date', formatMedicalDate(invoice.created_at?.slice?.(0, 10) || invoice.created_at)],
      ['Total', formatMoney(invoice.total_amount)],
      ['Amount Paid', formatMoney(invoice.amount_paid)],
      ['Balance Due', formatMoney(invoiceBalance(invoice))],
      ['Payment Method', invoice.payment_method],
      ['Payment Status', invoice.payment_status],
    ])}</table>
  </body></html>`;

  await Print.printAsync({ html });
}

export async function printPrescriptionPad(prescriptions, meta = {}) {
  const items = (prescriptions || [])
    .map((rx) => `<li>${esc(rx.item_name)} — Qty ${esc(rx.prescribed_quantity)}${rx.sig ? `, Sig: ${esc(rx.sig)}` : ''}</li>`)
    .join('');

  const html = `<html><head><meta charset="utf-8" /><style>${BASE_STYLE}</style></head><body>
    <h1>PawCruz Veterinary Clinic</h1>
    <div class="subtitle">Veterinarian Prescription Pad</div>
    <hr />
    <table>${fieldRows([
      ['Veterinarian', meta.veterinarianName],
      ['Owner', meta.ownerName],
      ['Pet', `${meta.petName || '—'}${meta.petSpecies ? ` (${meta.petSpecies})` : ''}`],
      ['Date', meta.date],
    ])}</table>
    <h2>Prescribed Items</h2>
    <ul class="items">${items || '<li>No items recorded.</li>'}</ul>
  </body></html>`;

  await Print.printAsync({ html });
}
