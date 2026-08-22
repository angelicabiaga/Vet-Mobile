import React from 'react';
import {
  ActivityIndicator,
  Image,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { styles as dashboardStyles } from '../../styles/PetOwnerDashboardDesign';
import VetShell, { getVetUser } from './VetShell';
import { useLowerHeaderMotion } from './useLowerHeaderMotion';
import { supabase } from '../../../config/supabaseClient';

const HERO_SLIDES = [
  {
    key: 'patients',
    label: 'Review patients',
    title: 'Keep every patient profile ready for faster clinical care.',
    description: 'Open Animal Patients to review pet, owner, and medical history details in one place.',
    route: 'VetPatientOwners',
  },
  {
    key: 'appointments',
    label: 'Check appointments',
    title: 'Stay ready for today’s scheduled consultations.',
    description: 'Open Appointments to review assigned pets, visit reasons, schedules, and appointment status.',
    route: 'VetAppointment',
  },
  {
    key: 'schedule',
    label: 'Check your schedule',
    title: 'Know your availability before the clinic books your day.',
    description: 'Open Schedule to review your weekly hours and any upcoming date-specific changes.',
    route: 'VetSchedule',
  },
];

const SERVICE_CARDS = [
  { key: 'patients', title: 'Animal Patients', subtitle: 'Pets and medical history', icon: require('../../assets/Pets_Icon.png'), route: 'VetPatientOwners' },
  { key: 'appointments', title: 'Appointments', subtitle: 'Check daily schedule', icon: require('../../assets/Appointment_Icon.png'), route: 'VetAppointment' },
  { key: 'schedule', title: 'Schedule', subtitle: 'Your weekly availability', icon: require('../../assets/calendar.png'), route: 'VetSchedule' },
  { key: 'messages', title: 'Messages', subtitle: 'Talk to pet owners', icon: require('../../assets/Message_Icon.png'), route: 'VetMessages' },
];

const getId = (user) => user?.id || user?.user_id || user?.profile_id || '';
const todayLocal = () => {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};

async function safeQuery(label, query) {
  try {
    const { data, error } = await query;
    if (error) {
      console.warn(`Vet dashboard ${label} query skipped:`, error.code, error.message);
      return [];
    }
    return data || [];
  } catch (error) {
    console.warn(`Vet dashboard ${label} query failed:`, error?.message || error);
    return [];
  }
}

async function loadVetDashboardData(veterinarianId) {
  if (!veterinarianId) {
    return { appointments: [], medicalRecords: [], activityLogs: [] };
  }

  const [appointments, medicalRecords, activityLogs] = await Promise.all([
    safeQuery(
      'appointments',
      supabase
        .from('appointments')
        .select('id,pet_id,owner_id,appointment_date,start_time,status,created_at,updated_at')
        .eq('veterinarian_id', veterinarianId)
        .order('appointment_date', { ascending: false })
        .limit(100)
    ),
    safeQuery(
      'medical records',
      supabase
        .from('medical_records')
        .select('id,pet_id,owner_id,veterinarian_id,consultation_date,record_status,created_at,updated_at')
        .eq('veterinarian_id', veterinarianId)
        .order('consultation_date', { ascending: false })
        .limit(100)
    ),
    safeQuery(
      'activity',
      supabase
        .from('activity_logs')
        .select('id,user_id,action,module,description,created_at')
        .eq('user_id', veterinarianId)
        .order('created_at', { ascending: false })
        .limit(8)
    ),
  ]);

  return { appointments, medicalRecords, activityLogs };
}

function subscribeVetDashboard(veterinarianId, onChange) {
  if (!veterinarianId) return [];

  const specs = [
    { table: 'appointments', filter: `veterinarian_id=eq.${veterinarianId}` },
    { table: 'medical_records', filter: `veterinarian_id=eq.${veterinarianId}` },
    { table: 'activity_logs', filter: `user_id=eq.${veterinarianId}` },
  ];

  return specs.map(({ table, filter }) =>
    supabase
      .channel(`pawcruz-mobile-vet-dashboard-${table}-${veterinarianId}-${Date.now()}-${Math.random().toString(36).slice(2)}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table, filter },
        onChange
      )
      .subscribe()
  );
}

const VetDashboard = ({ navigation, route }) => {
  const currentUser = getVetUser(route);
  const veterinarianId = getId(currentUser);
  const [activeSlide, setActiveSlide] = React.useState(0);
  const [dashboardData, setDashboardData] = React.useState({
    appointments: [],
    medicalRecords: [],
    activityLogs: [],
  });
  const [loading, setLoading] = React.useState(true);
  const { scrollViewRef, lowerHeaderAnimation, handleScroll } = useLowerHeaderMotion();

  const navigateVet = (screen) =>
    navigation.navigate(screen, currentUser ? { user: currentUser } : undefined);

  const refreshDashboard = React.useCallback(async () => {
    if (!veterinarianId) return;
    try {
      const next = await loadVetDashboardData(veterinarianId);
      setDashboardData(next);
    } finally {
      setLoading(false);
    }
  }, [veterinarianId]);

  React.useEffect(() => {
    if (!veterinarianId) {
      setLoading(false);
      return undefined;
    }

    let active = true;
    refreshDashboard();

    const channels = subscribeVetDashboard(veterinarianId, () => {
      if (active) refreshDashboard();
    });

    const fallbackTimer = setInterval(() => {
      if (active) refreshDashboard();
    }, 15000);

    return () => {
      active = false;
      clearInterval(fallbackTimer);
      channels.forEach((channel) => {
        if (channel) supabase.removeChannel(channel);
      });
    };
  }, [veterinarianId, refreshDashboard]);

  const today = todayLocal();
  const todayAppointments = dashboardData.appointments.filter(
    (item) => item.appointment_date === today && item.status === 'Confirmed'
  );
  const finalizedRecords = dashboardData.medicalRecords.filter(
    (item) => item.record_status === 'Finalized'
  );
  const patientIds = new Set([
    ...dashboardData.appointments.map((item) => item.pet_id).filter(Boolean),
    ...dashboardData.medicalRecords.map((item) => item.pet_id).filter(Boolean),
  ]);
  const latestActivity = dashboardData.activityLogs?.[0];

  const overviewCards = [
    {
      key: 'today',
      label: "Today's Appointments",
      value: String(todayAppointments.length),
      detail: todayAppointments.length === 1 ? '1 confirmed appointment today' : `${todayAppointments.length} confirmed appointments today`,
      route: 'VetAppointment',
      accent: dashboardStyles.activityTrackAccentGreen,
    },
    {
      key: 'patients',
      label: 'Animal Patients',
      value: String(patientIds.size),
      detail: `${finalizedRecords.length === 1 ? '1 finalized record' : `${finalizedRecords.length} finalized records`} across your patients`,
      route: 'VetPatientOwners',
      accent: dashboardStyles.activityTrackAccentBlue,
    },
  ];

  return (
    <VetShell
      navigation={navigation}
      route={route}
      subtitle="Veterinary Dashboard"
      caption="Clinical Workspace"
      lowerHeaderAnimation={lowerHeaderAnimation}
    >
      <ScrollView
        ref={scrollViewRef}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={localStyles.scrollContent}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={refreshDashboard} />}
      >
        <View style={localStyles.heroOuterCard}>
          <TouchableOpacity
            style={localStyles.heroSlideCard}
            onPress={() => navigateVet(HERO_SLIDES[activeSlide].route)}
            activeOpacity={0.92}
          >
            <Image
              source={require('../../assets/dashboard.jpg')}
              style={localStyles.heroSlideBackground}
              resizeMode="cover"
            />
            <View style={localStyles.heroSlideOverlay} />

            <View style={localStyles.heroSlideContent}>
              <View style={localStyles.heroSlideTopRow}>
                <Text style={localStyles.heroSlideLabel}>
                  {HERO_SLIDES[activeSlide].label}
                </Text>

                <View style={localStyles.heroDotsRow}>
                  {HERO_SLIDES.map((slide, index) => (
                    <TouchableOpacity
                      key={slide.key}
                      onPress={() => setActiveSlide(index)}
                      style={[
                        localStyles.heroDot,
                        index === activeSlide && localStyles.heroDotActive,
                      ]}
                      activeOpacity={0.8}
                    />
                  ))}
                </View>
              </View>

              <Text style={localStyles.heroQuoteMark}>"</Text>
              <Text style={localStyles.heroSlideTitle}>
                {HERO_SLIDES[activeSlide].title}
              </Text>
              <Text style={localStyles.heroDescription}>
                {HERO_SLIDES[activeSlide].description}
              </Text>
            </View>
          </TouchableOpacity>
        </View>

        <View style={dashboardStyles.sectionHeaderWrap}>
          <Text style={dashboardStyles.sectionTitle}>Track Activities</Text>
          <Text style={dashboardStyles.sectionSubtitle}>
            Your appointments, assigned patients, and medical records at a glance.
          </Text>
        </View>

        {loading && !dashboardData.appointments.length && !dashboardData.medicalRecords.length ? (
          <ActivityIndicator size="large" color="#447C99" style={{ marginBottom: 18 }} />
        ) : null}

        <View style={dashboardStyles.activityPanel}>
          <View style={dashboardStyles.activityStatsGrid}>
            {overviewCards.map((card) => (
              <TouchableOpacity
                key={card.key}
                style={dashboardStyles.activityStatCard}
                onPress={() => navigateVet(card.route)}
                activeOpacity={0.88}
              >
                <View style={[dashboardStyles.activityStatAccent, card.accent]} />
                <Text style={dashboardStyles.activityStatLabel}>{card.label}</Text>
                <Text style={dashboardStyles.activityStatValue}>{card.value}</Text>
                <Text style={dashboardStyles.activityStatDetail}>{card.detail}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={dashboardStyles.activityTrackNote}>
            {latestActivity
              ? `Latest activity: ${latestActivity.description || latestActivity.action || 'PawCruz activity'}`
              : 'Your latest veterinarian activity will appear here automatically.'}
          </Text>
        </View>

        <View style={dashboardStyles.sectionHeaderWrap}>
          <Text style={dashboardStyles.sectionTitle}>Veterinary Services</Text>
          <Text style={dashboardStyles.sectionSubtitle}>
            Fast access to the tools veterinarians need for patient care.
          </Text>
        </View>

        <View style={dashboardStyles.menuGrid}>
          {SERVICE_CARDS.map((item) => (
            <TouchableOpacity
              key={item.key}
              style={dashboardStyles.menuCard}
              onPress={() => navigateVet(item.route)}
              activeOpacity={0.9}
            >
              <View style={dashboardStyles.iconCircle}>
                <Image source={item.icon} style={dashboardStyles.iconImage} resizeMode="contain" />
              </View>
              <Text style={dashboardStyles.menuLabel}>{item.title}</Text>
              <Text style={localStyles.serviceSubtitle}>{item.subtitle}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </VetShell>
  );
};

const localStyles = StyleSheet.create({
  scrollContent: { paddingHorizontal: 18, paddingTop: 8, paddingBottom: 110 },
  heroOuterCard: {
    borderRadius: 28,
    paddingHorizontal: 20,
    paddingVertical: 22,
    marginBottom: 18,
    backgroundColor: '#63B6C5',
    shadowColor: '#5b84a3',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 6,
  },
  heroSlideCard: {
    marginTop: 4,
    minHeight: 210,
    backgroundColor: '#447C99',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    overflow: 'hidden',
  },
  heroSlideBackground: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    width: '100%',
    height: '100%',
  },
  heroSlideOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(4,32,50,0.66)',
  },
  heroSlideContent: {
    minHeight: 210,
    paddingHorizontal: 18,
    paddingVertical: 18,
    justifyContent: 'center',
  },
  heroSlideTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  heroSlideLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#dbeaf5',
    textTransform: 'uppercase',
  },
  heroDotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.5)',
    marginHorizontal: 6,
  },
  heroDotActive: {
    width: 18,
    backgroundColor: '#ffffff',
  },
  heroQuoteMark: {
    fontSize: 42,
    lineHeight: 42,
    fontWeight: '900',
    color: 'rgba(255,255,255,0.74)',
    marginTop: 8,
    marginBottom: -6,
  },
  heroSlideTitle: {
    fontSize: 20,
    lineHeight: 27,
    fontWeight: '900',
    color: '#ffffff',
    marginBottom: 8,
  },
  heroDescription: {
    color: '#edf7fc',
    fontSize: 14,
    lineHeight: 21,
    maxWidth: '95%',
    fontWeight: '500',
  },

  overviewPanel: {
    backgroundColor: '#ffffff',
    borderRadius: 26,
    borderWidth: 1,
    borderColor: '#dceef8',
    padding: 14,
    marginBottom: 22,
    shadowColor: '#24566d',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 3,
  },
  overviewGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  overviewCard: {
    width: '48%',
    minHeight: 142,
    backgroundColor: '#f8fcfe',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#dceef8',
    padding: 14,
    marginBottom: 12,
  },
  overviewLabel: { fontSize: 12, lineHeight: 17, fontWeight: '900', color: '#55798b', textTransform: 'uppercase' },
  overviewValue: { marginTop: 8, fontSize: 34, lineHeight: 38, fontWeight: '900', color: '#24566d' },
  overviewDetail: { marginTop: 8, fontSize: 11.5, lineHeight: 17, fontWeight: '700', color: '#688493' },
  latestActivity: {
    marginTop: 2,
    padding: 12,
    borderRadius: 14,
    backgroundColor: '#eef8fb',
    color: '#527586',
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '700',
  },

  serviceGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  serviceCard: { width: '48%', backgroundColor: '#fcfeff', borderRadius: 22, borderWidth: 1, borderColor: '#dceef8', padding: 14, marginBottom: 12, minHeight: 150 },
  serviceIconWrap: { width: 48, height: 48, borderRadius: 18, backgroundColor: '#e7f6f8', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  serviceIcon: { width: 24, height: 24, tintColor: '#24566d' },
  serviceTitle: { fontSize: 14, lineHeight: 19, fontWeight: '900', color: '#24566d' },
  serviceSubtitle: { marginTop: 5, fontSize: 12, lineHeight: 17, fontWeight: '600', color: '#5d7b91' },
});

export default VetDashboard;
