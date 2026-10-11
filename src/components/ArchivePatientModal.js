import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { setPatientArchived, toUiPet } from '../api/petService';
import { getPetPhotoSource } from '../screens/dashboards/PetOwner/PetOwnerMyPetsInfo';

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

  const name = patient?.pet_name || 'This pet';
  const photo = patient ? getPetPhotoSource(toUiPet(patient)) : {};
  const details = [patient?.species, patient?.breed].filter(Boolean).join(' • ');
  const owner = patient?.owner?.full_name || patient?.owner?.username;

  return (
    <Modal transparent animationType="fade" visible={Boolean(visible && patient)} onRequestClose={close}>
      <View style={s.overlay}>
        <View style={s.card}>
          <Text style={s.title}>Archive Animal Patient?</Text>

          <View style={s.petRow}>
            {photo.source ? (
              <Image source={photo.source} style={s.photo} resizeMode="cover" />
            ) : (
              <View style={s.photo}><Text style={s.photoText}>{name.charAt(0).toUpperCase()}</Text></View>
            )}
            <View style={s.petInfo}>
              <Text style={s.petName} numberOfLines={1}>{name}</Text>
              {details ? <Text style={s.petSub} numberOfLines={1}>{details}</Text> : null}
              {owner ? <Text style={s.petSub} numberOfLines={1}>Owner: {owner}</Text> : null}
            </View>
          </View>

          <Text style={s.message}>
            {name}'s record will be archived and hidden from the active list. Its medical records are kept, and you can restore it anytime from View Archived.
          </Text>

          {error ? <Text style={s.error}>{error}</Text> : null}

          <View style={s.buttonRow}>
            <TouchableOpacity style={[s.cancelButton, busy && s.disabled]} onPress={close} disabled={busy} activeOpacity={0.9}>
              <Text style={s.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.archiveButton, busy && s.disabled]} onPress={confirm} disabled={busy} activeOpacity={0.9}>
              {busy ? (
                <View style={s.busyRow}><ActivityIndicator color="#ffffff" size="small" /><Text style={s.archiveText}>Archiving...</Text></View>
              ) : (
                <Text style={s.archiveText}>Yes, Archive</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(10,25,35,.62)', justifyContent: 'center', padding: 22 },
  card: { backgroundColor: '#ffffff', borderRadius: 26, padding: 22 },
  title: { fontSize: 20, fontWeight: '900', color: '#123a5e', textAlign: 'center', marginBottom: 16 },
  petRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f4fbff', borderRadius: 18, borderWidth: 1, borderColor: '#d7edf9', padding: 12 },
  photo: { width: 54, height: 54, borderRadius: 18, backgroundColor: '#e7f6f8', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  photoText: { fontSize: 20, fontWeight: '900', color: '#123a5e' },
  petInfo: { flex: 1 },
  petName: { fontSize: 16, fontWeight: '900', color: '#123a5e' },
  petSub: { marginTop: 2, fontSize: 12, fontWeight: '700', color: '#5f7f94' },
  message: { marginTop: 14, fontSize: 13.5, lineHeight: 20, fontWeight: '600', color: '#526d82', textAlign: 'center' },
  error: { marginTop: 12, color: '#dc2626', fontSize: 12.5, fontWeight: '700', textAlign: 'center' },
  buttonRow: { flexDirection: 'row', gap: 10, marginTop: 18 },
  cancelButton: { flex: 1, minHeight: 50, borderRadius: 15, borderWidth: 1.5, borderColor: '#cfe2eb', alignItems: 'center', justifyContent: 'center' },
  cancelText: { color: '#475569', fontSize: 15, fontWeight: '800' },
  archiveButton: { flex: 1, minHeight: 50, borderRadius: 15, backgroundColor: '#c0392b', alignItems: 'center', justifyContent: 'center' },
  archiveText: { color: '#ffffff', fontSize: 15, fontWeight: '900' },
  busyRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  disabled: { opacity: 0.55 },
});
