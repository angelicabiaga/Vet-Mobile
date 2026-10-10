import { Platform } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { jsPDF } from './jspdfLoader';

// The one-page A4 "Veterinarian Prescription" slip (same layout and wording
// as the web app's buildPrescriptionPadPdf). Built from data only -- never
// from the screen:
//   web    -> jsPDF; View opens the PDF in a new tab, Download saves it
//   native -> HTML -> PDF file (expo-print); View previews, Download shares
//
// slip = {
//   prescriptions: [{ item_name, prescribed_quantity, sig }],
//   vet: { name, phone, license },
//   owner: { name, address },
//   pet: { name, species, breed, age },
//   dateTime: 'Oct 1, 2026, 1:07 PM',
// }

const CLINIC = 'PawCruz Veterinary Clinic';
const CLINIC_ADDRESS = '2189 Stall G, Felimarc Pet Center, A. Luna St, Pasay City';
const TITLE = 'Veterinarian Prescription';
const FOOTER = 'KEEP OUT OF REACH OF CHILDREN AND OTHER PETS  •  FOR VETERINARY USE ONLY';
const NO_SIG = 'No directions for use recorded.';
const NO_ITEMS = 'No medicine prescribed for this consultation.';

export const SLIP_ERROR_TITLE = 'Prescription not available';
export const SLIP_ERROR_MESSAGE = "The prescription slip couldn't be created. Please try again.";

const text = (value) => String(value ?? '').trim();

// full_name may already include "Dr."; add the title exactly once.
export const withDrTitle = (name) => {
  const bare = text(name).replace(/^(?:dr\.\s*|dr\s+)+/i, '').trim();
  return bare ? `Dr. ${bare}` : 'N/A';
};

const quantityOf = (rx) => {
  const number = Number(rx?.prescribed_quantity);
  return Number.isFinite(number) ? number : 0;
};

function rowsFor(slip) {
  const pet = slip.pet || {};
  const kind = [text(pet.species), text(pet.breed)].filter(Boolean).join(' - ');
  const rows = [
    ['Prescribing Veterinarian', withDrTitle(slip.vet?.name)],
    ['Veterinarian Contact Number', text(slip.vet?.phone) || 'N/A'],
    ['Veterinary License Number', text(slip.vet?.license) || 'N/A'],
    ['Client / Pet Owner', text(slip.owner?.name) || 'N/A'],
  ];
  if (text(slip.owner?.address)) rows.push(['Address', text(slip.owner.address)]);
  rows.push(
    ['Patient / Pet', `${text(pet.name) || 'N/A'}${kind ? ` (${kind})` : ''}`],
    ['Age', text(pet.age) || 'N/A'],
    ['Date', text(slip.dateTime) || 'N/A'],
  );
  return rows;
}

// Veterinarian-Prescription-<PetName>-<date>.pdf (letters, numbers, dashes).
export function slipFileName(slip) {
  const clean = (value) => text(value).replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const day = new Date();
  const date = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
  return `Veterinarian-Prescription-${clean(slip.pet?.name) || 'Pet'}-${date}.pdf`;
}

// ---------- Web: jsPDF ----------

