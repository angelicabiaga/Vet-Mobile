import React, { useEffect } from 'react';
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
import VetShell, { getVetUser } from './VetShell';
import { useLowerHeaderMotion } from './useLowerHeaderMotion';
import { supabase } from '../../../config/supabaseClient';
import { toUiPet } from '../../../api/petService';
import { formatAge, getPetPhotoSource } from '../PetOwner/PetOwnerMyPetsInfo';

const PET_FIELDS =
  'id,owner_id,pet_name,species,breed,sex,date_of_birth,weight,color,microchip_number,allergies,existing_conditions,notes,photo_url,is_archived,created_at,updated_at,owner:profiles!pets_owner_id_fkey(id,full_name,username,email,phone)';

function formatDate(value) {
  if (!value) return 'No visit recorded';
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

async function safeQuery(label, query) {
  try {
    const { data, error } = await query;
    if (error) {
      console.warn(`Vet Patients ${label} query skipped:`, error.code, error.message);
      return [];
    }
    return data || [];
  } catch (error) {
    console.warn(`Vet Patients ${label} query failed:`, error?.message || error);
    return [];
  }
}

// Reused by VetPatientProfile to load one patient with the same owner join.
export async function loadPatientById(petId) {
  if (!petId) return null;
  const { data, error } = await supabase
    .from('pets')
    .select(PET_FIELDS)
    .eq('id', petId)
    .maybeSingle();
  if (error) {
    console.warn('Vet Patients single-patient query failed:', error.code, error.message);
    return null;
  }
  return data || null;
}

// Animal patients registered under one owner -- the drill-in list after the
// Veterinarian picks a Pet Owner. Same underlying pets/appointments/
// medical_records relationships as before, just scoped to one owner_id.
async function loadOwnerPatients(ownerId) {
  const pets = await safeQuery(
    'pets',
    supabase
      .from('pets')
      .select(PET_FIELDS)
      .eq('owner_id', ownerId)
      .eq('is_archived', false)
      .order('pet_name', { ascending: true })
  );

  if (!pets.length) return [];

  const petIds = pets.map((pet) => pet.id).filter(Boolean);

  const [appointments, medicalRecords] = await Promise.all([
    safeQuery(
      'appointments',
      supabase
        .from('appointments')
        .select('id,pet_id,appointment_date,start_time,status,created_at')
        .in('pet_id', petIds)
        .order('appointment_date', { ascending: false })
    ),
    safeQuery(
      'medical records',
      supabase
        .from('medical_records')
        .select('id,pet_id,consultation_date,record_status,diagnosis,created_at')
        .in('pet_id', petIds)
        .order('consultation_date', { ascending: false })
    ),
  ]);

  return pets.map((pet) => {
    const petAppointments = appointments.filter((item) => item.pet_id === pet.id);
    const petRecords = medicalRecords.filter((item) => item.pet_id === pet.id);
    const latestRecord = petRecords[0] || null;
    const latestCompletedAppointment =
      petAppointments.find((item) => item.status === 'Completed') || petAppointments[0] || null;

    const lastVisit =
      latestRecord?.consultation_date ||
      latestCompletedAppointment?.appointment_date ||
      null;

    const hasActiveAppointment = petAppointments.some(
      (item) => item.status === 'Confirmed'
    );

    const status = hasActiveAppointment
      ? 'Upcoming Appointment'
      : latestRecord?.record_status === 'Draft'
        ? 'Under Treatment'
        : latestRecord
          ? 'Medical Record'
          : 'Registered';

    return {
      ...pet,
      lastVisit,
      status,
      medicalRecordCount: petRecords.length,
      appointmentCount: petAppointments.length,
    };
  });
}

function subscribePatients(onChange) {
  const specs = ['pets', 'appointments', 'medical_records'];

  return specs.map((table) =>
    supabase
      .channel(
        `pawcruz-mobile-vet-patients-${table}-${Date.now()}-${Math.random()
          .toString(36)
          .slice(2)}`
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table },
        onChange
      )
      .subscribe()
  );
}

const STATUS_STYLE = {
  'Upcoming Appointment': { badge: 'statusBadgeWarn', text: 'statusBadgeWarnText' },
  'Under Treatment': { badge: 'statusBadgeWarn', text: 'statusBadgeWarnText' },
  'Medical Record': { badge: 'statusBadgeGood', text: 'statusBadgeGoodText' },
  Registered: { badge: 'statusBadgeNeutral', text: 'statusBadgeNeutralText' },
};

