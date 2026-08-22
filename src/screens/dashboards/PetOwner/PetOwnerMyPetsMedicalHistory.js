import React, { useState } from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import { styles } from '../../styles/PetOwnerMyPetsDesign';
import { formatMedicalDate, formatMedicalTime12h } from '../../../api/medicalRecordService';
import { generateConsultationHealthInsight } from '../../../api/aiService';
import { parseConsultationInsight, splitRiskName, toListItems, toSentences } from '../../../utils/predictiveHealthParsing';

const RISK_STYLE = {
  Low: { badge: 'statusBadgeGood', text: 'statusBadgeGoodText' },
  Moderate: { badge: 'statusBadgeWarn', text: 'statusBadgeWarnText' },
  High: { badge: 'statusBadgeRisk', text: 'statusBadgeRiskText' },
};

function Field({ label, value }) {
  return (
    <View style={styles.fieldBlock}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={styles.fieldValue}>{value || 'Not recorded'}</Text>
    </View>
  );
}

function ConsultationAiInsight({ record, previousRecords, onRiskLevel }) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState({ loading: false, error: '', text: '', loaded: false });

  const load = async () => {
    setState((s) => ({ ...s, loading: true, error: '' }));
    try {
      const text = await generateConsultationHealthInsight(record, previousRecords);
      const parsed = parseConsultationInsight(text);
      onRiskLevel?.(parsed.riskLevel);
      setState({ loading: false, error: '', text, loaded: true });
    } catch (e) {
      setState((s) => ({ ...s, loading: false, error: e?.message || 'Unable to generate the AI health insight.' }));
    }
  };

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && !state.loaded && !state.loading) load();
  };

  const { sections, disclaimer } = state.text ? parseConsultationInsight(state.text) : { sections: {}, disclaimer: '' };
  const findings = toSentences((sections['RECORDED HEALTH FINDINGS'] || []).join(' '));
  const risks = toListItems(sections['POTENTIAL HEALTH RISKS TO MONITOR'] || []);
  const warnings = toSentences((sections['WARNING SIGNS'] || []).join(' '));
  const monitoring = toListItems(sections['RECOMMENDED MONITORING AND FOLLOW-UP'] || []);
  const comparison = toSentences((sections['COMPARISON WITH PREVIOUS CONSULTATIONS'] || []).join(' '));

  return (
    <View>
      <TouchableOpacity
        style={styles.aiInsightToggle}
        onPress={toggle}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel={`${open ? 'Collapse' : 'Expand'} AI health insight`}
      >
        <Text style={styles.aiInsightToggleLabel}>AI Health Insight</Text>
        <Text style={styles.chevronText}>{open ? '−' : '+'}</Text>
      </TouchableOpacity>

      {open ? (
        <View style={styles.aiInsightPanel}>
          {state.loading ? (
            <View style={styles.aiLoadingRow}>
              <ActivityIndicator color="#4da8da" />
              <Text style={styles.aiLoadingText}>Generating AI health insight...</Text>
            </View>
          ) : null}

          {!state.loading && state.error ? (
            <View style={styles.aiErrorBox}>
              <Text style={styles.aiErrorText}>{state.error}</Text>
              <TouchableOpacity style={styles.aiRetryButton} onPress={load} activeOpacity={0.85}>
                <Text style={styles.aiRetryText}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {!state.loading && !state.error && state.text ? (
            <>
              <View style={styles.aiSectionBlock}>
                <Text style={styles.aiSectionLabel}>Recorded Health Findings</Text>
                {findings.length ? (
                  findings.map((line, i) => (
                    <View key={i} style={styles.aiBulletRow}>
                      <View style={styles.aiBulletDot} />
                      <Text style={styles.aiBulletText}>{line}</Text>
                    </View>
                  ))
                ) : (
                  <Text style={styles.aiMutedText}>Nothing beyond what's already shown above was recorded.</Text>
                )}
              </View>

              <View style={styles.aiSectionBlock}>
                <Text style={styles.aiSectionLabel}>Potential Health Risks</Text>
                {risks.length ? (
                  risks.map((sentence, i) => {
                    const { name, detail } = splitRiskName(sentence);
                    return (
                      <View key={i} style={styles.aiRiskRow}>
                        <Text style={styles.aiRiskName}>{name}</Text>
                        {detail ? <Text style={styles.aiRiskDetail}>{detail}</Text> : null}
                      </View>
                    );
                  })
                ) : (
                  <Text style={styles.aiMutedText}>No specific risks were flagged from this consultation.</Text>
                )}
              </View>

              <View style={styles.aiSectionBlock}>
                <Text style={styles.aiSectionLabel}>Warning Signs</Text>
                {warnings.length ? (
                  warnings.map((line, i) => (
                    <View key={i} style={styles.aiBulletRow}>
                      <View style={styles.aiBulletDot} />
                      <Text style={styles.aiBulletText}>{line}</Text>
                    </View>
                  ))
                ) : (
                  <Text style={styles.aiMutedText}>No specific warning signs were identified.</Text>
                )}
              </View>

              <View style={styles.aiSectionBlock}>
                <Text style={styles.aiSectionLabel}>Recommended Monitoring</Text>
                {monitoring.length ? (
                  monitoring.map((line, i) => (
                    <View key={i} style={styles.aiCheckRow}>
                      <View style={styles.aiCheckMark}>
                        <Text style={styles.aiCheckMarkText}>{'✓'}</Text>
                      </View>
                      <Text style={styles.aiBulletText}>{line}</Text>
                    </View>
                  ))
                ) : (
                  <Text style={styles.aiMutedText}>No follow-up steps were returned.</Text>
                )}
              </View>

              <View style={[styles.aiSectionBlock, { marginBottom: 0 }]}>
                <Text style={styles.aiSectionLabel}>Comparison with Previous Consultations</Text>
                {comparison.length ? (
                  comparison.map((line, i) => (
                    <View key={i} style={styles.aiBulletRow}>
                      <View style={styles.aiBulletDot} />
                      <Text style={styles.aiBulletText}>{line}</Text>
                    </View>
                  ))
                ) : (
                  <Text style={styles.aiMutedText}>No previous finalized consultations to compare.</Text>
                )}
              </View>

              <View style={styles.aiDisclaimer}>
                <Text style={styles.aiDisclaimerText}>
                  {disclaimer ||
                    "This AI health insight is decision support only and does not replace a veterinarian's professional diagnosis."}
                </Text>
              </View>
            </>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function ConsultationCard({ record, index, previousRecords }) {
  const [expanded, setExpanded] = useState(false);
  const [riskLevel, setRiskLevel] = useState(null);
  const vetName = record.veterinarian?.full_name || record.veterinarian?.username || 'Not assigned';
  const title = record.diagnosis || record.chief_complaint || 'Consultation';
  const riskStyle = riskLevel ? RISK_STYLE[riskLevel] : null;
  const time12h = formatMedicalTime12h(record);
  const appointment = record.appointment
    ? [formatMedicalDate(record.appointment.appointment_date), record.appointment.status].filter(Boolean).join(' · ')
    : '';

  return (
    <View style={styles.consultationCard}>
      <TouchableOpacity
        style={styles.consultationHeaderRow}
        onPress={() => setExpanded((value) => !value)}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel={`${expanded ? 'Collapse' : 'Expand'} consultation from ${formatMedicalDate(record.consultation_date)}`}
      >
        <View style={styles.consultationHeaderMain}>
          <View style={styles.consultationTopLine}>
            {index === 0 ? (
              <View style={styles.latestBadge}>
                <Text style={styles.latestBadgeText}>Latest</Text>
              </View>
            ) : null}
            <Text style={styles.consultationDateText}>
              {formatMedicalDate(record.consultation_date)}
              {time12h ? ` · ${time12h}` : ''}
            </Text>
          </View>
          <Text style={styles.consultationTitleText}>{title}</Text>
          <Text style={styles.consultationSubLine}>Dr. {vetName}</Text>
          <View style={styles.consultationBadgeRow}>
            <View style={styles.recordStatusBadge}>
              <Text style={styles.recordStatusBadgeText}>{record.record_status || 'Finalized'}</Text>
            </View>
            {riskStyle ? (
              <View style={[styles.riskBadgeSmall, styles[riskStyle.badge]]}>
                <Text style={[styles.riskBadgeSmallText, styles[riskStyle.text]]}>{riskLevel} Risk</Text>
              </View>
            ) : null}
          </View>
        </View>
        <View style={styles.chevronButton}>
          <Text style={styles.chevronText}>{expanded ? '−' : '+'}</Text>
        </View>
      </TouchableOpacity>

      {expanded ? (
        <View style={styles.consultationExpandedBody}>
          <Field label="Chief Complaint" value={record.chief_complaint} />
          <Field label="Symptoms" value={record.symptoms} />
          <Field label="Vital Signs" value={record.vital_signs} />

          <View style={styles.fieldRow2Col}>
            <View style={styles.fieldCol}>
              <Field label="Weight" value={record.weight != null ? `${record.weight} kg` : ''} />
            </View>
            <View style={styles.fieldCol}>
              <Field label="Temperature" value={record.temperature != null ? `${record.temperature} °C` : ''} />
            </View>
          </View>

          <Field label="Diagnosis" value={record.diagnosis} />
          <Field label="Treatment" value={record.treatment} />
          <Field label="Treatment Plan" value={record.treatment_plan} />

          <View style={styles.fieldRow2Col}>
            <View style={styles.fieldCol}>
              <Field label="Medication" value={record.medication} />
            </View>
            <View style={styles.fieldCol}>
              <Field label="Dosage" value={record.dosage} />
            </View>
          </View>
          <View style={styles.fieldRow2Col}>
            <View style={styles.fieldCol}>
              <Field label="Frequency" value={record.frequency} />
            </View>
            <View style={styles.fieldCol}>
              <Field label="Duration" value={record.duration} />
            </View>
          </View>

          <Field label="Laboratory Request" value={record.laboratory_request} />
          <Field label="Laboratory Result" value={record.laboratory_result} />
          <Field label="Vaccination" value={record.vaccination} />
          <Field label="Veterinarian Notes" value={record.veterinarian_notes} />
          <Field label="Follow-up Date" value={record.follow_up_date ? formatMedicalDate(record.follow_up_date) : ''} />
          <Field label="Related Appointment" value={appointment} />

          <ConsultationAiInsight record={record} previousRecords={previousRecords} onRiskLevel={setRiskLevel} />
        </View>
      ) : null}
    </View>
  );
}

export default function PetOwnerMyPetsMedicalHistory({ records = [], loading, error, onRetry }) {
  if (loading) {
    return (
      <View style={styles.aiEmptyCard}>
        <ActivityIndicator color="#447C99" />
        <Text style={styles.aiEmptyText}>Loading medical history...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.aiEmptyCard}>
        <Text style={styles.aiEmptyText}>{error}</Text>
        <TouchableOpacity style={[styles.primaryActionButton, { marginTop: 14 }]} onPress={onRetry} activeOpacity={0.9}>
          <Text style={styles.primaryActionText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!records.length) {
    return (
      <View style={styles.aiEmptyCard}>
        <Text style={styles.aiEmptyText}>
          No consultations recorded yet. Once your veterinarian finalizes a visit, it will appear here automatically.
        </Text>
      </View>
    );
  }

  return (
    <View>
      {records.map((record, index) => (
        <ConsultationCard
          key={record.id}
          record={record}
          index={index}
          previousRecords={records.filter((r) => r.id !== record.id).slice(0, 8)}
        />
      ))}
    </View>
  );
}