function buildJsPdf(slip) {
  if (!jsPDF) throw new Error('jsPDF is only available on web.');
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = 210;
  const H = 297;
  const left = 22;
  const right = W - 22;

  pdf.setDrawColor(180, 205, 217);
  pdf.setLineWidth(0.4);
  pdf.rect(8, 8, W - 16, H - 16);

  let y = 26;
  pdf.setTextColor(37, 80, 101);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(17);
  pdf.text(CLINIC, W / 2, y, { align: 'center' });
  y += 6;
  pdf.setTextColor(120, 135, 143);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8);
  pdf.text(CLINIC_ADDRESS, W / 2, y, { align: 'center' });
  y += 6;
  pdf.setFontSize(10.5);
  pdf.setTextColor(97, 118, 129);
  pdf.text(TITLE, W / 2, y, { align: 'center' });
  y += 5;
  pdf.setDrawColor(37, 80, 101);
  pdf.setLineWidth(0.6);
  pdf.line(left, y, right, y);
  y += 9;

  // Label / value rows: grey label left, bold value right with an underline.
  const labelWidth = 58;
  const valueX = left + labelWidth;
  const valueWidth = right - valueX;
  rowsFor(slip).forEach(([label, value]) => {
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9);
    pdf.setTextColor(97, 118, 127);
    pdf.text(label, left, y);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(10);
    pdf.setTextColor(30, 49, 58);
    const lines = pdf.splitTextToSize(value, valueWidth);
    pdf.text(lines, valueX, y);
    const bottom = y + (lines.length - 1) * 4.6 + 1.6;
    pdf.setDrawColor(210, 224, 231);
    pdf.setLineWidth(0.2);
    pdf.line(valueX, bottom, right, bottom);
    y = bottom + 6.4;
  });

  // Rx and the numbered medicines.
  y += 4;
  pdf.setFont('times', 'bolditalic');
  pdf.setFontSize(34);
  pdf.setTextColor(37, 80, 101);
  pdf.text('Rx', left, y + 8);
  const listX = left + 22;
  const listWidth = right - listX;
  let listY = y + 2;
  const items = slip.prescriptions || [];
  if (!items.length) {
    pdf.setFont('helvetica', 'italic');
    pdf.setFontSize(10);
    pdf.setTextColor(97, 118, 129);
    pdf.text(NO_ITEMS, listX, listY + 4);
    listY += 10;
  }
  items.forEach((rx, index) => {
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(10.5);
    pdf.setTextColor(30, 49, 58);
    const head = pdf.splitTextToSize(`${index + 1}. ${text(rx.item_name) || 'Medicine'}  —  Qty: ${quantityOf(rx)}`, listWidth);
    pdf.text(head, listX, listY + 4);
    listY += 4 + head.length * 4.8;
    pdf.setFont('helvetica', 'italic');
    pdf.setFontSize(9);
    pdf.setTextColor(97, 118, 129);
    const sig = pdf.splitTextToSize(`Sig: ${text(rx.sig) || NO_SIG}`, listWidth - 4);
    pdf.text(sig, listX + 4, listY);
    listY += sig.length * 4.2 + 4;
  });

  // Signature block, bottom right.
  const sigY = Math.max(listY + 18, H - 62);
  pdf.setDrawColor(30, 49, 58);
  pdf.setLineWidth(0.3);
  pdf.line(right - 68, sigY, right, sigY);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(10);
  pdf.setTextColor(30, 49, 58);
  pdf.text(withDrTitle(slip.vet?.name), right - 34, sigY + 5, { align: 'center' });
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8);
  pdf.setTextColor(120, 135, 143);
  pdf.text('Attending Veterinarian', right - 34, sigY + 9.5, { align: 'center' });

  pdf.setFont('helvetica', 'bolditalic');
  pdf.setFontSize(7.5);
  pdf.setTextColor(120, 135, 143);
  pdf.text(FOOTER, W / 2, H - 18, { align: 'center' });
  return pdf;
}

// ---------- Native: HTML -> PDF ----------

