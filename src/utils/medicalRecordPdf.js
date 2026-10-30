import { Platform } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
// Web only: jsPDF can't load on Android/iOS (Hermes has no latin1 TextDecoder),
// so native gets null here and prints the HTML version of the same document.
import { jsPDF } from './jspdfLoader';
import { DENTAL_FIELDS, VACCINE_FIELDS, getRecordTemplate, parseJsonColumn } from '../constants/medicalRecordTemplates';
import { petAgeText } from './medicalDocuments';
import { PAW_LOGO } from './pawLogo';

// "Official Medical Record / Consultation Summary" for ONE consultation, the
// same sections, order and wording as the web app's printMedicalRecordDocument.
// Built from data only (never the screen) with jsPDF on every platform, so web
// and phones get the same multi-page A4 document with "Page X of Y":
//   web    -> opens the PDF in a new tab (in-app viewer if the popup is blocked)
//   native -> HTML version of the same document -> PDF file (expo-print),
//             then the system print preview.

export const RECORD_ERROR_TITLE = 'Medical record not available';
export const RECORD_ERROR_MESSAGE = "The medical record couldn't be printed. Please try again.";
const MISMATCH_MESSAGE = 'This medical record does not belong to the selected pet.';

const CLINIC = 'PawCruz Veterinary Clinic';
const SUBTITLE = 'Official Medical Record / Consultation Summary';
const ADDRESS = '2189 Stall G, Felimarc Pet Center, A. Luna St, Pasay City';
const CONTINUED = 'PawCruz Veterinary Clinic — Medical Record (continued)';

const str = (value) => {
  if (value === null || value === undefined) return '';
  const text = String(value).trim();
  return text === 'null' || text === 'undefined' ? '' : text;
};
const na = (value) => str(value) || 'N/A';
const withDr = (name) => {
  const bare = str(name).replace(/^(?:dr\.\s*|dr\s+)+/i, '').trim();
  return bare ? `Dr. ${bare}` : 'N/A';
};
const dayFormat = (value) => {
  const day = str(value).slice(0, 10);
  if (!day) return '';
  const date = new Date(`${day}T12:00:00`);
  return Number.isNaN(date.getTime()) ? str(value) : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};
// "October 8, 2026" (same as the web's printed record).
const longDay = (value) => {
  const day = str(value).slice(0, 10);
  if (!day) return '';
  const date = new Date(`${day}T12:00:00`);
  return Number.isNaN(date.getTime()) ? str(value) : date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
};
const timeFormat = (value) => {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '';
};
// Adds the unit unless the value already has it ("6.8 kg" stays "6.8 kg").
const withUnit = (value, unit) => {
  const text = str(value);
  if (!text) return '';
  return text.toLowerCase().endsWith(unit.toLowerCase()) ? text : `${text} ${unit}`;
};

// ---------- Document model (shared by the PDF and HTML renderers) ----------
// section = { title, grid: [[label, value, full?]] }
//         | { title, table: { headers, widths, rows } }
//         | { title, groups: [{ heading, grid }] }
//         | { title, empty: 'N/A' }

