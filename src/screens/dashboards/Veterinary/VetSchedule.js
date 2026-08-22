import React, { useCallback, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import VetShell, { getVetUser } from './VetShell';
import { useLowerHeaderMotion } from './useLowerHeaderMotion';
import { formatTime, getVeterinarianScheduleOverrides, getVeterinarianWeeklySchedule } from '../../../api/mobileAppointmentService';

const WEEK_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function formatOverrideDate(value) {
  if (!value) return '';
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
}

export default function VetSchedule({ navigation, route }) {
  const currentUser = getVetUser(route);
  const vetId = currentUser?.id || currentUser?.user_id || currentUser?.profile_id || null;
  const { scrollViewRef, lowerHeaderAnimation, handleScroll } = useLowerHeaderMotion();

  const [weekly, setWeekly] = useState([]);
  const [overrides, setOverrides] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadSchedule = useCallback(async () => {
    if (!vetId) return;
    try {
      const [weeklyRows, overrideRows] = await Promise.all([
        getVeterinarianWeeklySchedule(vetId),
        getVeterinarianScheduleOverrides(vetId),
      ]);
      setWeekly(weeklyRows);
      setOverrides(overrideRows);
      setError('');
    } catch (loadError) {
      setError(loadError?.message || 'Unable to load your schedule.');
    } finally {
      setLoading(false);
    }
  }, [vetId]);

  useFocusEffect(
    useCallback(() => {
      loadSchedule();
    }, [loadSchedule])
  );

  const weeklyByDay = WEEK_LABELS.map((label, dayIndex) => ({
    label,
    dayIndex,
    entry: weekly.find((row) => row.day_of_week === dayIndex) || null,
  }));

  return (
    <VetShell
      navigation={navigation}
      route={route}
      subtitle="Schedule"
      caption="Your Availability"
      lowerHeaderAnimation={lowerHeaderAnimation}
    >
      <ScrollView
        ref={scrollViewRef}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={loadSchedule} />}
      >
        {loading && !weekly.length && !overrides.length ? (
          <View style={styles.emptyCard}>
            <ActivityIndicator size="large" color="#447C99" />
            <Text style={styles.emptyText}>Loading your schedule...</Text>
          </View>
        ) : null}

        {!loading && error ? (
          <View style={styles.emptyCard}>
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity style={styles.retryButton} onPress={loadSchedule} activeOpacity={0.9}>
              <Text style={styles.retryText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {!loading && !error ? (
          <>
            <View style={styles.sectionHeaderWrap}>
              <Text style={styles.sectionTitle}>Weekly Availability</Text>
              <Text style={styles.sectionSubtitle}>Your standard clinic hours, set by clinic staff</Text>
            </View>

            <View style={styles.card}>
              {weeklyByDay.map(({ label, entry }) => {
                const available = Boolean(entry?.is_available && entry?.start_time && entry?.end_time);
                return (
                  <View key={label} style={styles.dayRow}>
                    <Text style={styles.dayLabel}>{label}</Text>
                    <View style={[styles.dayBadge, available ? styles.dayBadgeOpen : styles.dayBadgeClosed]}>
                      <Text style={[styles.dayBadgeText, available ? styles.dayBadgeTextOpen : styles.dayBadgeTextClosed]}>
                        {available ? `${formatTime(entry.start_time)} - ${formatTime(entry.end_time)}` : 'Not available'}
                      </Text>
                    </View>
                  </View>
                );
              })}
              {!weekly.length ? (
                <Text style={styles.mutedText}>No weekly schedule has been set up for you yet.</Text>
              ) : null}
            </View>

            <View style={styles.sectionHeaderWrap}>
              <Text style={styles.sectionTitle}>Upcoming Overrides</Text>
              <Text style={styles.sectionSubtitle}>Date-specific changes to your usual hours</Text>
            </View>

            <View style={styles.card}>
              {overrides.length ? overrides.map((entry, index) => {
                const available = Boolean(entry.is_available && entry.start_time && entry.end_time);
                return (
                  <View key={`${entry.schedule_date}-${index}`} style={styles.dayRow}>
                    <Text style={styles.dayLabel}>{formatOverrideDate(entry.schedule_date)}</Text>
                    <View style={[styles.dayBadge, available ? styles.dayBadgeOpen : styles.dayBadgeClosed]}>
                      <Text style={[styles.dayBadgeText, available ? styles.dayBadgeTextOpen : styles.dayBadgeTextClosed]}>
                        {available ? `${formatTime(entry.start_time)} - ${formatTime(entry.end_time)}` : 'Unavailable'}
                      </Text>
                    </View>
                  </View>
                );
              }) : (
                <Text style={styles.mutedText}>No upcoming schedule overrides on record.</Text>
              )}
            </View>
          </>
        ) : null}
      </ScrollView>
    </VetShell>
  );
}

const styles = StyleSheet.create({
  scrollContent: { paddingHorizontal: 18, paddingTop: 8, paddingBottom: 120 },
  sectionHeaderWrap: { marginBottom: 10, marginTop: 4 },
  sectionTitle: { fontSize: 17, fontWeight: '900', color: '#24566d' },
  sectionSubtitle: { marginTop: 3, fontSize: 12, fontWeight: '600', color: '#5f7f8a' },
  card: { backgroundColor: '#fcfeff', borderRadius: 22, borderWidth: 1, borderColor: '#dceef8', padding: 14, marginBottom: 18 },
  dayRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#edf4f8' },
  dayLabel: { fontSize: 13.5, fontWeight: '800', color: '#24566d' },
  dayBadge: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999 },
  dayBadgeOpen: { backgroundColor: '#e5f4ea' },
  dayBadgeClosed: { backgroundColor: '#f2f5f6' },
  dayBadgeText: { fontSize: 11.5, fontWeight: '800' },
  dayBadgeTextOpen: { color: '#2f8f5b' },
  dayBadgeTextClosed: { color: '#7a8d96' },
  mutedText: { paddingVertical: 10, fontSize: 13, lineHeight: 19, color: '#7a95a7', fontWeight: '600', textAlign: 'center' },
  emptyCard: { backgroundColor: '#fcfeff', borderRadius: 22, borderWidth: 1, borderColor: '#dceef8', padding: 18, alignItems: 'center' },
  emptyText: { marginTop: 10, fontSize: 13, color: '#6a8aa0', fontWeight: '600' },
  errorText: { color: '#a33b3b', fontWeight: '700', textAlign: 'center' },
  retryButton: { marginTop: 12, backgroundColor: '#447C99', paddingHorizontal: 18, paddingVertical: 10, borderRadius: 14 },
  retryText: { color: '#fff', fontWeight: '900' },
});
