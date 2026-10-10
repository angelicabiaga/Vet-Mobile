import * as Print from 'expo-print';
import { formatMedicalDate } from '../api/medicalRecordService';
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

// "3 years 2 months" from a date of birth, or '' when unknown.
export function petAgeText(dateOfBirth) {
  if (!dateOfBirth) return '';
  const born = new Date(`${String(dateOfBirth).slice(0, 10)}T12:00:00`);
  if (Number.isNaN(born.getTime())) return '';
  const now = new Date();
  let months = (now.getFullYear() - born.getFullYear()) * 12 + (now.getMonth() - born.getMonth());
  if (now.getDate() < born.getDate()) months -= 1;
  if (months < 0) return '';
  const years = Math.floor(months / 12);
  const rest = months % 12;
  const part = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
  if (!years) return rest ? part(rest, 'month') : 'Under 1 month';
  return rest ? `${part(years, 'year')} ${part(rest, 'month')}` : part(years, 'year');
}

