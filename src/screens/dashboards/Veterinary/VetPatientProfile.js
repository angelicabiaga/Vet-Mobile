import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import VetShell, { getVetUser } from './VetShell';
import { useLowerHeaderMotion } from './useLowerHeaderMotion';
import { loadPatientById } from './VetPatients';
import { toUiPet } from '../../../api/petService';
import { computePatientStatus, formatAge, formatBirthday, getPetPhotoSource } from '../PetOwner/PetOwnerMyPetsInfo';
import { getMobileMedicalRecords, subscribeToMedicalRecords } from '../../../api/medicalRecordService';
import PetOwnerMyPetsMedicalHistory from '../PetOwner/PetOwnerMyPetsMedicalHistory';
import PetOwnerMyPetsAIHealth from '../PetOwner/PetOwnerMyPetsAIHealth';

const STATUS_STYLE = {
  good: { badge: 'statusBadgeGood', text: 'statusBadgeGoodText' },
  warn: { badge: 'statusBadgeWarn', text: 'statusBadgeWarnText' },
  neutral: { badge: 'statusBadgeNeutral', text: 'statusBadgeNeutralText' },
};

export default function VetPatientProfile({ navigation, route }) {
  const currentUser = getVetUser(route);
  const petId = route?.params?.petId;
  const { scrollViewRef, lowerHeaderAnimation, handleScroll } = useLowerHeaderMotion();

  const [patient, setPatient] = useState(null);
  const [patientLoaded, setPatientLoaded] = useState(false);
  const [records, setRecords] = useState([]);
  const [recordsLoading, setRecordsLoading] = useState(true);
  const [recordsError, setRecordsError] = useState('');
  const [activeTab, setActiveTab] = useState('medical');
  const [aiTabVisited, setAiTabVisited] = useState(false);

  const loadPatient = useCallback(async () => {
    if (!petId) return;
    const row = await loadPatientById(petId);
    setPatient(row);
    setPatientLoaded(true);
  }, [petId]);

  const loadRecords = useCallback(async () => {
    if (!petId || !currentUser) return;
    try {
      const rows = await getMobileMedicalRecords({ ...currentUser, role: currentUser?.role || 'veterinarian' }, { petId });
      setRecords(rows);
      setRecordsError('');
    } catch (error) {
      setRecordsError(error?.message || "Unable to load this patient's medical history.");
    } finally {
      setRecordsLoading(false);
    }
  }, [petId, currentUser]);

  useFocusEffect(
    useCallback(() => {
      loadPatient();
      loadRecords();
      const unsubscribe = subscribeToMedicalRecords(
        { ...currentUser, role: currentUser?.role || 'veterinarian' },
        loadRecords
      );
      return () => { unsubscribe?.(); };
    }, [loadPatient, loadRecords, currentUser])
  );

  const uiPet = useMemo(() => toUiPet(patient), [patient]);
  const activePhoto = useMemo(() => getPetPhotoSource(uiPet), [uiPet]);
  const status = useMemo(() => computePatientStatus(records), [records]);
  const statusStyle = STATUS_STYLE[status.key] || STATUS_STYLE.neutral;

  const selectTab = (tab) => {
    setActiveTab(tab);
    if (tab === 'ai') setAiTabVisited(true);
  };

  if (patientLoaded && !patient) {
    return (
      <VetShell navigation={navigation} route={route} subtitle="Animal Patients" caption="Patient Care" showBack lowerHeaderAnimation={lowerHeaderAnimation}>
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>Animal patient not found</Text>
          <TouchableOpacity style={styles.retryButton} onPress={() => navigation.navigate('VetPatientOwners', { user: currentUser })} activeOpacity={0.9}>
            <Text style={styles.retryText}>Back to Pet Owners</Text>
          </TouchableOpacity>
        </View>
      </VetShell>
    );
  }

  if (!patient) {
    return (
      <VetShell navigation={navigation} route={route} subtitle="Animal Patients" caption="Patient Care" showBack lowerHeaderAnimation={lowerHeaderAnimation}>
        <View style={[styles.emptyCard, { alignItems: 'center' }]}>
          <ActivityIndicator size="large" color="#447C99" />
        </View>
      </VetShell>
    );
  }

  return (
    <VetShell navigation={navigation} route={route} subtitle="Animal Patient Profile" caption="Patient Care" showBack lowerHeaderAnimation={lowerHeaderAnimation}>
      <ScrollView ref={scrollViewRef} showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent} onScroll={handleScroll} scrollEventThrottle={16}>
        <View style={styles.detailCard}>
          <View style={styles.headerRow}>
            {activePhoto.source ? (
              <Image
                source={activePhoto.source}
                style={[styles.avatarCircle, activePhoto.isCustom && styles.avatarCircleCustom]}
                resizeMode="cover"
              />
            ) : (
              <View style={styles.avatarCircle}>
                <Text style={styles.avatarText}>{(patient.pet_name || 'P').charAt(0).toUpperCase()}</Text>
              </View>
            )}

            <View style={styles.headerInfo}>
              <View style={styles.headerTopLine}>
                <Text style={styles.patientName}>{patient.pet_name || 'Pet'}</Text>
                <View style={[styles.statusBadge, styles[statusStyle.badge]]}>
                  <Text style={[styles.statusBadgeText, styles[statusStyle.text]]}>{status.label}</Text>
                </View>
              </View>
              <Text style={styles.patientBreed}>{[patient.species, patient.breed].filter(Boolean).join(' • ') || 'Species not recorded'}</Text>
              <Text style={styles.patientId}>Patient ID: {uiPet.referenceCode}</Text>
            </View>
          </View>

          <View style={styles.infoGrid}>
            <View style={styles.infoItem}><Text style={styles.infoLabel}>Species</Text><Text style={styles.infoValue}>{patient.species || '-'}</Text></View>
            <View style={styles.infoItem}><Text style={styles.infoLabel}>Breed</Text><Text style={styles.infoValue}>{patient.breed || '-'}</Text></View>
            <View style={styles.infoItem}><Text style={styles.infoLabel}>Sex</Text><Text style={styles.infoValue}>{patient.sex || '-'}</Text></View>
            <View style={styles.infoItem}><Text style={styles.infoLabel}>Age</Text><Text style={styles.infoValue}>{formatAge(uiPet)}</Text></View>
            <View style={styles.infoItem}><Text style={styles.infoLabel}>Weight</Text><Text style={styles.infoValue}>{patient.weight != null ? `${patient.weight} kg` : '-'}</Text></View>
            <View style={styles.infoItem}><Text style={styles.infoLabel}>Birthday</Text><Text style={styles.infoValue}>{formatBirthday(uiPet)}</Text></View>
          </View>

          <View style={styles.ownerCard}>
            <Text style={styles.ownerLabel}>Owner</Text>
            <Text style={styles.ownerValue}>{patient.owner?.full_name || patient.owner?.username || 'Not listed'}</Text>
            {patient.owner?.email || patient.owner?.phone ? (
              <Text style={styles.ownerSub}>{[patient.owner?.email, patient.owner?.phone].filter(Boolean).join(' · ')}</Text>
            ) : null}
          </View>

          <View style={styles.tabRow}>
            <TouchableOpacity style={[styles.tabButton, activeTab === 'medical' && styles.tabButtonActive]} onPress={() => selectTab('medical')} activeOpacity={0.9} accessibilityRole="tab" accessibilityState={{ selected: activeTab === 'medical' }}>
              <Text style={[styles.tabButtonText, activeTab === 'medical' && styles.tabButtonTextActive]}>Medical History</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.tabButton, activeTab === 'ai' && styles.tabButtonActive]} onPress={() => selectTab('ai')} activeOpacity={0.9} accessibilityRole="tab" accessibilityState={{ selected: activeTab === 'ai' }}>
              <Text style={[styles.tabButtonText, activeTab === 'ai' && styles.tabButtonTextActive]}>AI Predictive Health</Text>
            </TouchableOpacity>
          </View>

          {activeTab === 'medical' ? (
            <PetOwnerMyPetsMedicalHistory records={records} loading={recordsLoading} error={recordsError} onRetry={loadRecords} />
          ) : null}

          {aiTabVisited ? (
            <View style={activeTab === 'ai' ? undefined : { display: 'none' }}>
              <PetOwnerMyPetsAIHealth pet={uiPet} records={records} recordsLoading={recordsLoading} active={activeTab === 'ai'} />
            </View>
          ) : null}
        </View>
      </ScrollView>
    </VetShell>
  );
}

