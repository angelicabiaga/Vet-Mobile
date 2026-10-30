import React, { useState } from 'react';
import { ActivityIndicator, Modal, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { styles } from '../../styles/PetOwnerMyPetsDesign';
import { formatMedicalDate, formatMedicalTime12h } from '../../../api/medicalRecordService';
import { getRecordTemplate } from '../../../constants/medicalRecordTemplates';
import MedicalRecordFields from '../../../components/MedicalRecordFields';
import { generateConsultationHealthInsight } from '../../../api/aiService';
import { parseConsultationInsight, splitRiskName, toListItems, toSentences } from '../../../utils/predictiveHealthParsing';
import { formatMoney, getTransactionsForQueueEntry, invoiceBalance } from '../../../api/consultationBillingService';
import { INVOICE_ERROR_MESSAGE, viewInvoice } from '../../../utils/invoicePdf';
import PrintMedicalRecordButton from '../../../components/PrintMedicalRecordButton';
import PrescriptionsSection from '../../../components/PrescriptionsSection';

// Vet full_name is sometimes saved with the title already included (e.g.
// "Dr. Redmond Lopez"), which used to render as "Dr. Dr. Redmond Lopez"
// wherever we blindly prepended "Dr. " ourselves.
const withDrTitle = (name) => (name ? `Dr. ${String(name).replace(/^dr\.?\s*/i, '')}` : 'Not assigned');

const RISK_STYLE = {
  Low: { badge: 'statusBadgeGood', text: 'statusBadgeGoodText' },
  Moderate: { badge: 'statusBadgeWarn', text: 'statusBadgeWarnText' },
  High: { badge: 'statusBadgeRisk', text: 'statusBadgeRiskText' },
};

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

function BillingSection({ record }) {
  const [billing, setBilling] = useState(null);
  // Download builds the web's "Official POS Invoice" PDF (never prints the screen).
  // busy = { id } while the invoice PDF is being made.
  const [busy, setBusy] = useState(null);
  const [downloadError, setDownloadError] = useState('');
  // Web: the invoice preview (View) with Cancel / Download, like the web app.
  const [preview, setPreview] = useState(null);
  const run = async (invoice) => {
    if (busy) return;
    setBusy({ id: invoice.id });
    setDownloadError('');
    try {
      const result = await viewInvoice(invoice);
      if (result) setPreview(result);
    } catch (error) {
      console.warn('Invoice failed:', error?.message || error);
      setDownloadError(INVOICE_ERROR_MESSAGE);
    } finally {
      setBusy(null);
    }
  };
  const closePreview = () => setPreview(null);
  const downloadPreview = () => {
    try {
      preview?.download();
      setPreview(null);
    } catch (error) {
      console.warn('Invoice download failed:', error?.message || error);
      setDownloadError(INVOICE_ERROR_MESSAGE);
    }
  };

  const load = async (force = false) => {
    if (!record.queue_entry_id) return;
    if (billing && !force) return;
    setBilling({ loading: true });
    try {
      const invoices = await getTransactionsForQueueEntry(record.queue_entry_id);
      setBilling({ loading: false, invoices });
    } catch {
      setBilling({ loading: false, error: 'Unable to load billing details for this visit right now.' });
    }
  };

  React.useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [record.queue_entry_id]);

  if (!record.queue_entry_id) return null;

  return (
    <>
      <View style={styles.billingCard}>
        <View style={styles.billingHeadRow}>
          <Text style={styles.billingTitle}>Billing</Text>
        </View>
        {billing?.error ? <Text style={styles.billingErrorText}>{billing.error}</Text> : null}
        {downloadError ? <Text style={styles.billingErrorText}>{downloadError}</Text> : null}
        {billing && !billing.loading && !billing.error ? (
          billing.invoices.length === 0 ? (
            <Text style={styles.billingMutedText}>Staff hasn't processed billing for this visit yet.</Text>
          ) : (
            billing.invoices.map((invoice, i) => (
              <View key={invoice.id} style={[styles.billingRow, i === 0 && styles.billingRowFirst]}>
                <View style={styles.billingRowMain}>
                  <Text style={styles.billingRowTitle}>{invoice.or_number}</Text>
                  <Text style={styles.billingRowMeta}>
                    Total {formatMoney(invoice.total_amount)} · Paid {formatMoney(invoice.amount_paid)}
                    {invoiceBalance(invoice) > 0 ? ` · ${formatMoney(invoiceBalance(invoice))} due` : ''}
                  </Text>
                  <View style={styles.billingStatusPill}>
                    <Text style={styles.billingStatusPillText}>{invoice.payment_status}</Text>
                  </View>
                </View>
                {/* Download shows the invoice first (web: preview with Cancel /
                    Download; phone: the PDF preview, where it can be saved). */}
                <TouchableOpacity style={styles.billingActionButton} onPress={() => run(invoice)} disabled={Boolean(busy)} activeOpacity={0.9}>
                  <Text style={styles.billingActionButtonText}>{busy?.id === invoice.id ? 'Opening…' : 'Download'}</Text>
                </TouchableOpacity>
              </View>
            ))
          )
        ) : null}
      </View>

      {Platform.OS === 'web' && preview ? (
        <Modal transparent animationType="fade" visible onRequestClose={closePreview}>
          <View style={invoiceButtonStyles.overlay}>
            <View style={invoiceButtonStyles.sheet}>
              <View style={invoiceButtonStyles.sheetHead}>
                <Text style={invoiceButtonStyles.sheetTitle} numberOfLines={1}>{preview.title}</Text>
                <TouchableOpacity onPress={closePreview} activeOpacity={0.85} accessibilityLabel="Close">
                  <Text style={invoiceButtonStyles.close}>×</Text>
                </TouchableOpacity>
              </View>
              <View style={invoiceButtonStyles.frame}>
                {React.createElement('iframe', { src: preview.url, title: preview.title, style: { flex: 1, width: '100%', height: '100%', border: 0, backgroundColor: '#ffffff' } })}
              </View>
              <View style={invoiceButtonStyles.sheetFoot}>
                <TouchableOpacity style={invoiceButtonStyles.cancel} onPress={closePreview} activeOpacity={0.9}>
                  <Text style={invoiceButtonStyles.cancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={invoiceButtonStyles.download} onPress={downloadPreview} activeOpacity={0.9}>
                  <Text style={invoiceButtonStyles.downloadText}>Download</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      ) : null}
    </>
  );
}

function ConsultationCard({ record, pet, index, previousRecords, viewer }) {
  const [expanded, setExpanded] = useState(false);
  const [riskLevel, setRiskLevel] = useState(null);
  const vetName = withDrTitle(record.veterinarian?.full_name || record.veterinarian?.username);
  // The template the doctor chose for this record; it also decides which
  // fields are shown (same as the web Medical History).
  const title = getRecordTemplate(record).label;
  const reassigned = Boolean(record.original_veterinarian_id)
    && String(record.original_veterinarian_id) !== String(record.veterinarian_id || '');
  const riskStyle = riskLevel ? RISK_STYLE[riskLevel] : null;
  const time12h = formatMedicalTime12h(record);
  const visitDateTime = `${formatMedicalDate(record.consultation_date)}${time12h ? ` · ${time12h}` : ''}`;

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
            <Text style={styles.consultationDateText}>{visitDateTime}</Text>
          </View>
          <Text style={styles.consultationTitleText}>{title}</Text>
          <Text style={styles.consultationSubLine}>{vetName}</Text>
          <View style={styles.consultationBadgeRow}>
            <View style={styles.recordStatusBadge}>
              <Text style={styles.recordStatusBadgeText}>{record.record_status || 'Finalized'}</Text>
            </View>
            {reassigned ? (
              <View style={styles.recordStatusBadge}>
                <Text style={styles.recordStatusBadgeText}>Reassigned</Text>
              </View>
            ) : null}
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
          <MedicalRecordFields record={record} />

          <BillingSection record={record} />
          <PrescriptionsSection record={record} pet={pet} viewer={viewer} />

          <PrintMedicalRecordButton
            record={record}
            pet={pet}
            viewer={viewer}
            buttonStyle={styles.printButton}
            disabledStyle={styles.printButtonDisabled}
            textStyle={styles.printButtonText}
          />

          <ConsultationAiInsight record={record} previousRecords={previousRecords} onRiskLevel={setRiskLevel} />
        </View>
      ) : null}
    </View>
  );
}

