import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import {
  LOAD_PRESCRIPTIONS_ERROR,
  PURCHASABLE_STATUSES,
  getConsultationPrescriptions,
  markPrescriptionElsewhere,
  prescribedQuantity,
  purchasedQuantity,
  remainingQuantity,
} from '../api/prescriptionService';
import { formatPurchaseDateTime } from '../api/consultationBillingService';
import { petAgeText } from '../utils/medicalDocuments';
import { SLIP_ERROR_MESSAGE, SLIP_ERROR_TITLE, downloadPrescriptionSlip, viewPrescriptionSlip } from '../utils/prescriptionPdf';

// "Veterinarian Prescriptions" for one consultation, matching the web
// Animal Patients -> Medical History card. Pet owners can also mark a
// medicine as bought elsewhere; vets only view.

const STATUS_TONES = {
  'Not Purchased': { bg: '#eef2f5', fg: '#5f7884' },
  'Partially Purchased': { bg: '#fff4dc', fg: '#9a6a12' },
  'Fully Purchased': { bg: '#dcfce7', fg: '#166534' },
  'Purchasing Elsewhere': { bg: '#e3f0fb', fg: '#2c6ba3' },
};

const roleOf = (viewer) => String(viewer?.role || '').trim().toLowerCase();
const isPetOwner = (role) => ['pet_owner', 'pet owner', 'owner'].includes(role);
// Staff and admin download the slip; pet owners and vets view it.
const downloadsSlip = (role) => ['staff', 'admin', 'administrator'].includes(role);

// "Oct 1, 2026, 1:07 PM": the consultation date with the record's time.
function visitDateTime(record) {
  const day = String(record?.consultation_date || '').slice(0, 10);
  const date = day ? new Date(`${day}T12:00:00`) : null;
  const created = record?.created_at ? new Date(record.created_at) : null;
  const dateText = date && !Number.isNaN(date.getTime())
    ? date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : '';
  const timeText = created && !Number.isNaN(created.getTime())
    ? created.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    : '';
  return [dateText, timeText].filter(Boolean).join(', ');
}

function PillIcon() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24">
      <Path d="M10.5 20.5l-7-7a4.95 4.95 0 0 1 7-7l7 7a4.95 4.95 0 0 1-7 7z" stroke="#2c6ba3" strokeWidth={2} fill="none" strokeLinejoin="round" />
      <Path d="M8.5 8.5l7 7" stroke="#2c6ba3" strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}

