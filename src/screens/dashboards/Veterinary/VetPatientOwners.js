import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import { Dropdown } from 'react-native-element-dropdown';
import VetShell, { getVetUser } from './VetShell';
import { useLowerHeaderMotion } from './useLowerHeaderMotion';
import { supabase } from '../../../config/supabaseClient';
import { setPatientArchived, toUiPet } from '../../../api/petService';
import { formatAge, getPetPhotoSource } from '../PetOwner/PetOwnerMyPetsInfo';
import ArchivePatientModal from '../../../components/ArchivePatientModal';

// Veterinarian → Animal Patients: every clinic-registered pet, whoever the owner
// is (not filtered by the logged-in vet). The route keeps its original name,
// "VetPatientOwners", so the bottom tab and existing links still land here.
// Archived pets are loaded too and shown under View Archived, like the
// pet owner's Animal Patients list.

const PATIENT_FIELDS =
  'id,owner_id,pet_name,species,breed,sex,date_of_birth,weight,photo_url,is_archived,created_at,owner:profiles!pets_owner_id_fkey(id,full_name,username)';

async function loadAllPatients() {
  const { data, error } = await supabase
    .from('pets')
    .select(PATIENT_FIELDS)
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
  const [speciesFilter, setSpeciesFilter] = useState('all');
  const [showArchived, setShowArchived] = useState(false);
  const [restoringId, setRestoringId] = useState(null);
  // The pet whose Archive button was tapped; shows the confirm modal.
  const [archiveTarget, setArchiveTarget] = useState(null);

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

  // Species the pets actually use -- mobile and web name species differently
  // ("Canine (Dog)" vs "Dog"), so a fixed list would miss some.
  const speciesFilterOptions = useMemo(() => {
    const species = [...new Set(patients.map((pet) => String(pet.species || '').trim()).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b));
    return [{ label: 'All species', value: 'all' }, ...species.map((value) => ({ label: value, value }))];
  }, [patients]);

  const query = search.trim().toLowerCase();
  // Like the pet owner's View Archived toggle: show either active or archived pets.
  const scopedPatients = patients.filter((pet) => Boolean(pet.is_archived) === showArchived);
  const visiblePatients = scopedPatients.filter((pet) => {
    if (speciesFilter !== 'all' && String(pet.species || '').trim().toLowerCase() !== speciesFilter.toLowerCase()) {
      return false;
    }
    if (!query) return true;
    return [pet.pet_name, ownerNameOf(pet)].some((value) =>
      String(value || '').toLowerCase().includes(query)
    );
  });

  const hasActiveFilters = Boolean(query) || speciesFilter !== 'all';
  const clearFilters = () => {
    setSearch('');
    setSpeciesFilter('all');
  };

  const restorePatient = async (pet) => {
    if (restoringId) return;
    try {
      setRestoringId(pet.id);
      await setPatientArchived(pet.id, false, currentUser);
      await loadPatients();
      Alert.alert('Animal Patients', 'Pet record restored successfully.');
    } catch (restoreError) {
      Alert.alert('Animal Patients', restoreError?.message || 'Unable to update the pet archive status.');
    } finally {
      setRestoringId(null);
    }
  };

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

        <View style={styles.filterRow}>
          <View style={styles.speciesFilterShell}>
            <Dropdown
              style={styles.speciesFilterDropdown}
              containerStyle={styles.dropdownContainer}
              placeholderStyle={styles.dropdownPlaceholder}
              selectedTextStyle={styles.dropdownSelectedText}
              itemTextStyle={styles.dropdownItemText}
              iconStyle={styles.dropdownIcon}
              activeColor="#edf7fd"
              data={speciesFilterOptions}
              search={speciesFilterOptions.length > 6}
              maxHeight={280}
              labelField="label"
              valueField="value"
              placeholder="All species"
              searchPlaceholder="Search species..."
              value={speciesFilter}
              onChange={(item) => setSpeciesFilter(item.value)}
            />
          </View>
          <TouchableOpacity
            style={[styles.archiveToggle, showArchived && styles.archiveToggleActive]}
            onPress={() => setShowArchived((current) => !current)}
            activeOpacity={0.9}
            accessibilityRole="button"
            accessibilityState={{ selected: showArchived }}
          >
            <Text style={[styles.archiveToggleText, showArchived && styles.archiveToggleTextActive]}>View Archived</Text>
          </TouchableOpacity>
        </View>

        {!loading && !error ? (
          <View style={styles.countRow}>
            <Text style={styles.countText}>
              {visiblePatients.length} of {scopedPatients.length} {showArchived ? 'archived' : 'active'} animal patient{scopedPatients.length === 1 ? '' : 's'}
            </Text>
            {hasActiveFilters ? (
              <TouchableOpacity onPress={clearFilters} activeOpacity={0.8} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={styles.clearFiltersText}>Clear filters</Text>
              </TouchableOpacity>
            ) : null}
          </View>
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
            // Archived pets can't be opened until restored (same as the pet owner's list).
            const CardComponent = pet.is_archived ? View : TouchableOpacity;
            const cardProps = pet.is_archived
              ? {}
              : {
                  onPress: () => openPatientProfile(pet),
                  activeOpacity: 0.9,
                  accessibilityRole: 'button',
                  accessibilityLabel: `Open ${pet.pet_name || 'pet'}'s animal patient profile`,
                };
            return (
              <CardComponent key={pet.id} style={styles.patientCard} {...cardProps}>
                <View style={styles.patientTopRow}>
                  {petPhoto.source ? (
                    <Image source={petPhoto.source} style={styles.petPhoto} resizeMode="cover" />
                  ) : (
                    <View style={styles.avatarCircle}>
                      <Text style={styles.avatarText}>{(pet.pet_name || 'P').charAt(0).toUpperCase()}</Text>
                    </View>
                  )}

                  <View style={styles.patientInfo}>
                    <View style={styles.patientTopLine}>
                      <Text style={styles.patientName} numberOfLines={1}>{pet.pet_name || 'Pet'}</Text>
                      {pet.is_archived ? (
                        <View style={styles.archivedBadge}>
                          <Text style={styles.archivedBadgeText}>Archived</Text>
                        </View>
                      ) : null}
                    </View>
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
                  {pet.is_archived ? (
                    <TouchableOpacity
                      style={[styles.restoreChip, restoringId === pet.id && styles.restoreChipBusy]}
                      onPress={() => restorePatient(pet)}
                      disabled={Boolean(restoringId)}
                      activeOpacity={0.9}
                      accessibilityLabel={`Restore ${pet.pet_name || 'pet'}`}
                    >
                      <Text style={styles.restoreChipText}>{restoringId === pet.id ? 'Restoring...' : 'Restore'}</Text>
                    </TouchableOpacity>
                  ) : (
                    <>
                      <TouchableOpacity
                        style={styles.archiveChip}
                        onPress={() => setArchiveTarget(pet)}
                        activeOpacity={0.9}
                        accessibilityRole="button"
                        accessibilityLabel={`Archive ${pet.pet_name || 'pet'}`}
                      >
                        <Text style={styles.archiveChipText}>Archive</Text>
                      </TouchableOpacity>
                      <View style={styles.viewProfileChip}>
                        <Text style={styles.viewProfileChipText}>View Profile & Records</Text>
                      </View>
                    </>
                  )}
                </View>
              </CardComponent>
            );
          })}

        {!loading && !error && !visiblePatients.length ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>
              {scopedPatients.length ? 'No animal patients found' : showArchived ? 'No archived animal patients' : 'No animal patients yet'}
            </Text>
            <Text style={styles.emptyText}>
              {scopedPatients.length
                ? 'Try another pet name, owner name, or species.'
                : showArchived
                  ? 'Patients you archive will appear here.'
                  : 'Pets registered by pet owners or the clinic will appear here automatically.'}
            </Text>
          </View>
        ) : null}
      </ScrollView>

      <ArchivePatientModal
        visible={Boolean(archiveTarget)}
        patient={archiveTarget}
        veterinarian={currentUser}
        onClose={() => setArchiveTarget(null)}
        onArchived={async () => {
          setArchiveTarget(null);
          await loadPatients();
          Alert.alert('Animal Patients', 'Pet record archived successfully.');
        }}
      />
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
  filterRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  speciesFilterShell: {
    flex: 1, minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: '#d7edf9', backgroundColor: '#ffffff',
    justifyContent: 'center', paddingHorizontal: 14,
  },
  speciesFilterDropdown: { minHeight: 42 },
  dropdownContainer: { borderRadius: 18, borderWidth: 1, borderColor: '#d7edf9', backgroundColor: '#ffffff', overflow: 'hidden' },
  dropdownPlaceholder: { fontSize: 14, fontWeight: '700', color: '#87a0b1' },
  dropdownSelectedText: { fontSize: 14, fontWeight: '800', color: '#123a5e' },
  dropdownItemText: { fontSize: 14, fontWeight: '700', color: '#123a5e' },
  dropdownIcon: { width: 18, height: 18 },
  archiveToggle: {
    minHeight: 44, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1, borderColor: '#d7edf9', backgroundColor: '#f6fbff',
    alignItems: 'center', justifyContent: 'center',
  },
  archiveToggleActive: { backgroundColor: '#2c6ba3', borderColor: '#2c6ba3' },
  archiveToggleText: { fontSize: 12, fontWeight: '800', color: '#2c6ba3' },
  archiveToggleTextActive: { color: '#ffffff' },
  countRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 10 },
  countText: { flex: 1, fontSize: 12, fontWeight: '800', color: '#5f7f94', marginLeft: 4 },
  clearFiltersText: { fontSize: 12, fontWeight: '800', color: '#2563eb' },
  patientCard: { backgroundColor: '#fcfeff', borderRadius: 22, borderWidth: 1, borderColor: '#dceef8', padding: 16, marginBottom: 12 },
  patientTopRow: { flexDirection: 'row', alignItems: 'center' },
  avatarCircle: { width: 58, height: 58, borderRadius: 20, backgroundColor: '#e7f6f8', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  avatarText: { fontSize: 21, fontWeight: '900', color: '#123a5e' },
  petPhoto: { width: 58, height: 58, borderRadius: 20, marginRight: 12, backgroundColor: '#e7f6f8' },
  patientInfo: { flex: 1 },
  patientTopLine: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  patientName: { flexShrink: 1, fontSize: 17, fontWeight: '900', color: '#123a5e' },
  archivedBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: '#eef1f4' },
  archivedBadgeText: { fontSize: 10, fontWeight: '900', color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.3 },
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
  patientFooterRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 4 },
  archiveChip: { minHeight: 44, paddingHorizontal: 16, borderRadius: 14, borderWidth: 1.5, borderColor: '#f3c4c0', backgroundColor: '#fdf2f1', alignItems: 'center', justifyContent: 'center' },
  archiveChipText: { fontSize: 12, fontWeight: '900', color: '#c0392b' },
  viewProfileChip: { minHeight: 44, paddingHorizontal: 16, borderRadius: 14, backgroundColor: '#2c6ba3', alignItems: 'center', justifyContent: 'center' },
  viewProfileChipText: { fontSize: 12, fontWeight: '900', color: '#ffffff' },
  restoreChip: { minHeight: 44, paddingHorizontal: 18, borderRadius: 14, backgroundColor: '#e5f4ea', alignItems: 'center', justifyContent: 'center' },
  restoreChipBusy: { opacity: 0.6 },
  restoreChipText: { fontSize: 12.5, fontWeight: '900', color: '#2f8f5b' },
  emptyCard: { backgroundColor: '#fcfeff', borderRadius: 22, borderWidth: 1, borderColor: '#dceef8', padding: 18, alignItems: 'center' },
  emptyTitle: { fontSize: 16, fontWeight: '900', color: '#123a5e' },
  emptyText: { marginTop: 8, fontSize: 13, lineHeight: 19, textAlign: 'center', fontWeight: '600', color: '#5d7b91' },
  errorText: { color: '#a33b3b', textAlign: 'center', fontWeight: '700' },
  retryButton: { marginTop: 12, backgroundColor: '#2c6ba3', paddingHorizontal: 18, paddingVertical: 10, borderRadius: 14 },
  retryText: { color: '#ffffff', fontWeight: '900' },
});

export default VetPatientOwners;