const esc = (value) => text(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function slipHtml(slip) {
  const rows = rowsFor(slip)
    .map(([label, value]) => `<tr><td class="label">${esc(label)}</td><td class="value">${esc(value)}</td></tr>`)
    .join('');
  const items = (slip.prescriptions || []).length
    ? slip.prescriptions.map((rx, index) => `
        <li><div class="item">${index + 1}. ${esc(text(rx.item_name) || 'Medicine')}  &mdash;  Qty: ${quantityOf(rx)}</div>
        <div class="sig">Sig: ${esc(text(rx.sig) || NO_SIG)}</div></li>`).join('')
    : `<li class="none">${NO_ITEMS}</li>`;

  return `<!doctype html><html><head><meta charset="utf-8" />
  <style>
    @page { size: A4; margin: 0; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; }
    body { font-family: Helvetica, Arial, sans-serif; color: #1e313a; }
    .page { position: relative; width: 210mm; height: 297mm; padding: 8mm; }
    .frame { position: relative; height: 100%; border: 1px solid #b4cdd9; padding: 12mm 14mm; }
    h1 { margin: 0; text-align: center; font-size: 17pt; color: #255065; }
    .address { text-align: center; font-size: 8pt; color: #78878f; margin-top: 4px; }
    .title { text-align: center; font-size: 10.5pt; color: #617681; margin-top: 6px; }
    .divider { border-top: 2px solid #255065; margin: 8px 0 18px; }
    table { width: 100%; border-collapse: collapse; }
    td { vertical-align: top; padding: 0 0 12px; font-size: 9pt; }
    td.label { width: 36%; color: #61767f; }
    td.value { font-size: 10pt; font-weight: bold; border-bottom: 1px solid #d2e0e7; padding-bottom: 3px; word-break: break-word; }
    .rx { display: flex; gap: 14px; margin-top: 14px; }
    .rx-mark { font-family: 'Times New Roman', Times, serif; font-style: italic; font-weight: bold; font-size: 34pt; color: #255065; line-height: 1; }
    ol { list-style: none; margin: 0; padding: 6px 0 0; flex: 1; }
    li { margin-bottom: 12px; }
    .item { font-weight: bold; font-size: 10.5pt; word-break: break-word; }
    .sig { margin: 3px 0 0 12px; font-style: italic; font-size: 9pt; color: #617681; word-break: break-word; }
    .none { font-style: italic; color: #617681; }
    .signature { position: absolute; right: 14mm; bottom: 34mm; width: 68mm; text-align: center; }
    .signature .line { border-top: 1px solid #1e313a; margin-bottom: 5px; }
    .signature .name { font-weight: bold; font-size: 10pt; }
    .signature .role { font-size: 8pt; color: #78878f; margin-top: 2px; }
    .footer { position: absolute; left: 0; right: 0; bottom: 10mm; text-align: center; font-size: 7.5pt; font-weight: bold; font-style: italic; color: #78878f; }
  </style></head><body>
  <div class="page"><div class="frame">
    <h1>${CLINIC}</h1>
    <div class="address">${CLINIC_ADDRESS}</div>
    <div class="title">${TITLE}</div>
    <div class="divider"></div>
    <table>${rows}</table>
    <div class="rx"><div class="rx-mark">Rx</div><ol>${items}</ol></div>
    <div class="signature"><div class="line"></div>
      <div class="name">${esc(withDrTitle(slip.vet?.name))}</div>
      <div class="role">Attending Veterinarian</div></div>
    <div class="footer">${FOOTER}</div>
  </div></div></body></html>`;
}

async function nativePdfUri(slip) {
  const { uri } = await Print.printToFileAsync({ html: slipHtml(slip), width: 595, height: 842 });
  // Give the file its proper name for sharing/saving; keep the temp name if that fails.
  if (!FileSystem.cacheDirectory) return uri;
  const named = `${FileSystem.cacheDirectory}${slipFileName(slip)}`;
  try {
    await FileSystem.deleteAsync(named, { idempotent: true });
    await FileSystem.moveAsync({ from: uri, to: named });
    return named;
  } catch {
    return uri;
  }
}

// ---------- Public API ----------

// View: web opens the PDF in a new tab. Returns { blockedUrl } when the
// popup blocker stopped it, so the caller can show it in an in-app viewer.
export async function viewPrescriptionSlip(slip) {
  if (Platform.OS === 'web') {
    const url = buildJsPdf(slip).output('bloburl');
    const opened = window.open(url, '_blank');
    return opened ? {} : { blockedUrl: String(url) };
  }
  const uri = await nativePdfUri(slip);
  await Print.printAsync({ uri });
  return {};
}

// Download: web saves the .pdf; native opens the share/save sheet.
export async function downloadPrescriptionSlip(slip) {
  if (Platform.OS === 'web') {
    buildJsPdf(slip).save(slipFileName(slip));
    return;
  }
  const uri = await nativePdfUri(slip);
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: 'Save prescription' });
  } else {
    await Print.printAsync({ uri });
  }
}