function buildModel({ record, pet, owner, vet }) {
  const template = getRecordTemplate(record);
  const data = parseJsonColumn(record.template_data, {});
  const sex = str(pet?.sex);
  const dob = longDay(pet?.date_of_birth);
  const license = na(vet?.license_number);
  const rawAge = petAgeText(pet?.date_of_birth);
  const age = rawAge && !/old$/i.test(rawAge) ? `${rawAge} old` : rawAge;

  const sections = [
    { title: 'Animal Patient Information', grid: [
      ['Pet Name', na(pet?.pet_name)],
      ['Species / Breed', [str(pet?.species), str(pet?.breed)].filter(Boolean).join(' / ') || 'N/A'],
      ['Sex', na(sex)],
      ['Date of Birth / Age', [dob, age].filter(Boolean).join(' · ') || 'N/A'],
      ['Weight on File (kg)', na(pet?.weight)],
      ['Color / Markings', na(pet?.color)],
      ['Microchip Number', na(pet?.microchip_number)],
    ] },
    { title: 'Pet Owner Information', grid: [
      ['Full Name', na(owner?.full_name || owner?.username)],
      ['Contact Number', na(owner?.phone)],
      ['Email', na(owner?.email)],
      ['Address', na(owner?.address)],
    ] },
    { title: 'Attending Veterinarian', grid: [
      ['Attending Veterinarian', withDr(vet?.full_name || vet?.username)],
      ['Veterinarian Contact Number', na(vet?.phone)],
      ['Veterinary License Number', license],
    ] },
  ];

  if (template.key === 'parasite-prevention') {
    const rows = parseJsonColumn(record.parasite_treatments, []).map((row) => [na(dayFormat(row.date)), na(row.treatment)]);
    sections.push({ title: 'Parasite Prevention', table: { headers: ['DATE', 'TREATMENT'], widths: [0.3, 0.7], rows } });
  } else if (template.key === 'heartworm') {
    const rows = parseJsonColumn(record.heartworm_tests, []).map((row) => [na(dayFormat(row.date)), na(row.result)]);
    sections.push({ title: 'Heartworm Tests and Prevention', table: { headers: ['DATE', 'RESULT'], widths: [0.4, 0.6], rows } });
  } else if (template.key === 'vaccination') {
    const entries = parseJsonColumn(record.vaccination_records, []);
    sections.push(entries.length ? {
      title: 'Vaccination Record',
      groups: entries.map((entry, index) => {
        const given = VACCINE_FIELDS.filter(([key]) => entry[key] === true || entry[key] === 'true').map(([, label]) => label);
        const grid = [
          ['Date', na(dayFormat(entry.date))],
          ['Age', na(entry.age)],
          ['Weight', na(withUnit(entry.weight, 'kg'))],
          ['Vaccines Given', given.join(', ') || 'N/A', true],
        ];
        if (str(entry.others)) grid.push(['Others', str(entry.others), true]);
        if (str(entry.administeredBy)) grid.push(['Administered By / Signature', str(entry.administeredBy), true]);
        return { heading: entries.length > 1 ? `Vaccination ${index + 1}` : '', grid };
      }),
    } : { title: 'Vaccination Record', empty: 'N/A' });
  } else if (template.key === 'dental') {
    sections.push(
      { title: 'Dental Examination', grid: [
        ...DENTAL_FIELDS.slice(0, 4).map(([key, label]) => [label, na(data[key])]),
        ['Dental Chart and Findings', na(data.dentalChart), true],
        ['Periodontal Disease / Other Comment', na(data.periodontalNotes), true],
      ] },
      { title: 'Dental Treatment', grid: [['Treatment', na(record.treatment), true]] },
    );
  } else {
    sections.push(
      { title: 'Chief Complaint & Symptoms', grid: [
        ['Chief Complaint', na(record.chief_complaint), true],
        ['Symptoms', na(record.symptoms), true],
      ] },
      { title: 'Vital Signs', grid: [
        ['Vital Signs', na(record.vital_signs), true],
        ['Weight (kg)', na(record.weight)],
        ['Temperature (°C)', na(record.temperature)],
      ] },
      { title: 'Diagnosis', grid: [['Diagnosis', na(record.diagnosis), true]] },
      { title: 'Treatment', grid: [
        ['Treatment', na(record.treatment), true],
        ['Treatment Plan', na(record.treatment_plan), true],
      ] },
      { title: 'Medications', grid: [
        ['Medication', na(record.medication)],
        ['Dosage', na(record.dosage)],
        ['Frequency', na(record.frequency)],
        ['Duration', na(record.duration)],
      ] },
      { title: 'Laboratory', grid: [
        ['Laboratory Request', na(record.laboratory_request), true],
        ['Laboratory Result', na(record.laboratory_result), true],
      ] },
    );
  }

  const items = (Array.isArray(data.inventoryItems) ? data.inventoryItems : [])
    .filter((item) => item && typeof item === 'object' && !item.isNA)
    .map((item) => [na(item.item_name), na(item.category), str(item.quantity) || '1']);
  sections.push(items.length
    ? { title: 'Services, Tests & Prescribed Medicines', table: { headers: ['ITEM', 'CATEGORY', 'QTY'], widths: [0.55, 0.3, 0.15], rows: items } }
    : { title: 'Services, Tests & Prescribed Medicines', empty: 'N/A' });

  const finalized = str(record.record_status).toLowerCase() === 'finalized';
  sections.push(
    { title: 'Veterinarian Notes', grid: [['Notes', na(record.veterinarian_notes), true]] },
    { title: 'Follow-up', grid: [['Follow-up Date', na(longDay(record.follow_up_date))]] },
    { title: 'Consultation Status', grid: [['Status', finalized ? 'Finalized / Completed' : 'Draft']] },
  );

  return {
    recordNo: `MR-${str(record.id).slice(0, 8).toUpperCase()}`,
    dateTime: [longDay(record.consultation_date), timeFormat(record.created_at)].filter(Boolean).join(' · ') || 'N/A',
    finalized,
    vetName: withDr(vet?.full_name || vet?.username),
    vetLicense: license,
    petName: str(pet?.pet_name),
    consultationDay: str(record.consultation_date).slice(0, 10),
    sections,
  };
}

