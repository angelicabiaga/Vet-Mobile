import { Platform } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { supabase } from '../config/supabaseClient';
import { jsPDF } from './jspdfLoader';
import { formatMoney, formatPurchaseDateTime, invoiceBalance } from '../api/consultationBillingService';

// The "Official POS Invoice" PDF -- same layout and wording as the web app's
// downloadInvoicePdf (final-vet/src/utils/invoicePdf.js). Built from data
// only, never by printing the screen:
//   web    -> jsPDF, saved as Invoice-<OR number>.pdf
//   native -> HTML -> PDF file (expo-print), then the share/save sheet

const CLINIC = 'PawCruz Veterinary Clinic';
const SUBTITLE = 'Official POS Invoice';
export const INVOICE_ERROR_MESSAGE = "The invoice couldn't be created. Please try again.";

const text = (value) => String(value ?? '').trim();
const orNumber = (invoice) => text(invoice?.or_number) || text(invoice?.id);
const fileName = (invoice) => `Invoice-${orNumber(invoice).replace(/[^A-Za-z0-9-]+/g, '-')}.pdf`;

// Line items, pet owner, pet and cashier for one invoice row from the
// Billing card (the card itself only loads the totals).
async function loadInvoiceDetails(invoice) {
  const [tx, items] = await Promise.all([
    supabase.from('transactions').select('owner_id,pet_id,staff_id,created_by,change_amount,discount_amount,checkup_fee').eq('id', invoice.id).maybeSingle(),
    supabase.from('transaction_items').select('id,item_name,quantity,unit_price,line_total,created_at').eq('transaction_id', invoice.id).order('created_at', { ascending: true }),
  ]);
  if (tx.error || items.error) throw new Error('Unable to load the invoice details.');
  const row = { ...invoice, ...(tx.data || {}) };
  const cashierId = row.staff_id || row.created_by;
  const profileIds = [row.owner_id, cashierId].filter(Boolean);
  const [pet, profiles] = await Promise.all([
    row.pet_id ? supabase.from('pets').select('pet_name').eq('id', row.pet_id).maybeSingle() : { data: null },
    profileIds.length ? supabase.from('profiles').select('id,full_name').in('id', profileIds) : { data: [] },
  ]);
  const nameOf = (id) => (profiles.data || []).find((profile) => profile.id === id)?.full_name;
  return {
    ...row,
    items: items.data || [],
    ownerName: nameOf(row.owner_id),
    petName: pet.data?.pet_name,
    cashierName: nameOf(cashierId),
  };
}

function lineItems(invoice) {
  const checkup = Number(invoice.checkup_fee || 0);
  const service = checkup > 0 ? [{ id: 'checkup', item_name: 'Checkup / consultation service', quantity: 1, line_total: checkup }] : [];
  return [...service, ...invoice.items.map((item) => ({
    ...item,
    line_total: item.line_total ?? Number(item.unit_price || 0) * Number(item.quantity || 0),
  }))];
}

const parties = (invoice) => [
  { label: 'Pet owner', value: text(invoice.ownerName) || '—' },
  { label: 'Pet', value: text(invoice.petName) || '—' },
  { label: 'Cashier', value: text(invoice.cashierName) || '—' },
];

function summary(invoice) {
  const rows = [];
  if (Number(invoice.discount_amount || 0) > 0) rows.push({ label: 'Discount', value: `-${formatMoney(invoice.discount_amount)}` });
  rows.push({ label: 'Total', value: formatMoney(invoice.total_amount), strong: true });
  rows.push({ label: 'Amount paid', value: formatMoney(invoice.amount_paid) });
  rows.push({ label: 'Change', value: formatMoney(invoice.change_amount) });
  const balance = invoiceBalance(invoice);
  if (balance > 0) rows.push({ label: 'Remaining Balance', value: formatMoney(balance), warn: true });
  rows.push({ label: 'Method', value: text(invoice.payment_method) || '—' });
  rows.push({ label: 'Status', value: text(invoice.payment_status) || '—' });
  return rows;
}

// ---------- Web: jsPDF (same drawing as the web app) ----------

// jsPDF's built-in fonts have no "₱": draw a "P" and add the peso's two bars.
function withPeso(pdf) {
  const original = pdf.text.bind(pdf);
  pdf.text = (value, x, y, options = {}) => {
    if (typeof value !== 'string' || !value.includes('₱')) return original(value, x, y, options);
    const plain = value.replace(/₱/g, 'P');
    const width = pdf.getTextWidth(plain);
    const startX = options.align === 'right' ? x - width : options.align === 'center' ? x - width / 2 : x;
    const { align, ...rest } = options;
    original(plain, startX, y, rest);
    const size = pdf.getFontSize() / pdf.internal.scaleFactor;
    const cap = size * 0.7;
    const pWidth = pdf.getTextWidth('P');
    const previousDraw = pdf.getDrawColor();
    const previousWidth = pdf.getLineWidth();
    pdf.setDrawColor(pdf.getTextColor());
    pdf.setLineWidth(Math.max(0.12, size * 0.06));
    let index = value.indexOf('₱');
    while (index !== -1) {
      const px = startX + pdf.getTextWidth(plain.slice(0, index));
      [0.58, 0.78].forEach((level) => pdf.line(px - pWidth * 0.12, y - cap * level, px + pWidth * 0.95, y - cap * level));
      index = value.indexOf('₱', index + 1);
    }
    pdf.setDrawColor(previousDraw);
    pdf.setLineWidth(previousWidth);
    return pdf;
  };
  return pdf;
}

