// Medical record templates, matching the web app's "Choose Template" list.
// `medical_records.record_template` stores the key.
export const MEDICAL_RECORD_TEMPLATES = {
  'health-record': { key: 'health-record', label: 'Health Record' },
  'parasite-prevention': { key: 'parasite-prevention', label: 'Parasite Prevention' },
  heartworm: { key: 'heartworm', label: 'Heartworm Tests & Prevention' },
  dental: { key: 'dental', label: 'Dental Record' },
  vaccination: { key: 'vaccination', label: 'Vaccination Record' },
};

export const DEFAULT_TEMPLATE_KEY = 'health-record';

// The template a record uses. Missing or unknown values count as Health Record.
export function getRecordTemplate(record) {
  const key = String(record?.record_template || '').trim();
  return MEDICAL_RECORD_TEMPLATES[key] || MEDICAL_RECORD_TEMPLATES[DEFAULT_TEMPLATE_KEY];
}

// Label for a template key, or '' when there is none (e.g. an appointment
// whose vet hasn't written a record yet).
export function templateLabelFor(key) {
  const value = String(key || '').trim();
  if (!value) return '';
  return (MEDICAL_RECORD_TEMPLATES[value] || MEDICAL_RECORD_TEMPLATES[DEFAULT_TEMPLATE_KEY]).label;
}

export const VACCINE_FIELDS = [
  ['distemper', 'Distemper'],
  ['parainfluenza', 'Parainfluenza'],
  ['adenovirus', 'Adenovirus'],
  ['parvovirus', 'Parvovirus'],
  ['leptospirosis', 'Leptospirosis'],
  ['coronavirus', 'Coronavirus'],
  ['bordetella', 'Bordetella'],
  ['rabies', 'Rabies'],
];

export const DENTAL_FIELDS = [
  ['gingiva', 'Gingiva'],
  ['occlusion', 'Occlusion'],
  ['salivation', 'Salivation'],
  ['halitosis', 'Halitosis'],
  ['dentalChart', 'Dental Chart & Findings'],
  ['periodontalNotes', 'Periodontal Disease / Other Comment'],
];

// JSON columns can arrive as objects/arrays or as JSON strings. Anything
// null, invalid or of the wrong shape becomes the empty fallback.
export function parseJsonColumn(value, fallback) {
  let parsed = value;
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value);
    } catch {
      return fallback;
    }
  }
  if (Array.isArray(fallback)) return Array.isArray(parsed) ? parsed.filter((item) => item && typeof item === 'object') : fallback;
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : fallback;
}

// A displayable value: trimmed text, or '' for null/undefined/"null"/blank.
export function displayValue(value) {
  if (value === null || value === undefined) return '';
  const text = String(value).trim();
  return text === 'null' || text === 'undefined' ? '' : text;
}