export function recordFileName({ record, pet }) {
  const clean = (value) => str(value).replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return `Medical-Record-${clean(pet?.pet_name) || 'Pet'}-${clean(str(record?.consultation_date).slice(0, 10)) || 'Consultation'}.pdf`;
}

// ---------- Pet photo as a data URL (PNG/JPEG), or null for "No Photo" ----------

async function webPhoto(url) {
  // Draw through a canvas so any browser-supported format (webp, avif) becomes JPEG.
  return new Promise((resolve) => {
    const img = new window.Image();
    img.crossOrigin = 'anonymous';
    const timer = setTimeout(() => resolve(null), 8000);
    img.onload = () => {
      clearTimeout(timer);
      try {
        const size = 360;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, size, size);
        const side = Math.min(img.naturalWidth, img.naturalHeight);
        ctx.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, size, size);
        resolve(canvas.toDataURL('image/jpeg', 0.88));
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => { clearTimeout(timer); resolve(null); };
    img.src = url;
  });
}

async function nativePhoto(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const blob = await response.blob();
    const dataUrl = await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => resolve('');
      reader.readAsDataURL(blob);
    });
    // jsPDF and every print engine handle PNG/JPEG; anything else shows "No Photo".
    return /^data:image\/(png|jpe?g);base64,/i.test(dataUrl) ? dataUrl : null;
  } catch {
    return null;
  }
}

async function loadPhoto(url) {
  if (!str(url)) return null;
  return Platform.OS === 'web' ? webPhoto(url) : nativePhoto(url);
}

// ---------- jsPDF renderer ----------

const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN = 15;
const CONTENT_W = PAGE_W - MARGIN * 2;
const BOTTOM = PAGE_H - 22; // keep clear of the footer
const BLUE = [37, 80, 101];
const GREY = [97, 118, 127];
const DARK = [30, 49, 58];

