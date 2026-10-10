import React from 'react';
import { Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { formatMedicalDate } from '../api/medicalRecordService';
import {
  DENTAL_FIELDS,
  VACCINE_FIELDS,
  displayValue,
  getRecordTemplate,
  parseJsonColumn,
} from '../constants/medicalRecordTemplates';

// The body of a medical record, laid out by its own template (the same
// sections as the web Animal Patients -> Medical History). Shared by the pet
// owner and veterinarian screens. Empty fields and sections are hidden.

const dateText = (value) => (displayValue(value) ? formatMedicalDate(value) : '');

function Field({ label, value }) {
  const text = displayValue(value);
  if (!text) return null;
  return (
    <View style={s.field}>
      <Text style={s.label}>{label}</Text>
      <Text style={s.value}>{text}</Text>
    </View>
  );
}

function Section({ title, children }) {
  return (
    <View style={s.section}>
      <Text style={s.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function HealthRecord({ record }) {
  const weight = displayValue(record.weight);
  const temperature = displayValue(record.temperature);
  const vitals = displayValue(record.vital_signs);
  const hasVitals = weight || temperature || vitals;
  return (
    <>
      <Field label="Chief Complaint" value={record.chief_complaint} />
      <Field label="Symptoms" value={record.symptoms} />
      {hasVitals ? (
        <View style={s.field}>
          <Text style={s.label}>Vital Signs</Text>
          {weight || temperature ? (
            <View style={s.inlineRow}>
              {weight ? <Text style={s.value}>Weight: {weight} kg</Text> : null}
              {temperature ? <Text style={s.value}>Temperature: {temperature} °C</Text> : null}
            </View>
          ) : null}
          {vitals ? <Text style={s.value}>{vitals}</Text> : null}
        </View>
      ) : null}
      <Field label="Diagnosis" value={record.diagnosis} />
      <Field label="Treatment" value={record.treatment} />
      <Field label="Treatment Plan" value={record.treatment_plan} />
      <Field label="Medications" value={record.medication} />
      <Field label="Laboratory Results" value={record.laboratory_result} />
    </>
  );
}

function ParasitePrevention({ record }) {
  const rows = parseJsonColumn(record.parasite_treatments, [])
    .filter((row) => displayValue(row.date) || displayValue(row.treatment));
  if (!rows.length) return null;
  return (
    <Section title="Parasite Treatments">
      {rows.map((row, index) => (
        <View key={index} style={[s.listRow, index === 0 && s.listRowFirst]}>
          <Text style={s.listDate}>{dateText(row.date) || 'No date'}</Text>
          <Text style={s.listMain}>{displayValue(row.treatment) || '—'}</Text>
        </View>
      ))}
    </Section>
  );
}

function Heartworm({ record }) {
  const rows = parseJsonColumn(record.heartworm_tests, [])
    .filter((row) => displayValue(row.date) || displayValue(row.result));
  if (!rows.length) return null;
  return (
    <Section title="Heartworm Tests">
      {rows.map((row, index) => {
        const result = displayValue(row.result);
        const tone = /^neg/i.test(result) ? 'good' : /^pos/i.test(result) ? 'bad' : '';
        return (
          <View key={index} style={[s.listRow, s.listRowInline, index === 0 && s.listRowFirst]}>
            <Text style={s.listDate}>{dateText(row.date) || 'No date'}</Text>
            {result ? (
              <View style={[s.pill, tone === 'good' && s.pillGood, tone === 'bad' && s.pillBad]}>
                <Text style={[s.pillText, tone === 'good' && s.pillGoodText, tone === 'bad' && s.pillBadText]}>{result}</Text>
              </View>
            ) : null}
          </View>
        );
      })}
    </Section>
  );
}

function Dental({ record }) {
  const data = parseJsonColumn(record.template_data, {});
  return (
    <>
      {DENTAL_FIELDS.map(([key, label]) => <Field key={key} label={label} value={data[key]} />)}
      <Field label="Dental Treatment" value={record.treatment} />
    </>
  );
}

function Vaccination({ record }) {
  const rows = parseJsonColumn(record.vaccination_records, []);
  if (!rows.length) return null;
  return (
    <Section title="Vaccinations">
      {rows.map((row, index) => {
        const given = VACCINE_FIELDS.filter(([key]) => row[key] === true || row[key] === 'true').map(([, label]) => label);
        const others = displayValue(row.others);
        const meta = [
          dateText(row.date),
          displayValue(row.age) ? `Age ${displayValue(row.age)}` : '',
          displayValue(row.weight) ? `${displayValue(row.weight)} kg` : '',
        ].filter(Boolean).join(' · ');
        return (
          <View key={index} style={[s.listRow, index === 0 && s.listRowFirst]}>
            {meta ? <Text style={s.listDate}>{meta}</Text> : null}
            {given.length || others ? (
              <View style={s.chips}>
                {given.map((label) => (
                  <View key={label} style={s.chip}><Text style={s.chipText}>{label}</Text></View>
                ))}
                {others ? <View style={s.chip}><Text style={s.chipText}>{others}</Text></View> : null}
              </View>
            ) : (
              <Text style={s.muted}>No vaccines checked</Text>
            )}
            {displayValue(row.administeredBy) ? (
              <Text style={s.signature}>Veterinarian's Signature: {displayValue(row.administeredBy)}</Text>
            ) : null}
          </View>
        );
      })}
    </Section>
  );
}

const BODY_BY_TEMPLATE = {
  'health-record': HealthRecord,
  'parasite-prevention': ParasitePrevention,
  heartworm: Heartworm,
  dental: Dental,
  vaccination: Vaccination,
};

// True when the template-specific part has anything to show.
function hasTemplateData(record, key) {
  switch (key) {
    case 'parasite-prevention':
      return parseJsonColumn(record.parasite_treatments, []).some((row) => displayValue(row.date) || displayValue(row.treatment));
    case 'heartworm':
      return parseJsonColumn(record.heartworm_tests, []).some((row) => displayValue(row.date) || displayValue(row.result));
    case 'vaccination':
      return parseJsonColumn(record.vaccination_records, []).length > 0;
    case 'dental': {
      const data = parseJsonColumn(record.template_data, {});
      return DENTAL_FIELDS.some(([field]) => displayValue(data[field])) || Boolean(displayValue(record.treatment));
    }
    default:
      return ['chief_complaint', 'symptoms', 'vital_signs', 'weight', 'temperature', 'diagnosis', 'treatment',
        'treatment_plan', 'medication', 'laboratory_result'].some((field) => displayValue(record[field]));
  }
}

export default function MedicalRecordFields({ record }) {
  const template = getRecordTemplate(record);
  const Body = BODY_BY_TEMPLATE[template.key];
  const attachment = displayValue(record.attachment_url);
  const followUp = dateText(record.follow_up_date);
  const notes = displayValue(record.veterinarian_notes);
  const hasBody = hasTemplateData(record, template.key);

  return (
    <View>
      {hasBody ? <Body record={record} /> : null}

      {followUp ? <Field label="Follow-up Date" value={followUp} /> : null}
      <Field label="Veterinarian Notes" value={notes} />
      {attachment ? (
        <View style={s.field}>
          <Text style={s.label}>Attachment</Text>
          <TouchableOpacity onPress={() => Linking.openURL(attachment).catch(() => {})} activeOpacity={0.8}>
            <Text style={s.link}>Open attachment</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {!hasBody && !followUp && !notes && !attachment ? (
        <Text style={s.muted}>No details were recorded for this {template.label.toLowerCase()}.</Text>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  field: { marginBottom: 12 },
  label: { fontSize: 11, fontWeight: '800', letterSpacing: 0.4, textTransform: 'uppercase', color: '#5f7884', marginBottom: 3 },
  value: { fontSize: 14, lineHeight: 20, fontWeight: '700', color: '#1d3a4a' },
  inlineRow: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 16 },
  section: { marginBottom: 12 },
  sectionTitle: { fontSize: 13, fontWeight: '900', color: '#2c6ba3', marginBottom: 6 },
  listRow: { borderTopWidth: 1, borderTopColor: '#e6f0f5', paddingVertical: 9 },
  listRowFirst: { borderTopWidth: 0, paddingTop: 2 },
  listRowInline: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  listDate: { fontSize: 12, fontWeight: '800', color: '#5f7884' },
  listMain: { marginTop: 2, fontSize: 14, lineHeight: 20, fontWeight: '700', color: '#1d3a4a' },
  pill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3, backgroundColor: '#eef4f8' },
  pillText: { fontSize: 12, fontWeight: '800', color: '#4f7384' },
  pillGood: { backgroundColor: '#dcfce7' },
  pillGoodText: { color: '#166534' },
  pillBad: { backgroundColor: '#fee2e2' },
  pillBadText: { color: '#991b1b' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  chip: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, backgroundColor: 'rgba(44,107,163,0.1)' },
  chipText: { fontSize: 12, fontWeight: '800', color: '#2c6ba3' },
  signature: { marginTop: 6, fontSize: 12.5, fontWeight: '700', color: '#5f7884' },
  muted: { fontSize: 13, fontWeight: '600', color: '#7a95a7', marginBottom: 12 },
  link: { fontSize: 14, fontWeight: '800', color: '#2c6ba3', textDecorationLine: 'underline' },
});
