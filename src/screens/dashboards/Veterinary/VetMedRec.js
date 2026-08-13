import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import VetShell, { getVetUser } from './VetShell';
import { useLowerHeaderMotion } from './useLowerHeaderMotion';
import { formatMedicalDate, getMobileMedicalRecords, subscribeToMedicalRecords } from '../../../api/medicalRecordService';
import useResolvedSessionUser from '../../../hooks/useResolvedSessionUser';
import { analyzeVeterinaryHealthRecords } from '../../../api/aiService';

const VetMedRec = ({ navigation, route }) => {
  const currentUser = useResolvedSessionUser(getVetUser(route));
  const selectedPetId = route?.params?.selectedPetId || null;
  const selectedPetName = route?.params?.selectedPetName || '';
  const { scrollViewRef, lowerHeaderAnimation, handleScroll } = useLowerHeaderMotion();
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [analysisPetId, setAnalysisPetId] = useState(selectedPetId ? String(selectedPetId) : '');
  const [healthAnalysis, setHealthAnalysis] = useState('');
  const [healthAnalysisLoading, setHealthAnalysisLoading] = useState(false);
  const [healthAnalysisError, setHealthAnalysisError] = useState('');
  const currentUserId = currentUser?.id || currentUser?.user_id || currentUser?.profile_id || null;

  const loadRecords = useCallback(async () => {
    if (!currentUserId) return;
    try {
      const rows = await getMobileMedicalRecords({ ...currentUser, role: currentUser?.role || 'veterinarian' });
      setRecords(rows);
      if (!analysisPetId && rows.length) setAnalysisPetId(String(rows[0].pet_id || rows[0].pet?.id || ''));
      setError('');
    } catch (e) {
      setError(e?.message || 'Unable to load medical records.');
    } finally {
      setLoading(false);
    }
  }, [currentUserId, currentUser?.role, analysisPetId]);

  useEffect(() => {
    if (!currentUserId) return undefined;
    loadRecords();
    const unsubscribe = subscribeToMedicalRecords({ ...currentUser, role: currentUser?.role || 'veterinarian' }, loadRecords);
    const fallback = setInterval(loadRecords, 30000);
    return () => { unsubscribe?.(); clearInterval(fallback); };
  }, [currentUserId, loadRecords]);

  const visibleRecords = selectedPetId
    ? records.filter((record) => record.pet_id === selectedPetId || record.pet?.id === selectedPetId)
    : records;

  const patients = Object.values(records.reduce((result, record) => {
    const id = String(record.pet_id || record.pet?.id || '');
    if (id && !result[id]) result[id] = record.pet || { id, pet_name: 'Patient' };
    return result;
  }, {}));
  const analysisRecords = records.filter((record) => String(record.pet_id || record.pet?.id || '') === String(analysisPetId));
  const analysisPet = patients.find((pet) => String(pet.id) === String(analysisPetId));

  const selectAnalysisPet = (id) => {
    setAnalysisPetId(String(id));
    setHealthAnalysis('');
    setHealthAnalysisError('');
  };

  const runHealthAnalysis = async () => {
    if (!analysisRecords.length) return;
    setHealthAnalysisLoading(true);
    setHealthAnalysisError('');
    try {
      setHealthAnalysis(await analyzeVeterinaryHealthRecords(analysisPet?.pet_name || 'this patient', analysisRecords));
    } catch (analysisError) {
      setHealthAnalysisError(analysisError?.message || 'Unable to generate predictive health analysis.');
    } finally {
      setHealthAnalysisLoading(false);
    }
  };

  const openRecord = (record) => navigation.navigate('VetMedRecDetail', currentUser ? { user: currentUser, record } : { record });

  return (
    <VetShell navigation={navigation} route={route} subtitle="Medical Records" caption="Treatment Notes" lowerHeaderAnimation={lowerHeaderAnimation}>
      <ScrollView ref={scrollViewRef} showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent} onScroll={handleScroll} scrollEventThrottle={16}>
        {loading ? <View style={styles.emptyCard}><ActivityIndicator /><Text style={styles.emptyText}>Loading medical records...</Text></View> : null}
        {!loading && error ? <View style={styles.emptyCard}><Text style={styles.errorText}>{error}</Text><TouchableOpacity style={styles.retryButton} onPress={loadRecords}><Text style={styles.retryButtonText}>Retry</Text></TouchableOpacity></View> : null}
        {!loading && !error && patients.length ? (
          <View style={styles.aiCard}>
            <Text style={styles.aiEyebrow}>VETERINARY DECISION SUPPORT</Text>
            <Text style={styles.aiTitle}>AI Health Analysis & Predictive Insights</Text>
            <Text style={styles.aiSubtitle}>Review longitudinal trends and possible risk signals from the selected patient’s records.</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.patientChips}>
              {patients.map((pet) => {
                const active = String(pet.id) === String(analysisPetId);
                return <TouchableOpacity key={pet.id} style={[styles.patientChip, active && styles.patientChipActive]} onPress={() => selectAnalysisPet(pet.id)}><Text style={[styles.patientChipText, active && styles.patientChipTextActive]}>{pet.pet_name || 'Patient'}</Text></TouchableOpacity>;
              })}
            </ScrollView>
            <View style={styles.aiDisclaimer}><Text style={styles.aiDisclaimerText}>Decision-support only. Predictive signals are not diagnoses and must be confirmed using veterinarian judgment and appropriate examination or testing.</Text></View>
            {healthAnalysis ? <View style={styles.aiResult}><Text style={styles.aiResultText}>{healthAnalysis}</Text></View> : null}
            {healthAnalysisError ? <Text style={styles.aiErrorText}>{healthAnalysisError}</Text> : null}
            <TouchableOpacity style={[styles.aiButton, healthAnalysisLoading && styles.aiButtonDisabled]} onPress={runHealthAnalysis} disabled={healthAnalysisLoading || !analysisRecords.length} activeOpacity={0.88}>
              {healthAnalysisLoading ? <ActivityIndicator size="small" color="#fff" /> : null}
              <Text style={styles.aiButtonText}>{healthAnalysisLoading ? 'Analyzing patient records...' : healthAnalysis ? 'Refresh Predictive Analysis' : 'Generate Predictive Analysis'}</Text>
            </TouchableOpacity>
          </View>
        ) : null}
        {!loading && !error && visibleRecords.map((record) => (
          <View key={record.id} style={styles.recordCard}>
            <View style={styles.recordHeader}>
              <Text style={styles.recordDate}>{formatMedicalDate(record.consultation_date)}</Text>
              <View style={[styles.statusTag, record.record_status === 'Finalized' ? styles.statusClosed : styles.statusOpen]}><Text style={styles.statusTagText}>{record.record_status || 'Draft'}</Text></View>
            </View>
            <Text style={styles.petNameText}>{record.pet?.pet_name || 'Pet'}</Text>
            <Text style={styles.ownerText}>Owner: {record.owner?.full_name || record.owner?.username || 'Not listed'}</Text>
            <View style={styles.divider} />
            <View style={styles.detailRow}><Text style={styles.detailLabel}>Diagnosis</Text><Text style={styles.detailValue}>{record.diagnosis || 'Not recorded'}</Text></View>
            <View style={styles.detailRow}><Text style={styles.detailLabel}>Treatment</Text><Text style={styles.detailValue}>{record.treatment || record.treatment_plan || 'Not recorded'}</Text></View>
            <TouchableOpacity style={styles.viewButton} onPress={() => openRecord(record)} activeOpacity={0.9}><Text style={styles.viewButtonText}>View Full Report</Text></TouchableOpacity>
          </View>
        ))}
        {!loading && !error && !visibleRecords.length ? <View style={styles.emptyCard}><Text style={styles.emptyTitle}>No medical records available</Text><Text style={styles.emptyText}>{selectedPetId ? `No medical records available for ${selectedPetName || 'this patient'}.` : 'Records assigned to you on the web will appear here automatically.'}</Text></View> : null}
      </ScrollView>
    </VetShell>
  );
};