function renderPdf(model, photo) {
  if (!jsPDF) throw new Error('jsPDF is only available on web.');
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
  let y = MARGIN;

  const newPage = () => {
    pdf.addPage();
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8.5);
    pdf.setTextColor(...BLUE);
    pdf.text(CONTINUED, MARGIN, MARGIN);
    pdf.setDrawColor(210, 224, 231);
    pdf.setLineWidth(0.3);
    pdf.line(MARGIN, MARGIN + 2.5, PAGE_W - MARGIN, MARGIN + 2.5);
    y = MARGIN + 9;
  };
  const ensure = (height) => {
    if (y + height > BOTTOM) newPage();
  };

  // Masthead: photo box + clinic text.
  const box = 28;
  let photoDrawn = false;
  if (photo) {
    try {
      pdf.addImage(photo, /png/i.test(photo.slice(0, 30)) ? 'PNG' : 'JPEG', MARGIN, y, box, box);
      photoDrawn = true;
    } catch {
      photoDrawn = false;
    }
  }
  pdf.setDrawColor(180, 205, 217);
  pdf.setLineWidth(0.3);
  if (!photoDrawn) {
    pdf.setFillColor(238, 242, 245);
    pdf.rect(MARGIN, y, box, box, 'FD');
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8);
    pdf.setTextColor(...GREY);
    pdf.text('No Photo', MARGIN + box / 2, y + box / 2 + 1, { align: 'center' });
  } else {
    pdf.rect(MARGIN, y, box, box);
  }
  // PawCruz paw-with-heart logo next to the clinic name (same as the web).
  const pawSize = 10;
  const pawX = MARGIN + box + 4;
  try {
    pdf.addImage(PAW_LOGO, 'PNG', pawX, y + 0.5, pawSize, pawSize);
  } catch {
    // the clinic name still prints without the logo
  }
  const textX = pawX + pawSize + 3;
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(16);
  pdf.setTextColor(...BLUE);
  pdf.text(CLINIC, textX, y + 8);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(10);
  pdf.setTextColor(...GREY);
  pdf.text(SUBTITLE, textX, y + 15);
  pdf.setFontSize(8);
  pdf.text(ADDRESS, textX, y + 21);
  y += box + 6;
  pdf.setDrawColor(214, 228, 235);
  pdf.setLineWidth(0.3);
  pdf.line(MARGIN, y, PAGE_W - MARGIN, y);
  y += 8;

  // Record number, date and status badge.
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(9.5);
  pdf.setTextColor(...DARK);
  pdf.text(`Medical Record No: ${model.recordNo}`, MARGIN, y);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);
  pdf.setTextColor(...GREY);
  const dateLabel = 'Consultation Date & Time:';
  pdf.text(dateLabel, MARGIN, y + 6);
  pdf.setFont('helvetica', 'bold');
  pdf.setTextColor(...DARK);
  pdf.text(model.dateTime, MARGIN + pdf.getTextWidth(dateLabel) + 3, y + 6);
  const badge = model.finalized ? 'FINALIZED' : 'DRAFT';
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(8.5);
  const badgeW = pdf.getTextWidth(badge) + 8;
  if (model.finalized) pdf.setFillColor(220, 252, 231); else pdf.setFillColor(255, 244, 220);
  pdf.roundedRect(PAGE_W - MARGIN - badgeW, y - 4.2, badgeW, 6.5, 3, 3, 'F');
  if (model.finalized) pdf.setTextColor(22, 101, 52); else pdf.setTextColor(154, 106, 18);
  pdf.text(badge, PAGE_W - MARGIN - badgeW / 2, y + 0.3, { align: 'center' });
  y += 12;
  pdf.setDrawColor(214, 228, 235);
  pdf.setLineWidth(0.3);
  pdf.line(MARGIN, y, PAGE_W - MARGIN, y);
  y += 10;

  // Blue section title with a thin rule under it. nextHeight = the first row
  // of the section, so a title never sits alone at the bottom of a page.
  const titleBar = (title, nextHeight = 12) => {
    ensure(10 + nextHeight);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(11);
    pdf.setTextColor(...BLUE);
    pdf.text(title.toUpperCase(), MARGIN, y);
    pdf.setDrawColor(214, 228, 235);
    pdf.setLineWidth(0.3);
    pdf.line(MARGIN, y + 2.5, PAGE_W - MARGIN, y + 2.5);
    y += 9;
  };

  // A label/value cell; returns its height. Measures only when draw is false.
  const LINE = 4.3;
  const cell = (label, value, x, width, draw, plain = false) => {
    pdf.setFont('helvetica', plain ? 'normal' : 'bold');
    pdf.setFontSize(9.5);
    const lines = pdf.splitTextToSize(value, width);
    if (draw) {
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(7.5);
      pdf.setTextColor(...GREY);
      pdf.text(label.toUpperCase(), x, y);
    }
    return { lines, height: 3 + lines.length * LINE };
  };

  // Value lines are drawn one by one at exactly LINE spacing, so the measured
  // height always matches what is printed.
  const drawLines = (lines, x, top, plain = false) => {
    pdf.setFont('helvetica', plain ? 'normal' : 'bold');
    pdf.setFontSize(9.5);
    pdf.setTextColor(...DARK);
    lines.forEach((line, i) => pdf.text(line, x, top + i * LINE));
  };

  const drawGrid = (grid) => {
    const colW = (CONTENT_W - 8) / 2;
    let index = 0;
    while (index < grid.length) {
      const [label, value, full] = grid[index];
      const pair = !full && grid[index + 1] && !grid[index + 1][2] ? grid[index + 1] : null;
      const cells = pair
        ? [{ label, value, x: MARGIN, w: colW }, { label: pair[0], value: pair[1], x: MARGIN + colW + 8, w: colW }]
        : [{ label, value, x: MARGIN, w: full ? CONTENT_W : colW }];
      const measured = cells.map((c) => cell(c.label, c.value, c.x, c.w, false, Boolean(full)));
      const rowHeight = Math.max(...measured.map((m) => m.height));

      if (!pair && y + rowHeight > BOTTOM && measured[0].lines.length > 4) {
        // Long text: start right here and continue on the next page(s).
        const c = cells[0];
        ensure(4 + LINE * 2);
        cell(c.label, c.value, c.x, c.w, true);
        let lineY = y + 4;
        measured[0].lines.forEach((line) => {
          if (lineY > BOTTOM) {
            newPage();
            lineY = y;
          }
          drawLines([line], c.x, lineY, Boolean(full));
          lineY += LINE;
        });
        y = lineY - LINE + 3.5;
      } else {
        ensure(rowHeight + 2);
        cells.forEach((c, i) => {
          cell(c.label, c.value, c.x, c.w, true);
          drawLines(measured[i].lines, c.x, y + 4, Boolean(full));
        });
        y += rowHeight + 4;
      }
      index += pair ? 2 : 1;
    }
    y += 2;
  };

  const drawTable = ({ headers, widths, rows }) => {
    const cols = widths.map((w) => w * CONTENT_W);
    const header = () => {
      pdf.setFillColor(238, 247, 252);
      pdf.rect(MARGIN, y, CONTENT_W, 6.5, 'F');
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(8);
      pdf.setTextColor(...BLUE);
      let x = MARGIN + 2;
      headers.forEach((h, i) => { pdf.text(h, x, y + 4.4); x += cols[i]; });
      y += 8;
    };
    ensure(16);
    header();
    if (!rows.length) {
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(9);
      pdf.setTextColor(...GREY);
      pdf.text('N/A', MARGIN + 2, y + 2);
      y += 7;
      return;
    }
    rows.forEach((row) => {
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(9);
      const wrapped = row.map((value, i) => pdf.splitTextToSize(value, cols[i] - 4));
      const height = Math.max(...wrapped.map((l) => l.length)) * LINE + 2.5;
      if (y + height > BOTTOM) { newPage(); header(); }
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(9);
      pdf.setTextColor(...DARK);
      let x = MARGIN + 2;
      wrapped.forEach((lines, i) => { lines.forEach((line, n) => pdf.text(line, x, y + 2 + n * LINE)); x += cols[i]; });
      y += height;
      pdf.setDrawColor(226, 236, 241);
      pdf.setLineWidth(0.2);
      pdf.line(MARGIN, y - 1, PAGE_W - MARGIN, y - 1);
    });
    y += 7;
  };

  // Height of a section's first row, so its title moves with it.
  const firstRowHeight = (section) => {
    const first = section.grid?.[0] || section.groups?.[0]?.grid?.[0];
    if (!first) return 16;
    const width = first[2] ? CONTENT_W : (CONTENT_W - 8) / 2;
    return Math.min(cell(first[0], first[1], MARGIN, width, false, Boolean(first[2])).height, 40) + 6;
  };

  model.sections.forEach((section) => {
    titleBar(section.title, firstRowHeight(section));
    if (section.grid) drawGrid(section.grid);
    else if (section.table) drawTable(section.table);
    else if (section.groups) {
      section.groups.forEach((group) => {
        if (group.heading) {
          ensure(14);
          pdf.setFont('helvetica', 'bold');
          pdf.setFontSize(9);
          pdf.setTextColor(...BLUE);
          pdf.text(group.heading, MARGIN, y);
          y += 5;
        }
        drawGrid(group.grid);
      });
    } else {
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(9);
      pdf.setTextColor(...GREY);
      pdf.text(section.empty || 'N/A', MARGIN, y + 1);
      y += 8;
    }
  });

  // Signature, bottom right of the last page.
  ensure(32);
  y = Math.min(BOTTOM - 16, y + 16);
  const sigW = 78;
  const sigX = PAGE_W - MARGIN - sigW;
  pdf.setDrawColor(...DARK);
  pdf.setLineWidth(0.3);
  pdf.line(sigX, y, PAGE_W - MARGIN, y);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(10);
  pdf.setTextColor(...DARK);
  const sigMid = sigX + sigW / 2;
  pdf.text(model.vetName, sigMid, y + 5, { align: 'center' });
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8);
  pdf.setTextColor(...GREY);
  pdf.text('Attending Veterinarian', sigMid, y + 9.5, { align: 'center' });
  pdf.text(`License No.: ${model.vetLicense}`, sigMid, y + 13.5, { align: 'center' });

  // Footer on every page.
  const printed = `Printed: ${new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}`;
  const pages = pdf.getNumberOfPages();
  for (let page = 1; page <= pages; page += 1) {
    pdf.setPage(page);
    pdf.setDrawColor(226, 236, 241);
    pdf.setLineWidth(0.3);
    pdf.line(MARGIN, PAGE_H - 14, PAGE_W - MARGIN, PAGE_H - 14);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7.5);
    pdf.setTextColor(...GREY);
    pdf.text(printed, MARGIN, PAGE_H - 9.5);
    pdf.text(`Page ${page} of ${pages}`, PAGE_W - MARGIN, PAGE_H - 9.5, { align: 'right' });
  }
  return pdf;
}