function buildJsPdf(invoice) {
  if (!jsPDF) throw new Error('jsPDF is only available on web.');
  const pdf = withPeso(new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' }));
  const centerX = 105;
  let y = 22;

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(18);
  pdf.setTextColor(37, 80, 101);
  pdf.text(CLINIC, centerX, y, { align: 'center' });
  y += 7;
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(11);
  pdf.setTextColor(97, 118, 129);
  pdf.text(SUBTITLE, centerX, y, { align: 'center' });
  y += 8;
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(13);
  pdf.setTextColor(30, 49, 58);
  pdf.text(orNumber(invoice), centerX, y, { align: 'center' });
  y += 6;
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(10);
  pdf.setTextColor(97, 118, 129);
  pdf.text(formatPurchaseDateTime(invoice.created_at), centerX, y, { align: 'center' });

  y += 10;
  pdf.setDrawColor(214, 228, 235);
  pdf.line(20, y, 190, y);
  y += 8;

  pdf.setFontSize(11);
  const infoRow = ({ label, value, strong, warn }) => {
    pdf.setFont('helvetica', strong || warn ? 'bold' : 'normal');
    if (warn) pdf.setTextColor(176, 98, 10); else pdf.setTextColor(97, 118, 129);
    pdf.text(label, 20, y);
    if (!warn) pdf.setTextColor(30, 49, 58);
    pdf.setFont('helvetica', 'bold');
    pdf.text(String(value), 190, y, { align: 'right' });
    pdf.setFont('helvetica', 'normal');
    y += 7;
  };
  parties(invoice).forEach(infoRow);

  y += 3;
  pdf.line(20, y, 190, y);
  y += 8;

  lineItems(invoice).forEach((item) => {
    pdf.setTextColor(30, 49, 58);
    pdf.text(`${item.item_name} × ${Number(item.quantity)}`, 20, y);
    pdf.text(formatMoney(item.line_total), 190, y, { align: 'right' });
    y += 7;
  });

  y += 3;
  pdf.line(20, y, 190, y);
  y += 8;

  summary(invoice).forEach(infoRow);
  return pdf;
}

// ---------- Native: HTML -> PDF (same look) ----------

const esc = (value) => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function invoiceHtml(invoice) {
  const rows = (list) => list.map(({ label, value, strong, warn }) =>
    `<div class="row${strong ? ' strong' : ''}${warn ? ' warn' : ''}"><span>${esc(label)}</span><b>${esc(value)}</b></div>`).join('');
  const items = lineItems(invoice).map((item) =>
    `<div class="row item"><span>${esc(item.item_name)} × ${esc(Number(item.quantity))}</span><span>${esc(formatMoney(item.line_total))}</span></div>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8" /><style>
    @page { size: A4; margin: 0; }
    html, body { margin: 0; padding: 0; }
    body { font-family: Helvetica, Arial, sans-serif; color: #1e313a; padding: 18mm 20mm; }
    .center { text-align: center; }
    h1 { margin: 0; font-size: 18pt; color: #255065; }
    .subtitle { margin-top: 6px; font-size: 11pt; color: #617681; }
    .or { margin-top: 10px; font-size: 13pt; font-weight: bold; }
    .date { margin-top: 5px; font-size: 10pt; color: #617681; }
    hr { border: none; border-top: 1px solid #d6e4eb; margin: 22px 0 14px; }
    .row { display: flex; justify-content: space-between; gap: 16px; font-size: 11pt; padding: 4px 0; }
    .row span { color: #617681; }
    .row b { color: #1e313a; }
    .row.item span { color: #1e313a; }
    .row.strong span { font-weight: bold; }
    .row.warn span, .row.warn b { color: #b0620a; font-weight: bold; }
  </style></head><body>
    <div class="center">
      <h1>${CLINIC}</h1>
      <div class="subtitle">${SUBTITLE}</div>
      <div class="or">${esc(orNumber(invoice))}</div>
      <div class="date">${esc(formatPurchaseDateTime(invoice.created_at))}</div>
    </div>
    <hr />${rows(parties(invoice))}
    <hr />${items}
    <hr />${rows(summary(invoice))}
  </body></html>`;
}

async function nativePdfUri(invoice) {
  const { uri } = await Print.printToFileAsync({ html: invoiceHtml(invoice), width: 595, height: 842 });
  if (!FileSystem.cacheDirectory) return uri;
  const named = `${FileSystem.cacheDirectory}${fileName(invoice)}`;
  try {
    await FileSystem.deleteAsync(named, { idempotent: true });
    await FileSystem.moveAsync({ from: uri, to: named });
    return named;
  } catch {
    return uri;
  }
}

// View before downloading.
//   web    -> returns { url, title, download } for the in-app preview
//             (download() saves the exact PDF being previewed)
//   native -> opens the system PDF preview and returns null
export async function viewInvoice(invoice) {
  const full = await loadInvoiceDetails(invoice);
  if (Platform.OS === 'web') {
    const pdf = buildJsPdf(full);
    return { url: String(pdf.output('bloburl')), title: `Invoice ${orNumber(full)}`, download: () => pdf.save(fileName(full)) };
  }
  const uri = await nativePdfUri(full);
  await Print.printAsync({ uri });
  return null;
}

// Download: web saves the .pdf; native opens the share/save sheet.
export async function downloadInvoice(invoice) {
  const full = await loadInvoiceDetails(invoice);
  if (Platform.OS === 'web') {
    buildJsPdf(full).save(fileName(full));
    return;
  }
  const uri = await nativePdfUri(full);
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: 'Save invoice' });
  } else {
    await Print.printAsync({ uri });
  }
}