const VetPatients = ({ navigation, route }) => {
  const currentUser = getVetUser(route);
  const ownerId = route?.params?.ownerId || null;
  const ownerName = route?.params?.ownerName || '';
  const { scrollViewRef, lowerHeaderAnimation, handleScroll } = useLowerHeaderMotion();
  const [search, setSearch] = React.useState('');
  const [patients, setPatients] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');

  // The Veterinarian flow is owner-first now: this screen only makes sense
  // scoped to one Pet Owner. A direct hit with no ownerId (stale link, etc.)
  // goes to the Pet Owners list instead of silently showing nothing.
  useEffect(() => {
    if (!ownerId) {
      navigation.replace('VetPatientOwners', { user: currentUser });
    }
  }, [ownerId, navigation, currentUser]);

  const loadPatients = React.useCallback(async () => {
    if (!ownerId) return;
    try {
      const rows = await loadOwnerPatients(ownerId);
      setPatients(rows);
      setError('');
    } catch (loadError) {
      setError(loadError?.message || 'Unable to load this owner\'s animal patients.');
    } finally {
      setLoading(false);
    }
  }, [ownerId]);

  React.useEffect(() => {
    if (!ownerId) return undefined;
    let active = true;

    const refresh = async () => {
      if (active) await loadPatients();
    };

    refresh();
    const channels = subscribePatients(refresh);
    const fallbackTimer = setInterval(refresh, 15000);

    return () => {
      active = false;
      clearInterval(fallbackTimer);
      channels.forEach((channel) => {
        if (channel) supabase.removeChannel(channel);
      });
    };
  }, [ownerId, loadPatients]);

  if (!ownerId) {
    return (
      <VetShell navigation={navigation} route={route} subtitle="Animal Patients" caption="Pet Owners">
        <View style={styles.emptyCard}>
          <ActivityIndicator size="large" color="#447C99" />
        </View>
      </VetShell>
    );
  }

  const query = search.trim().toLowerCase();
  const visiblePatients = patients.filter((patient) => {
    if (!query) return true;
    return [
      patient.pet_name,
      patient.species,
      patient.breed,
      patient.sex,
      patient.microchip_number,
      patient.status,
    ].some((value) => String(value || '').toLowerCase().includes(query));
  });

  const openPatientProfile = (patient) =>
    navigation.navigate(
      'VetPatientProfile',
      currentUser ? { user: currentUser, petId: patient.id } : { petId: patient.id }
    );

  return (
    <VetShell
      navigation={navigation}
      route={route}
      subtitle={ownerName ? `${ownerName}'s Animal Patients` : 'Animal Patients'}
      caption="Patient Care"
      showBack
      lowerHeaderAnimation={lowerHeaderAnimation}
    >
      <ScrollView
        ref={scrollViewRef}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={loadPatients} />
        }
      >
        <View style={styles.searchCard}>
          <TextInput
            style={styles.searchInput}
            placeholder="Search pet, species, breed, status"
            placeholderTextColor="#8aa2b4"
            value={search}
            onChangeText={setSearch}
          />
        </View>

        {loading && !patients.length ? (
          <View style={styles.emptyCard}>
            <ActivityIndicator size="large" color="#447C99" />
            <Text style={styles.emptyText}>Loading animal patients...</Text>
          </View>
        ) : null}

        {!loading && error ? (
          <View style={styles.emptyCard}>
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity style={styles.retryButton} onPress={loadPatients}>
              <Text style={styles.retryText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {!error &&
          visiblePatients.map((patient) => {
            const uiPet = toUiPet(patient);
            const petPhoto = getPetPhotoSource(uiPet);
            const statusStyle = STATUS_STYLE[patient.status] || STATUS_STYLE.Registered;

            return (
              <TouchableOpacity
                key={patient.id}
                style={styles.patientCard}
                onPress={() => openPatientProfile(patient)}
                activeOpacity={0.9}
                accessibilityRole="button"
                accessibilityLabel={`Open ${patient.pet_name || 'pet'}'s records`}
              >
                <View style={styles.patientTopRow}>
                  {petPhoto.source ? (
                    <Image source={petPhoto.source} style={styles.petPhoto} resizeMode="cover" />
                  ) : (
                    <View style={styles.avatarCircle}>
                      <Text style={styles.avatarText}>
                        {(patient.pet_name || 'P').charAt(0).toUpperCase()}
                      </Text>
                    </View>
                  )}

                  <View style={styles.patientInfo}>
                    <View style={styles.patientTopLine}>
                      <Text style={styles.patientName}>{patient.pet_name || 'Pet'}</Text>
                      <View style={[styles.statusBadge, styles[statusStyle.badge]]}>
                        <Text style={[styles.statusBadgeText, styles[statusStyle.text]]}>{patient.status}</Text>
                      </View>
                    </View>
                    <Text style={styles.patientBreed}>
                      {[patient.species, patient.breed].filter(Boolean).join(' • ') ||
                        'Species not recorded'}
                    </Text>
                    <Text style={styles.patientIdText}>{uiPet.referenceCode}</Text>
                  </View>
                </View>

                <View style={styles.infoGrid}>
                  <View style={styles.infoItem}>
                    <Text style={styles.infoLabel}>Sex</Text>
                    <Text style={styles.infoValue}>{patient.sex || 'Unknown'}</Text>
                  </View>
                  <View style={styles.infoItem}>
                    <Text style={styles.infoLabel}>Age</Text>
                    <Text style={styles.infoValue}>{formatAge(uiPet)}</Text>
                  </View>
                  <View style={styles.infoItem}>
                    <Text style={styles.infoLabel}>Weight</Text>
                    <Text style={styles.infoValue}>
                      {patient.weight != null ? `${patient.weight} kg` : 'Not recorded'}
                    </Text>
                  </View>
                  <View style={styles.infoItem}>
                    <Text style={styles.infoLabel}>Consultations</Text>
                    <Text style={styles.infoValue}>{patient.medicalRecordCount}</Text>
                  </View>
                </View>

                <View style={styles.patientFooterRow}>
                  <Text style={styles.lastVisitText}>
                    Latest consultation: {formatDate(patient.lastVisit)}
                  </Text>
                  <View style={styles.viewProfileChip}>
                    <Text style={styles.viewProfileChipText}>View Records</Text>
                  </View>
                </View>
              </TouchableOpacity>
            );
          })}

        {!loading && !error && !visiblePatients.length ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No animal patients found</Text>
            <Text style={styles.emptyText}>
              {patients.length
                ? 'Try another name, species, breed, or status.'
                : 'This owner has no registered animal patients yet.'}
            </Text>
          </View>
        ) : null}
      </ScrollView>
    </VetShell>
  );
};

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: 18,
    paddingTop: 8,
    paddingBottom: 120,
  },
  searchCard: {
    minHeight: 54,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#d7edf9',
    backgroundColor: '#fcfeff',
    paddingHorizontal: 14,
    justifyContent: 'center',
    marginBottom: 14,
  },
  searchInput: {
    fontSize: 14,
    fontWeight: '700',
    color: '#24566d',
  },
  patientCard: {
    backgroundColor: '#fcfeff',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#dceef8',
    padding: 16,
    marginBottom: 12,
  },
  patientTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarCircle: {
    width: 58,
    height: 58,
    borderRadius: 20,
    backgroundColor: '#e7f6f8',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  avatarText: {
    fontSize: 21,
    fontWeight: '900',
    color: '#24566d',
  },
  petPhoto: {
    width: 58,
    height: 58,
    borderRadius: 20,
    marginRight: 12,
    backgroundColor: '#e7f6f8',
  },
  patientInfo: {
    flex: 1,
  },
  patientTopLine: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  patientName: {
    fontSize: 17,
    fontWeight: '900',
    color: '#24566d',
    marginRight: 8,
  },
  patientBreed: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: '800',
    color: '#447C99',
  },
  patientIdText: {
    marginTop: 4,
    fontSize: 11.5,
    fontWeight: '700',
    color: '#5f7f94',
  },
  infoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#edf4f8',
  },
  infoItem: {
    width: '48%',
    marginBottom: 9,
  },
  infoLabel: {
    fontSize: 10,
    fontWeight: '900',
    color: '#7892a0',
    textTransform: 'uppercase',
  },
  infoValue: {
    marginTop: 3,
    fontSize: 12,
    fontWeight: '800',
    color: '#24566d',
  },
  patientFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  lastVisitText: {
    flex: 1,
    fontSize: 11.5,
    fontWeight: '700',
    color: '#5d7b91',
    marginRight: 10,
  },
  viewProfileChip: {
    minHeight: 44,
    paddingHorizontal: 16,
    borderRadius: 14,
    backgroundColor: '#447C99',
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewProfileChipText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#ffffff',
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    alignSelf: 'flex-start',
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  statusBadgeNeutral: { backgroundColor: '#e8f4fb' },
  statusBadgeNeutralText: { color: '#447C99' },
  statusBadgeGood: { backgroundColor: '#e5f4ea' },
  statusBadgeGoodText: { color: '#2f8f5b' },
  statusBadgeWarn: { backgroundColor: '#fdf1dc' },
  statusBadgeWarnText: { color: '#a5680b' },
  emptyCard: {
    backgroundColor: '#fcfeff',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#dceef8',
    padding: 18,
    alignItems: 'center',
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#24566d',
  },
  emptyText: {
    marginTop: 8,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    fontWeight: '600',
    color: '#5d7b91',
  },
  errorText: {
    color: '#a33b3b',
    textAlign: 'center',
    fontWeight: '700',
  },
  retryButton: {
    marginTop: 12,
    backgroundColor: '#447C99',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 14,
  },
  retryText: {
    color: '#ffffff',
    fontWeight: '900',
  },
});

export default VetPatients;