// ---------- HTML renderer (native fallback only) ----------

const esc = (value) => str(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function renderHtml(model, photo) {
  const grid = (rows) => `<div class="grid">${rows.map(([label, value, full]) =>
    `<div class="cell${full ? ' full' : ''}"><div class="label">${esc(label)}</div><div class="value">${esc(value)}</div></div>`).join('')}</div>`;
  const table = ({ headers, widths, rows }) => `<table><tr>${headers.map((h, i) => `<th style="width:${widths[i] * 100}%">${esc(h)}</th>`).join('')}</tr>${
    rows.length ? rows.map((row) => `<tr>${row.map((v) => `<td>${esc(v)}</td>`).join('')}</tr>`).join('') : `<tr><td colspan="${headers.length}">N/A</td></tr>`}</table>`;
  const sections = model.sections.map((section) => `<section><h2>${esc(section.title)}</h2>${
    section.grid ? grid(section.grid)
      : section.table ? table(section.table)
        : section.groups ? section.groups.map((g) => `${g.heading ? `<h3>${esc(g.heading)}</h3>` : ''}${grid(g.grid)}`).join('')
          : `<p class="muted">${esc(section.empty || 'N/A')}</p>`}</section>`).join('');
  const printed = new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
  return `<!doctype html><html><head><meta charset="utf-8" /><style>
    @page { size: A4; margin: 15mm 15mm 20mm; }
    body { font-family: Helvetica, Arial, sans-serif; color: #1e313a; margin: 0; font-size: 9.5pt; }
    .mast { display: flex; gap: 6mm; align-items: flex-start; padding-bottom: 5mm; border-bottom: 1px solid #d6e4eb; }
    .paw { flex-shrink: 0; width: 10mm; height: 10mm; margin-top: 0.5mm; }
    .photo { width: 28mm; height: 28mm; border: 1px solid #b4cdd9; object-fit: cover; }
    .nophoto { width: 28mm; height: 28mm; border: 1px solid #b4cdd9; background: #eef2f5; color: #61767f; font-weight: bold; font-size: 8pt; display: flex; align-items: center; justify-content: center; }
    h1 { margin: 0; color: #255065; font-size: 16pt; }
    .sub { color: #61767f; font-size: 10pt; margin-top: 2px; }
    .addr { color: #61767f; font-size: 8pt; margin-top: 2px; }
    .meta { display: flex; justify-content: space-between; align-items: center; margin-top: 5mm; padding-bottom: 5mm; border-bottom: 1px solid #d6e4eb; }
    .meta .when { margin-top: 2mm; color: #61767f; } .meta .when b { color: #1e313a; margin-left: 2mm; }
    .badge { border-radius: 99px; padding: 3px 10px; font-weight: bold; font-size: 8.5pt; }
    .final { background: #dcfce7; color: #166534; } .draft { background: #fff4dc; color: #9a6a12; }
    section { margin-top: 7mm; }
    h2 { color: #255065; font-size: 11pt; text-transform: uppercase; margin: 0 0 4mm; padding-bottom: 1.5mm; border-bottom: 1px solid #d6e4eb; break-after: avoid; page-break-after: avoid; }
    h3 { color: #255065; font-size: 9pt; margin: 2mm 0; }
    .grid { display: flex; flex-wrap: wrap; column-gap: 8mm; }
    .cell { width: calc(50% - 4mm); margin-bottom: 2.5mm; break-inside: avoid; }
    .cell.full { width: 100%; }
    .label { color: #61767f; font-size: 7.5pt; text-transform: uppercase; }
    .value { font-weight: bold; word-break: break-word; white-space: pre-wrap; }
    .cell.full .value { font-weight: normal; }
    table { width: 100%; border-collapse: collapse; }
    th { text-align: left; background: #eef7fc; color: #255065; font-size: 8pt; padding: 1.5mm 2mm; }
    td { padding: 1.5mm 2mm; border-bottom: 1px solid #e2ecf1; word-break: break-word; }
    .muted { color: #61767f; }
    .sig { margin: 14mm 0 0 auto; width: 78mm; text-align: center; break-inside: avoid; page-break-inside: avoid; }
    .sig .line { border-top: 1px solid #1e313a; margin-bottom: 1.5mm; }
    .sig .role { color: #61767f; font-size: 7.5pt; }
    .printed { margin-top: 8mm; color: #61767f; font-size: 7.5pt; }
  </style></head><body>
    <div class="mast">${photo ? `<img class="photo" src="${photo}" />` : '<div class="nophoto">No Photo</div>'}
      <img class="paw" src="${PAW_LOGO}" /><div><h1>${CLINIC}</h1><div class="sub">${SUBTITLE}</div><div class="addr">${ADDRESS}</div></div></div>
    <div class="meta"><div><b>Medical Record No: ${esc(model.recordNo)}</b><div class="when">Consultation Date &amp; Time:<b>${esc(model.dateTime)}</b></div></div>
      <span class="badge ${model.finalized ? 'final' : 'draft'}">${model.finalized ? 'FINALIZED' : 'DRAFT'}</span></div>
    ${sections}
    <div class="sig"><div class="line"></div><b>${esc(model.vetName)}</b><div class="role">Attending Veterinarian</div><div class="role">License No.: ${esc(model.vetLicense)}</div></div>
    <div class="printed">Printed: ${esc(printed)}</div>
  </body></html>`;
}

// ---------- Public API ----------

// Prints one consultation. Web returns { blockedUrl, download } when the
// popup blocker stopped the new tab, so the caller can show it in-app.
export async function printMedicalRecordPdf({ record, pet, owner, vet }) {
  if (!record) throw new Error(RECORD_ERROR_MESSAGE);
  if (pet?.id && record.pet_id && String(record.pet_id) !== String(pet.id)) throw new Error(MISMATCH_MESSAGE);

  const model = buildModel({ record, pet, owner, vet });
  const photo = await loadPhoto(pet?.photo_url);
  const fileName = recordFileName({ record, pet });

  if (Platform.OS === 'web') {
    const pdf = renderPdf(model, photo);
    const url = String(pdf.output('bloburl'));
    const opened = window.open(url, '_blank');
    return opened ? {} : { blockedUrl: url, download: () => pdf.save(fileName) };
  }

  let { uri } = await Print.printToFileAsync({ html: renderHtml(model, photo), width: 595, height: 842 });
  // Give the file its proper name for sharing; keep the temp name if that fails.
  if (FileSystem.cacheDirectory) {
    const named = `${FileSystem.cacheDirectory}${fileName}`;
    try {
      await FileSystem.deleteAsync(named, { idempotent: true });
      await FileSystem.moveAsync({ from: uri, to: named });
      uri = named;
    } catch {
      // keep the temporary file
    }
  }
  await Print.printAsync({ uri });
  return { shareUri: uri };
}

// Native: save/share the PDF printMedicalRecordPdf made.
export async function shareMedicalRecordPdf(uri) {
  if (!uri || !(await Sharing.isAvailableAsync())) return;
  await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: 'Save medical record' });
}

// For checks/tests: the PDF without opening it.
export function buildMedicalRecordPdf(input, photo = null) {
  return renderPdf(buildModel(input), photo);
}