const styles = StyleSheet.create({
  scrollContent: { paddingHorizontal: 18, paddingTop: 8, paddingBottom: 120 },
  detailCard: { backgroundColor: '#fcfeff', borderRadius: 26, borderWidth: 1, borderColor: '#dceef8', padding: 18 },
  headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  avatarCircle: { width: 72, height: 72, borderRadius: 22, backgroundColor: '#e7f6f8', alignItems: 'center', justifyContent: 'center', marginRight: 14 },
  avatarCircleCustom: { tintColor: undefined },
  avatarText: { fontSize: 26, fontWeight: '900', color: '#24566d' },
  headerInfo: { flex: 1 },
  headerTopLine: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  patientName: { fontSize: 20, fontWeight: '900', color: '#24566d', marginRight: 8 },
  patientBreed: { marginTop: 4, fontSize: 13, fontWeight: '700', color: '#67869b' },
  patientId: { marginTop: 6, fontSize: 12, fontWeight: '700', color: '#5f7f94' },
  infoGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginBottom: 8 },
  infoItem: { width: '48%', backgroundColor: '#f4fbff', borderRadius: 18, borderWidth: 1, borderColor: '#d7edf9', paddingVertical: 14, paddingHorizontal: 12, marginBottom: 12 },
  infoLabel: { fontSize: 11, fontWeight: '800', color: '#6a8aa0', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
  infoValue: { fontSize: 14, fontWeight: '800', color: '#24566d' },
  ownerCard: { backgroundColor: '#f4fbff', borderRadius: 18, borderWidth: 1, borderColor: '#d7edf9', paddingVertical: 12, paddingHorizontal: 14, marginBottom: 14 },
  ownerLabel: { fontSize: 10, fontWeight: '900', color: '#7892a0', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4 },
  ownerValue: { fontSize: 13.5, fontWeight: '800', color: '#24566d' },
  ownerSub: { marginTop: 2, fontSize: 12, fontWeight: '600', color: '#5f7f94' },
  tabRow: { flexDirection: 'row', backgroundColor: '#eef6fb', borderRadius: 16, padding: 4, marginBottom: 16 },
  tabButton: { flex: 1, minHeight: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexDirection: 'row' },
  tabButtonActive: { backgroundColor: '#447C99' },
  tabButtonText: { fontSize: 13, fontWeight: '800', color: '#5f7f94' },
  tabButtonTextActive: { color: '#ffffff' },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, alignSelf: 'flex-start' },
  statusBadgeText: { fontSize: 10.5, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.3 },
  statusBadgeNeutral: { backgroundColor: '#e8f4fb' },
  statusBadgeNeutralText: { color: '#447C99' },
  statusBadgeGood: { backgroundColor: '#e5f4ea' },
  statusBadgeGoodText: { color: '#2f8f5b' },
  statusBadgeWarn: { backgroundColor: '#fdf1dc' },
  statusBadgeWarnText: { color: '#a5680b' },
  emptyCard: { backgroundColor: '#fcfeff', borderRadius: 22, borderWidth: 1, borderColor: '#dceef8', padding: 18, margin: 18 },
  emptyTitle: { fontSize: 16, fontWeight: '900', color: '#24566d', marginBottom: 12 },
  retryButton: { alignSelf: 'flex-start', backgroundColor: '#447C99', paddingHorizontal: 18, paddingVertical: 10, borderRadius: 14 },
  retryText: { color: '#ffffff', fontWeight: '900' },
});
