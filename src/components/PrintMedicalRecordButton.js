import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import {
  RECORD_ERROR_MESSAGE,
  RECORD_ERROR_TITLE,
  printMedicalRecordPdf,
  shareMedicalRecordPdf,
} from '../utils/medicalRecordPdf';

// "Print Medical Record" for one consultation. Builds the official record PDF
// from data (never the screen). Pet owners can print Finalized records only.

const isPetOwner = (viewer) => ['pet_owner', 'pet owner', 'owner'].includes(String(viewer?.role || '').trim().toLowerCase());

export default function PrintMedicalRecordButton({ record, pet, viewer, buttonStyle, disabledStyle, textStyle }) {
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState('');
  const [blocked, setBlocked] = useState(null); // web: { url, download }
  const [shareUri, setShareUri] = useState(''); // native: saved PDF to share
  const errorTimer = useRef(null);
  useEffect(() => () => clearTimeout(errorTimer.current), []);

  const finalized = String(record?.record_status || '').toLowerCase() === 'finalized';
  const allowed = finalized || !isPetOwner(viewer);

  const showError = (message) => {
    setError(message);
    clearTimeout(errorTimer.current);
    errorTimer.current = setTimeout(() => setError(''), 5000);
  };

  const print = async () => {
    if (preparing || !allowed) return;
    setPreparing(true);
    setError('');
    try {
      const result = await printMedicalRecordPdf({
        record,
        pet: record.pet || pet,
        owner: record.owner,
        vet: record.veterinarian,
      });
      if (result?.blockedUrl) setBlocked({ url: result.blockedUrl, download: result.download });
      if (result?.shareUri) setShareUri(result.shareUri);
    } catch (printError) {
      console.warn('Medical record PDF failed:', printError?.message || printError);
      showError(printError?.message === RECORD_ERROR_MESSAGE ? RECORD_ERROR_MESSAGE
        : /belong to the selected pet/.test(printError?.message || '') ? printError.message : RECORD_ERROR_MESSAGE);
    } finally {
      setPreparing(false);
    }
  };

  return (
    <View>
      <TouchableOpacity
        style={[buttonStyle, (!allowed || preparing) && disabledStyle]}
        disabled={!allowed || preparing}
        onPress={print}
        activeOpacity={0.9}
      >
        <View style={s.buttonRow}>
          {preparing ? <ActivityIndicator color="#ffffff" size="small" /> : null}
          <Text style={textStyle}>
            {!allowed ? 'Complete this consultation before printing' : preparing ? 'Preparing…' : 'Print Medical Record'}
          </Text>
        </View>
      </TouchableOpacity>

      {Platform.OS !== 'web' && shareUri ? (
        <TouchableOpacity style={s.shareButton} onPress={() => shareMedicalRecordPdf(shareUri).catch(() => showError(RECORD_ERROR_MESSAGE))} activeOpacity={0.85}>
          <Text style={s.shareText}>Save / Share PDF</Text>
        </TouchableOpacity>
      ) : null}

      {error ? (
        <View style={s.toast}>
          <Text style={s.toastTitle}>{RECORD_ERROR_TITLE}</Text>
          <Text style={s.toastText}>{error}</Text>
        </View>
      ) : null}

      {Platform.OS === 'web' && blocked ? (
        <Modal transparent animationType="fade" visible onRequestClose={() => setBlocked(null)}>
          <View style={s.viewer}>
            <View style={s.viewerBar}>
              <Text style={s.viewerTitle} numberOfLines={1}>Medical Record</Text>
              <View style={s.viewerActions}>
                <TouchableOpacity style={s.viewerButton} onPress={() => blocked.download?.()} activeOpacity={0.85}>
                  <Text style={s.viewerButtonText}>Download</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.viewerButton, s.viewerClose]} onPress={() => setBlocked(null)} activeOpacity={0.85}>
                  <Text style={[s.viewerButtonText, s.viewerCloseText]}>Close</Text>
                </TouchableOpacity>
              </View>
            </View>
            {React.createElement('iframe', { src: blocked.url, title: 'Medical Record', style: { flex: 1, width: '100%', border: 0, backgroundColor: '#ffffff' } })}
          </View>
        </Modal>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  buttonRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  shareButton: { marginTop: 8, alignSelf: 'center', borderRadius: 10, borderWidth: 1, borderColor: '#2c6ba3', paddingHorizontal: 14, paddingVertical: 7 },
  shareText: { color: '#2c6ba3', fontSize: 12.5, fontWeight: '800' },
  toast: { marginTop: 8, borderRadius: 12, backgroundColor: '#fff1f1', borderWidth: 1, borderColor: '#f4cccc', padding: 10 },
  toastTitle: { fontSize: 13, fontWeight: '900', color: '#a33f3f' },
  toastText: { marginTop: 2, fontSize: 12.5, fontWeight: '600', color: '#a33f3f' },
  viewer: { flex: 1, backgroundColor: '#ffffff' },
  viewerBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 10, backgroundColor: '#eef7fc', borderBottomWidth: 1, borderBottomColor: '#dceef8' },
  viewerTitle: { flex: 1, fontSize: 15, fontWeight: '900', color: '#1d3a4a' },
  viewerActions: { flexDirection: 'row', gap: 8 },
  viewerButton: { borderRadius: 10, backgroundColor: '#2c6ba3', paddingHorizontal: 14, paddingVertical: 7 },
  viewerButtonText: { color: '#ffffff', fontWeight: '800' },
  viewerClose: { backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#cfe4ed' },
  viewerCloseText: { color: '#2c6ba3' },
});