function DownloadIcon() {
  return (
    <Svg width={15} height={15} viewBox="0 0 24 24">
      <Path d="M12 4v11M7 10l5 5 5-5M5 20h14" stroke="#ffffff" strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function EyeIcon() {
  return (
    <Svg width={15} height={15} viewBox="0 0 24 24">
      <Path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" stroke="#ffffff" strokeWidth={2} fill="none" strokeLinejoin="round" />
      <Circle cx="12" cy="12" r="3" stroke="#ffffff" strokeWidth={2} fill="none" />
    </Svg>
  );
}

export default function PrescriptionsSection({ record, pet, viewer }) {
  const [state, setState] = useState({ loading: true, error: '', prescriptions: [], historyByRxId: {}, billed: false });
  const [confirmRx, setConfirmRx] = useState(null);
  const [savingId, setSavingId] = useState('');
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);
  const [preparing, setPreparing] = useState(false);
  // Web only: the slip shown in-app when the browser blocked the new tab.
  const [blockedSlipUrl, setBlockedSlipUrl] = useState('');
  const role = roleOf(viewer);
  const ownerView = isPetOwner(role);
  const download = downloadsSlip(role);

  const load = useCallback(async () => {
    setState((current) => ({ ...current, loading: true, error: '' }));
    try {
      const result = await getConsultationPrescriptions(record);
      setState({ loading: false, error: '', ...result });
    } catch {
      setState((current) => ({ ...current, loading: false, error: LOAD_PRESCRIPTIONS_ERROR }));
    }
  }, [record]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => () => clearTimeout(toastTimer.current), []);

  if (!record?.queue_entry_id) return null;

  const showToast = (text, isError = false, title = '') => {
    setToast({ text, isError, title: title || (isError ? 'Not updated' : 'Prescription updated') });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3500);
  };

  const buyElsewhere = async () => {
    const rx = confirmRx;
    setConfirmRx(null);
    if (!rx) return;
    setSavingId(rx.id);
    try {
      await markPrescriptionElsewhere(rx, viewer?.id);
      showToast(`${rx.item_name} is marked as purchasing elsewhere.`);
    } catch (error) {
      showToast(error?.message || 'Unable to update this prescription right now. Please try again.', true);
    } finally {
      setSavingId('');
      load();
    }
  };

  // The slip is built from data only (never the screen).
  const openSlip = async () => {
    if (preparing) return;
    const recordPet = record.pet || {};
    const vet = record.veterinarian || {};
    const owner = record.owner || {};
    const slip = {
      prescriptions: state.prescriptions,
      vet: { name: vet.full_name || vet.username, phone: vet.phone, license: vet.license_number },
      owner: { name: owner.full_name || owner.username, address: owner.address },
      pet: {
        name: recordPet.pet_name || pet?.pet_name || pet?.name,
        species: recordPet.species || pet?.species,
        breed: recordPet.breed || pet?.breed,
        age: petAgeText(recordPet.date_of_birth || pet?.date_of_birth),
      },
      dateTime: visitDateTime(record),
    };
    setPreparing(true);
    try {
      if (download) {
        await downloadPrescriptionSlip(slip);
      } else {
        const { blockedUrl } = await viewPrescriptionSlip(slip);
        if (blockedUrl) setBlockedSlipUrl(blockedUrl);
      }
    } catch (slipError) {
      console.warn('Prescription slip failed:', slipError?.message || slipError);
      showToast(SLIP_ERROR_MESSAGE, true, SLIP_ERROR_TITLE);
    } finally {
      setPreparing(false);
    }
  };

  const { loading, error, prescriptions, historyByRxId, billed } = state;

  return (
    <View style={s.card}>
      <View style={s.header}>
        <View style={s.titleRow}>
          <View style={s.iconBadge}><PillIcon /></View>
          <Text style={s.title} numberOfLines={1}>Veterinarian Prescriptions</Text>
        </View>
        <View style={s.headerActions}>
          {prescriptions.length > 0 ? (
            <TouchableOpacity
              style={[s.viewButton, preparing && s.disabled]}
              onPress={openSlip}
              disabled={preparing}
              activeOpacity={0.85}
              accessibilityLabel={download ? 'Download prescription slip' : 'View prescription slip'}
            >
              {preparing ? <ActivityIndicator color="#ffffff" size="small" /> : download ? <DownloadIcon /> : <EyeIcon />}
              <Text style={s.viewButtonText}>{preparing ? 'Preparing…' : download ? 'Download' : 'View'}</Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity style={s.refreshButton} onPress={load} disabled={loading} activeOpacity={0.85}>
            <Text style={s.refreshText}>Refresh</Text>
          </TouchableOpacity>
        </View>
      </View>

      {toast ? (
        <View style={[s.toast, toast.isError && s.toastError]}>
          <Text style={[s.toastTitle, toast.isError && s.toastErrorText]}>{toast.title}</Text>
          <Text style={[s.toastText, toast.isError && s.toastErrorText]}>{toast.text}</Text>
        </View>
      ) : null}

      <View style={s.body}>
        {loading && !prescriptions.length ? (
          <View style={s.loadingRow}><ActivityIndicator color="#2c6ba3" size="small" /><Text style={s.muted}>Loading prescriptions…</Text></View>
        ) : error ? (
          <Text style={s.error}>{error}</Text>
        ) : !prescriptions.length ? (
          <Text style={s.muted}>{billed ? 'No Prescription Given' : "Staff hasn't processed billing for this visit yet."}</Text>
        ) : (
          prescriptions.map((rx, index) => {
            const status = rx.fulfillment_status || 'Not Purchased';
            const tone = STATUS_TONES[status] || STATUS_TONES['Not Purchased'];
            const history = historyByRxId[rx.id] || [];
            const canMark = ownerView && PURCHASABLE_STATUSES.includes(status);
            return (
              <View key={rx.id} style={[s.row, index === 0 && s.rowFirst]}>
                <View style={s.rowTop}>
                  <Text style={s.itemName}>{rx.item_name || 'Medicine'}</Text>
                  <View style={[s.pill, { backgroundColor: tone.bg }]}>
                    <Text style={[s.pillText, { color: tone.fg }]}>{status}</Text>
                  </View>
                </View>

                <View style={s.stats}>
                  {[['Prescribed', prescribedQuantity(rx)], ['Purchased', purchasedQuantity(rx)], ['Remaining', remainingQuantity(rx)]].map(([label, value]) => (
                    <View key={label} style={s.stat}>
                      <Text style={s.statValue}>{value}</Text>
                      <Text style={s.statLabel}>{label}</Text>
                    </View>
                  ))}
                </View>

                <View style={s.sigBox}>
                  <Text style={s.sigLabel}>Sig</Text>
                  <Text style={s.sigText}>{String(rx.sig || '').trim() || 'No directions for use recorded.'}</Text>
                </View>

                {history.length ? (
                  <View style={s.history}>
                    <Text style={s.sigLabel}>Purchase history</Text>
                    {history.map((entry) => (
                      <Text key={entry.id} style={s.historyText}>
                        {Number(entry.quantity) || 0} purchased · {formatPurchaseDateTime(entry.created_at)}
                      </Text>
                    ))}
                  </View>
                ) : null}
                {canMark ? (
                  <TouchableOpacity
                    style={[s.elsewhereButton, savingId === rx.id && s.disabled]}
                    onPress={() => setConfirmRx(rx)}
                    disabled={Boolean(savingId)}
                    activeOpacity={0.85}
                  >
                    <Text style={s.elsewhereText}>{savingId === rx.id ? 'Saving…' : "I'll buy this elsewhere"}</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            );
          })
        )}
      </View>

      {Platform.OS === 'web' && blockedSlipUrl ? (
        <Modal transparent animationType="fade" visible onRequestClose={() => setBlockedSlipUrl('')}>
          <View style={s.slipViewer}>
            <View style={s.slipViewerBar}>
              <Text style={s.slipViewerTitle}>Veterinarian Prescription</Text>
              <TouchableOpacity style={s.slipViewerClose} onPress={() => setBlockedSlipUrl('')} activeOpacity={0.85}>
                <Text style={s.slipViewerCloseText}>Close</Text>
              </TouchableOpacity>
            </View>
            {React.createElement('iframe', { src: blockedSlipUrl, title: 'Veterinarian Prescription', style: { flex: 1, width: '100%', border: 0, backgroundColor: '#ffffff' } })}
          </View>
        </Modal>
      ) : null}

      {/* In-app confirm (Alert buttons do nothing on web). */}
      <Modal transparent animationType="fade" visible={Boolean(confirmRx)} onRequestClose={() => setConfirmRx(null)}>
        <View style={s.overlay}>
          <View style={s.dialog}>
            <Text style={s.dialogTitle}>Buy this medicine elsewhere?</Text>
            <Text style={s.dialogText}>
              {confirmRx?.item_name} will be marked as purchasing elsewhere, so the clinic won't expect you to buy it here.
            </Text>
            <View style={s.dialogActions}>
              <TouchableOpacity style={[s.dialogButton, s.dialogNo]} onPress={() => setConfirmRx(null)} activeOpacity={0.85}>
                <Text style={s.dialogNoText}>No</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.dialogButton, s.dialogYes]} onPress={buyElsewhere} activeOpacity={0.85}>
                <Text style={s.dialogYesText}>Yes</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: '#ffffff', borderRadius: 16, borderWidth: 1, borderColor: '#dceef8', overflow: 'hidden', marginBottom: 12 },
  header: { backgroundColor: '#eef7fc', paddingHorizontal: 12, paddingVertical: 11, gap: 10 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconBadge: { width: 30, height: 30, borderRadius: 10, backgroundColor: '#ffffff', alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, fontSize: 14.5, fontWeight: '900', color: '#1d3a4a' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  viewButton: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#2c6ba3', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 },
  viewButtonText: { color: '#ffffff', fontSize: 12, fontWeight: '800' },
  refreshButton: { borderRadius: 10, borderWidth: 1, borderColor: '#cfe4ed', backgroundColor: '#ffffff', paddingHorizontal: 10, paddingVertical: 6 },
  refreshText: { color: '#2c6ba3', fontSize: 12, fontWeight: '800' },
  body: { paddingHorizontal: 12, paddingVertical: 10 },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  muted: { fontSize: 13, fontWeight: '600', color: '#5f7884' },
  error: { fontSize: 13, fontWeight: '700', color: '#b44b3d' },
  row: { borderTopWidth: 1, borderTopColor: '#e6f0f5', paddingVertical: 12 },
  rowFirst: { borderTopWidth: 0, paddingTop: 2 },
  rowTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
  itemName: { flex: 1, fontSize: 14.5, lineHeight: 20, fontWeight: '900', color: '#1d3a4a' },
  pill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  pillText: { fontSize: 11, fontWeight: '800' },
  stats: { flexDirection: 'row', gap: 8, marginTop: 10 },
  stat: { flex: 1, borderRadius: 12, backgroundColor: '#f6fafc', borderWidth: 1, borderColor: '#e6f0f5', paddingVertical: 7, alignItems: 'center' },
  statValue: { fontSize: 16, fontWeight: '900', color: '#1d3a4a' },
  statLabel: { marginTop: 1, fontSize: 10.5, fontWeight: '800', color: '#5f7884', textTransform: 'uppercase', letterSpacing: 0.3 },
  sigBox: { marginTop: 10, borderRadius: 12, backgroundColor: '#f6fafc', paddingHorizontal: 10, paddingVertical: 8 },
  sigLabel: { fontSize: 10.5, fontWeight: '800', color: '#5f7884', textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 2 },
  sigText: { fontSize: 13, lineHeight: 19, fontWeight: '600', color: '#1d3a4a' },
  history: { marginTop: 10, gap: 3 },
  historyText: { fontSize: 12.5, fontWeight: '600', color: '#5f7884' },
  elsewhereButton: { alignSelf: 'flex-start', marginTop: 8, borderRadius: 10, borderWidth: 1, borderColor: '#2c6ba3', paddingHorizontal: 12, paddingVertical: 7 },
  elsewhereText: { color: '#2c6ba3', fontSize: 12.5, fontWeight: '800' },
  disabled: { opacity: 0.55 },
  toast: { marginHorizontal: 12, marginTop: 10, borderRadius: 12, backgroundColor: '#ecfdf5', borderWidth: 1, borderColor: '#bbf7d0', padding: 10 },
  toastTitle: { fontSize: 13, fontWeight: '900', color: '#166534' },
  toastError: { backgroundColor: '#fff1f1', borderColor: '#f4cccc' },
  toastErrorText: { color: '#a33f3f' },
  toastText: { marginTop: 2, fontSize: 12.5, fontWeight: '600', color: '#166534' },
  slipViewer: { flex: 1, backgroundColor: '#ffffff' },
  slipViewerBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 10, backgroundColor: '#eef7fc', borderBottomWidth: 1, borderBottomColor: '#dceef8' },
  slipViewerTitle: { fontSize: 15, fontWeight: '900', color: '#1d3a4a' },
  slipViewerClose: { borderRadius: 10, backgroundColor: '#2c6ba3', paddingHorizontal: 14, paddingVertical: 7 },
  slipViewerCloseText: { color: '#ffffff', fontWeight: '800' },
  overlay: { flex: 1, backgroundColor: 'rgba(10,25,35,0.55)', justifyContent: 'center', padding: 24 },
  dialog: { backgroundColor: '#ffffff', borderRadius: 20, padding: 20 },
  dialogTitle: { fontSize: 17, fontWeight: '900', color: '#1d3a4a' },
  dialogText: { marginTop: 8, fontSize: 13.5, lineHeight: 20, fontWeight: '600', color: '#5f7884' },
  dialogActions: { flexDirection: 'row', gap: 10, marginTop: 18 },
  dialogButton: { flex: 1, minHeight: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  dialogNo: { backgroundColor: '#eef4f8' },
  dialogNoText: { color: '#2c6ba3', fontWeight: '900' },
  dialogYes: { backgroundColor: '#2c6ba3' },
  dialogYesText: { color: '#ffffff', fontWeight: '900' },
});
