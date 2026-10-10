import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import VetShell, { getVetUser } from './VetShell';
import { useLowerHeaderMotion } from './useLowerHeaderMotion';
import { supabase } from '../../../config/supabaseClient';
import { toUiPet } from '../../../api/petService';
import { formatAge, getPetPhotoSource } from '../PetOwner/PetOwnerMyPetsInfo';

// Veterinarian → Animal Patients: every clinic-registered pet, whoever the owner
// is (not filtered by the logged-in vet). The route keeps its original name,
// "VetPatientOwners", so the bottom tab and existing links still land here.

const PATIENT_FIELDS =
  'id,owner_id,pet_name,species,breed,sex,date_of_birth,weight,photo_url,is_archived,created_at,owner:profiles!pets_owner_id_fkey(id,full_name,username)';

async function loadAllPatients() {
  const { data, error } = await supabase
    .from('pets')
    .select(PATIENT_FIELDS)
    .eq('is_archived', false)
    .order('pet_name', { ascending: true });
  if (error) {
    console.warn('Vet Animal Patients query failed:', error.message);
    throw new Error('Unable to load animal patients. Please try again.');
  }
  return data || [];
}

function subscribePatients(onChange) {
  return ['pets', 'profiles'].map((table) =>
    supabase
      .channel(`pawcruz-mobile-vet-all-patients-${table}-${Date.now()}-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table }, onChange)
      .subscribe()
  );
}

const ownerNameOf = (pet) => pet.owner?.full_name || pet.owner?.username || 'Owner not listed';

const VetPatientOwners = ({ navigation, route }) => {
  const currentUser = getVetUser(route);
  const { scrollViewRef, lowerHeaderAnimation, handleScroll } = useLowerHeaderMotion();
  const [search, setSearch] = useState('');
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadPatients = useCallback(async () => {
    try {
      setPatients(await loadAllPatients());
      setError('');
    } catch (loadError) {
      setError(loadError?.message || 'Unable to load animal patients. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadPatients();
      const channels = subscribePatients(loadPatients);
      const fallbackTimer = setInterval(loadPatients, 20000);
      return () => {
        clearInterval(fallbackTimer);
        channels.forEach((channel) => { if (channel) supabase.removeChannel(channel); });
      };
    }, [loadPatients])
  );

  const query = search.trim().toLowerCase();
  const visiblePatients = patients.filter((pet) => {
    if (!query) return true;
    return [pet.pet_name, ownerNameOf(pet)].some((value) =>
      String(value || '').toLowerCase().includes(query)
    );
  });

  const openPatientProfile = (pet) =>
    navigation.navigate('VetPatientProfile', { user: currentUser, petId: pet.id });

  return (
    <VetShell
      navigation={navigation}
      route={route}
      subtitle="Animal Patients"
      caption="All registered animal patients"
      lowerHeaderAnimation={lowerHeaderAnimation}
    >
      <ScrollView
        ref={scrollViewRef}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={loadPatients} />}
      >
        <View style={styles.searchCard}>
          <TextInput
            style={styles.searchInput}
            placeholder="Search pet name or owner name"
            placeholderTextColor="#8aa2b4"
            value={search}
            onChangeText={setSearch}
            autoCapitalize="none"
          />
        </View>

        {!loading && !error && patients.length ? (
          <Text style={styles.countText}>
            {visiblePatients.length} of {patients.length} animal patient{patients.length === 1 ? '' : 's'}
          </Text>
        ) : null}

        {loading && !patients.length ? (
          <View style={styles.emptyCard}>
            <ActivityIndicator size="large" color="#2c6ba3" />
            <Text style={styles.emptyText}>Loading animal patients...</Text>
          </View>
        ) : null}

        {!loading && error ? (
          <View style={styles.emptyCard}>
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity style={styles.retryButton} onPress={loadPatients} activeOpacity={0.9}>
              <Text style={styles.retryText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {!error &&
          visiblePatients.map((pet) => {
            const uiPet = toUiPet(pet);
            const petPhoto = getPetPhotoSource(uiPet);
            return (
              <TouchableOpacity
                key={pet.id}
                style={styles.patientCard}
                onPress={() => openPatientProfile(pet)}
                activeOpacity={0.9}
                accessibilityRole="button"
                accessibilityLabel={`Open ${pet.pet_name || 'pet'}'s animal patient profile`}
              >
                <View style={styles.patientTopRow}>
                  {petPhoto.source ? (
                    <Image source={petPhoto.source} style={styles.petPhoto} resizeMode="cover" />
                  ) : (
                    <View style={styles.avatarCircle}>
                      <Text style={styles.avatarText}>{(pet.pet_name || 'P').charAt(0).toUpperCase()}</Text>
                    </View>
                  )}

                  <View style={styles.patientInfo}>
                    <Text style={styles.patientName} numberOfLines={1}>{pet.pet_name || 'Pet'}</Text>
                    <Text style={styles.patientBreed} numberOfLines={1}>
                      {[pet.species, pet.breed].filter(Boolean).join(' • ') || 'Species not recorded'}
                    </Text>
                  </View>
                </View>

                <View style={styles.infoGrid}>
                  <View style={styles.infoItem}>
                    <Text style={styles.infoLabel}>Sex</Text>
                    <Text style={styles.infoValue}>{pet.sex || 'Unknown'}</Text>
                  </View>
                  <View style={styles.infoItem}>
                    <Text style={styles.infoLabel}>Age</Text>
                    <Text style={styles.infoValue}>{formatAge(uiPet)}</Text>
                  </View>
                  <View style={[styles.infoItem, styles.infoItemWide]}>
                    <Text style={styles.infoLabel}>Pet Owner</Text>
                    <Text style={styles.infoValue} numberOfLines={1}>{ownerNameOf(pet)}</Text>
                  </View>
                </View>

                <View style={styles.patientFooterRow}>
                  <View style={styles.viewProfileChip}>
                    <Text style={styles.viewProfileChipText}>View Profile & Records</Text>
                  </View>
                </View>
              </TouchableOpacity>
            );
          })}

        {!loading && !error && !visiblePatients.length ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>{patients.length ? 'No animal patients found' : 'No animal patients yet'}</Text>
            <Text style={styles.emptyText}>
              {patients.length
                ? 'Try another pet name, owner name, or patient ID.'
                : 'Pets registered by pet owners or the clinic will appear here automatically.'}
            </Text>
          </View>
        ) : null}
      </ScrollView>
    </VetShell>
  );
};