const styles = StyleSheet.create({
  scrollContent: { paddingHorizontal: 18, paddingTop: 8, paddingBottom: 120 },
  recordCard: { backgroundColor: '#fcfeff', borderRadius: 22, borderWidth: 1, borderColor: '#dceef8', padding: 16, marginBottom: 12 },
  recordHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  recordDate: { fontSize: 12, fontWeight: '900', color: '#447C99' }, statusTag: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 7 },
  statusOpen: { backgroundColor: '#fff4e6' }, statusClosed: { backgroundColor: '#e8f7ef' }, statusTagText: { fontSize: 11, fontWeight: '900', color: '#24566d' },
  petNameText: { fontSize: 18, fontWeight: '900', color: '#24566d' }, ownerText: { marginTop: 4, fontSize: 12, fontWeight: '600', color: '#5d7b91' },
  divider: { height: 1, backgroundColor: '#edf4f8', marginVertical: 14 }, detailRow: { marginBottom: 10 },
  detailLabel: { fontSize: 11, fontWeight: '900', color: '#6a8aa0', textTransform: 'uppercase', marginBottom: 4 }, detailValue: { fontSize: 13, lineHeight: 19, fontWeight: '700', color: '#24566d' },
  viewButton: { minHeight: 44, borderRadius: 16, backgroundColor: '#447C99', alignItems: 'center', justifyContent: 'center', marginTop: 6 }, viewButtonText: { fontSize: 13, fontWeight: '900', color: '#ffffff' },
  emptyCard: { backgroundColor: '#fcfeff', borderRadius: 22, borderWidth: 1, borderColor: '#dceef8', padding: 18, alignItems: 'center' }, emptyTitle: { fontSize: 16, fontWeight: '900', color: '#24566d' },
  emptyText: { marginTop: 8, textAlign: 'center', color: '#6a8aa0', fontWeight: '600' }, errorText: { color: '#a33b3b', fontWeight: '700', textAlign: 'center' },
  retryButton: { marginTop: 12, backgroundColor: '#447C99', paddingHorizontal: 18, paddingVertical: 10, borderRadius: 14 }, retryButtonText: { color: '#fff', fontWeight: '900' },
  aiCard: { backgroundColor: '#fcfeff', borderRadius: 24, borderWidth: 1, borderColor: '#cfe6ef', padding: 18, marginBottom: 16, shadowColor: '#24566d', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 3 },
  aiEyebrow: { color: '#2d94bc', fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  aiTitle: { color: '#24566d', fontSize: 19, fontWeight: '900', marginTop: 4 },
  aiSubtitle: { color: '#67889a', fontSize: 12, lineHeight: 18, fontWeight: '600', marginTop: 5 },
  patientChips: { paddingVertical: 14, paddingRight: 10 },
  patientChip: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 15, backgroundColor: '#eef7fa', borderWidth: 1, borderColor: '#d3e8ef', marginRight: 8 },
  patientChipActive: { backgroundColor: '#447C99', borderColor: '#447C99' },
  patientChipText: { color: '#447C99', fontSize: 12, fontWeight: '900' }, patientChipTextActive: { color: '#fff' },
  aiDisclaimer: { padding: 12, borderRadius: 15, backgroundColor: '#f3f9fb', borderWidth: 1, borderColor: '#deedf2' },
  aiDisclaimerText: { color: '#5b7989', fontSize: 11, lineHeight: 17, fontWeight: '700' },
  aiResult: { marginTop: 14, padding: 14, borderRadius: 16, backgroundColor: '#f7fcfe', borderWidth: 1, borderColor: '#d9ebf1' },
  aiResultText: { color: '#315f73', fontSize: 13, lineHeight: 20, fontWeight: '600' },
  aiErrorText: { marginTop: 12, color: '#a34848', fontSize: 12, lineHeight: 18, fontWeight: '700' },
  aiButton: { marginTop: 14, minHeight: 48, borderRadius: 16, backgroundColor: '#447C99', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  aiButtonDisabled: { opacity: 0.6 }, aiButtonText: { marginLeft: 8, color: '#fff', fontSize: 13, fontWeight: '900' },
});
export default VetMedRec;
