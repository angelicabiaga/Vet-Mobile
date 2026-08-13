import React from 'react';
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

async function loadSyncedPatients() {
  const pets = await safeQuery(
    'pets',
    supabase
      .from('pets')
      .select(PET_FIELDS)
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

const VetPatients = ({ navigation, route }) => {
  const currentUser = getVetUser(route);
  const { scrollViewRef, lowerHeaderAnimation, handleScroll } = useLowerHeaderMotion();
  const [search, setSearch] = React.useState('');
  const [patients, setPatients] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');

  const loadPatients = React.useCallback(async () => {
    try {
      const rows = await loadSyncedPatients();
      setPatients(rows);
      setError('');
    } catch (loadError) {
      setError(loadError?.message || 'Unable to load patients.');
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
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
  }, [loadPatients]);

  const query = search.trim().toLowerCase();
  const visiblePatients = patients.filter((patient) => {
    if (!query) return true;
    return [
      patient.pet_name,
      patient.species,
      patient.breed,
      patient.sex,
      patient.owner?.full_name,
      patient.owner?.username,
      patient.owner?.email,
      patient.microchip_number,
      patient.status,
    ].some((value) => String(value || '').toLowerCase().includes(query));
  });

  const openPatientRecords = (patient) =>
    navigation.navigate(
      'VetMedRec',
      currentUser
        ? { user: currentUser, selectedPetId: patient.id, selectedPetName: patient.pet_name }
        : { selectedPetId: patient.id, selectedPetName: patient.pet_name }
    );

  return (
    <VetShell
      navigation={navigation}
      route={route}
      subtitle="Patient Records"
      caption="Patient Care"
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
            placeholder="Search pet, owner, breed, status"
            placeholderTextColor="#8aa2b4"
            value={search}
            onChangeText={setSearch}
          />
        </View>

        {loading && !patients.length ? (
          <View style={styles.emptyCard}>
            <ActivityIndicator size="large" color="#447C99" />
            <Text style={styles.emptyText}>Loading synced patients...</Text>
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
          visiblePatients.map((patient) => (
            <TouchableOpacity
              key={patient.id}
              style={styles.patientCard}
              onPress={() => openPatientRecords(patient)}
              activeOpacity={0.9}
            >
              <View style={styles.patientTopRow}>
                {patient.photo_url ? (
                  <Image
                    source={{ uri: patient.photo_url }}
                    style={styles.petPhoto}
                    resizeMode="cover"
                  />
                ) : (
                  <View style={styles.avatarCircle}>
                    <Text style={styles.avatarText}>
                      {(patient.pet_name || 'P').charAt(0).toUpperCase()}
                    </Text>
                  </View>
                )}

                <View style={styles.patientInfo}>
                  <Text style={styles.patientName}>{patient.pet_name || 'Pet'}</Text>
                  <Text style={styles.patientBreed}>
                    {[patient.species, patient.breed].filter(Boolean).join(' • ') ||
                      'Species not recorded'}
                  </Text>
                  <Text style={styles.ownerName}>
                    Owner:{' '}
                    {patient.owner?.full_name ||
                      patient.owner?.username ||
                      patient.owner?.email ||
                      'Not listed'}
                  </Text>
                </View>
              </View>

              <View style={styles.infoGrid}>
                <View style={styles.infoItem}>
                  <Text style={styles.infoLabel}>Sex</Text>
                  <Text style={styles.infoValue}>{patient.sex || 'Unknown'}</Text>
                </View>
                <View style={styles.infoItem}>
                  <Text style={styles.infoLabel}>Weight</Text>
                  <Text style={styles.infoValue}>
                    {patient.weight != null ? `${patient.weight} kg` : 'Not recorded'}
                  </Text>
                </View>
                <View style={styles.infoItem}>
                  <Text style={styles.infoLabel}>Medical Records</Text>
                  <Text style={styles.infoValue}>{patient.medicalRecordCount}</Text>
                </View>
                <View style={styles.infoItem}>
                  <Text style={styles.infoLabel}>Appointments</Text>
                  <Text style={styles.infoValue}>{patient.appointmentCount}</Text>
                </View>
              </View>

              <View style={styles.patientFooterRow}>
                <Text style={styles.lastVisitText}>
                  Last visit: {formatDate(patient.lastVisit)}
                </Text>
                <View style={styles.statusBadge}>
                  <Text style={styles.statusBadgeText}>{patient.status}</Text>
                </View>
              </View>
            </TouchableOpacity>
          ))}

        {!loading && !error && !visiblePatients.length ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No patient records found</Text>
            <Text style={styles.emptyText}>
              Patients registered on the web will appear here automatically.
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
  patientName: {
    fontSize: 17,
    fontWeight: '900',
    color: '#24566d',
  },
  patientBreed: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: '800',
    color: '#447C99',
  },
  ownerName: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: '600',
    color: '#5d7b91',
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
    marginTop: 5,
  },
  lastVisitText: {
    flex: 1,
    fontSize: 11.5,
    fontWeight: '700',
    color: '#5d7b91',
    marginRight: 10,
  },
  statusBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7,
    backgroundColor: '#e9f6fb',
  },
  statusBadgeText: {
    fontSize: 10.5,
    fontWeight: '900',
    color: '#24566d',
  },
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