const styles = StyleSheet.create({
  scrollContent: { paddingHorizontal: 18, paddingTop: 8, paddingBottom: 120 },
  searchCard: {
    minHeight: 54, borderRadius: 18, borderWidth: 1, borderColor: '#d7edf9', backgroundColor: '#fcfeff',
    paddingHorizontal: 14, justifyContent: 'center', marginBottom: 10,
  },
  searchInput: { fontSize: 14, fontWeight: '700', color: '#123a5e' },
  countText: { fontSize: 12, fontWeight: '800', color: '#5f7f94', marginBottom: 10, marginLeft: 4 },
  patientCard: { backgroundColor: '#fcfeff', borderRadius: 22, borderWidth: 1, borderColor: '#dceef8', padding: 16, marginBottom: 12 },
  patientTopRow: { flexDirection: 'row', alignItems: 'center' },
  avatarCircle: { width: 58, height: 58, borderRadius: 20, backgroundColor: '#e7f6f8', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  avatarText: { fontSize: 21, fontWeight: '900', color: '#123a5e' },
  petPhoto: { width: 58, height: 58, borderRadius: 20, marginRight: 12, backgroundColor: '#e7f6f8' },
  patientInfo: { flex: 1 },
  patientName: { fontSize: 17, fontWeight: '900', color: '#123a5e' },
  patientBreed: { marginTop: 4, fontSize: 12, fontWeight: '800', color: '#2c6ba3' },
  patientIdText: { marginTop: 4, fontSize: 11.5, fontWeight: '700', color: '#5f7f94' },
  infoGrid: {
    flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between',
    marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#edf4f8',
  },
  infoItem: { width: '48%', marginBottom: 9 },
  infoItemWide: { width: '100%' },
  infoLabel: { fontSize: 10, fontWeight: '900', color: '#7892a0', textTransform: 'uppercase' },
  infoValue: { marginTop: 3, fontSize: 12, fontWeight: '800', color: '#123a5e' },
  patientFooterRow: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 4 },
  viewProfileChip: { minHeight: 44, paddingHorizontal: 16, borderRadius: 14, backgroundColor: '#2c6ba3', alignItems: 'center', justifyContent: 'center' },
  viewProfileChipText: { fontSize: 12, fontWeight: '900', color: '#ffffff' },
  emptyCard: { backgroundColor: '#fcfeff', borderRadius: 22, borderWidth: 1, borderColor: '#dceef8', padding: 18, alignItems: 'center' },
  emptyTitle: { fontSize: 16, fontWeight: '900', color: '#123a5e' },
  emptyText: { marginTop: 8, fontSize: 13, lineHeight: 19, textAlign: 'center', fontWeight: '600', color: '#5d7b91' },
  errorText: { color: '#a33b3b', textAlign: 'center', fontWeight: '700' },
  retryButton: { marginTop: 12, backgroundColor: '#2c6ba3', paddingHorizontal: 18, paddingVertical: 10, borderRadius: 14 },
  retryText: { color: '#ffffff', fontWeight: '900' },
});

export default VetPatientOwners;