// viewer: the logged-in user (role decides pet-owner-only actions).
export default function PetOwnerMyPetsMedicalHistory({ pet, records = [], loading, error, onRetry, viewer }) {
  if (loading) {
    return (
      <View style={styles.aiEmptyCard}>
        <ActivityIndicator color="#2c6ba3" />
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
          No completed medical consultations yet.
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
          pet={pet}
          index={index}
          previousRecords={records.filter((r) => r.id !== record.id).slice(0, 8)}
          viewer={viewer}
        />
      ))}
    </View>
  );
}

const invoiceButtonStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(10,25,35,0.55)', alignItems: 'center', justifyContent: 'center', padding: 16 },
  sheet: { width: '100%', maxWidth: 1000, height: '92%', backgroundColor: '#ffffff', borderRadius: 18, overflow: 'hidden' },
  sheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14, backgroundColor: '#f4f9fc', borderBottomWidth: 1, borderColor: '#e1edf2' },
  sheetTitle: { flex: 1, marginRight: 12, fontSize: 16, fontWeight: '900', color: '#17445a' },
  close: { fontSize: 26, lineHeight: 28, color: '#4f6a7b' },
  frame: { flex: 1, backgroundColor: '#525659' },
  sheetFoot: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, paddingHorizontal: 20, paddingVertical: 14, borderTopWidth: 1, borderColor: '#e1edf2' },
  cancel: { paddingHorizontal: 22, paddingVertical: 11, borderRadius: 12, borderWidth: 1, borderColor: '#cfe2eb', backgroundColor: '#ffffff' },
  cancelText: { fontSize: 14, fontWeight: '800', color: '#17445a' },
  download: { paddingHorizontal: 22, paddingVertical: 11, borderRadius: 12, backgroundColor: '#2f8f5b' },
  downloadText: { fontSize: 14, fontWeight: '900', color: '#ffffff' },
});
