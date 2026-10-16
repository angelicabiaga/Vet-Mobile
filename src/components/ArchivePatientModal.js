import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity } from 'react-native';
import { setPatientArchived } from '../api/petService';
import CustomModal from './CustomModal';

// Veterinarian: confirm and archive one animal patient. `patient` is a pets row
// (pet_name, species, breed, photo_url, owner). Archiving hides it from the
// active list; it can be restored anytime from View Archived.
// onArchived runs after a successful archive; the modal stays open on errors.
export default function ArchivePatientModal({ visible, patient, veterinarian, onClose, onArchived }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (visible) setError('');
  }, [visible, patient?.id]);

  const close = () => {
    if (!busy) onClose?.();
  };

  const confirm = async () => {
    if (busy || !patient?.id) return;
    try {
      setBusy(true);
      setError('');
      await setPatientArchived(patient.id, true, veterinarian);
      onArchived?.(patient);
    } catch (archiveError) {
      setError(archiveError?.message || 'Unable to archive this animal patient. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const name = patient?.pet_name || 'this pet';

  // Same look as the pet owner's archive confirmation and the logout pop-up.
  return (
    <CustomModal
      show={Boolean(visible && patient)}
      onClose={close}
      extraAction={
        <>
          {error ? <Text style={s.error}>{error}</Text> : null}
          <TouchableOpacity style={[s.confirmBtn, busy && s.disabled]} onPress={confirm} disabled={busy} activeOpacity={0.9}>
            <Text style={s.confirmBtnText}>{busy ? 'Archiving…' : 'Archive'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.cancelBtn} onPress={close} disabled={busy} activeOpacity={0.9}>
            <Text style={s.cancelBtnText}>Cancel</Text>
          </TouchableOpacity>
        </>
      }
    >
      Are you sure you want to archive {name}? It will be hidden from the active list. Its medical records are kept, and you can restore it anytime from View Archived.
    </CustomModal>
  );
}

// Buttons copied from the logout confirmation (PetOwnerProfileDesign).
const s = StyleSheet.create({
  error: { marginBottom: 12, color: '#dc2626', fontSize: 12.5, fontWeight: '700', textAlign: 'center' },
  confirmBtn: { backgroundColor: '#cf5353', paddingVertical: 12, borderRadius: 14, marginBottom: 10, width: '80%', alignItems: 'center' },
  confirmBtnText: { color: '#ffffff', fontWeight: '800', fontSize: 14 },
  cancelBtn: { backgroundColor: '#e7edf2', paddingVertical: 12, borderRadius: 14, width: '80%', alignItems: 'center' },
  cancelBtnText: { color: '#4f6a7b', fontWeight: '800', fontSize: 14 },
  disabled: { opacity: 0.6 },
});
