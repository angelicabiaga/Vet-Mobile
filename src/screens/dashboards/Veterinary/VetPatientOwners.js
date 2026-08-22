import React, { useCallback, useEffect, useState } from 'react';
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
import { getPetOwnersDirectory } from '../../../api/petService';

async function loadPetCountsByOwner() {
  const { data, error } = await supabase
    .from('pets')
    .select('owner_id')
    .eq('is_archived', false);
  if (error) {
    console.warn('Vet Patient Owners pet-count query skipped:', error.code, error.message);
    return {};
  }
  return (data || []).reduce((counts, row) => {
    const id = String(row.owner_id || '');
    if (!id) return counts;
    counts[id] = (counts[id] || 0) + 1;
    return counts;
  }, {});
}

function subscribeOwnersAndPets(onChange) {
  const specs = [
    { table: 'profiles', filter: 'role=eq.pet_owner' },
    { table: 'pets' },
  ];

  return specs.map(({ table, filter }) =>
    supabase
      .channel(`pawcruz-mobile-vet-owners-${table}-${Date.now()}-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table, ...(filter ? { filter } : {}) }, onChange)
      .subscribe()
  );
}

const DEFAULT_AVATAR = require('../../assets/Profile.png');

const VetPatientOwners = ({ navigation, route }) => {
  const currentUser = getVetUser(route);
  const { scrollViewRef, lowerHeaderAnimation, handleScroll } = useLowerHeaderMotion();
  const [search, setSearch] = useState('');
  const [owners, setOwners] = useState([]);
  const [petCounts, setPetCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadOwners = useCallback(async () => {
    try {
      const [ownerRows, counts] = await Promise.all([
        getPetOwnersDirectory(),
        loadPetCountsByOwner(),
      ]);
      setOwners(ownerRows);
      setPetCounts(counts);
      setError('');
    } catch (loadError) {
      setError(loadError?.message || 'Unable to load pet owners.');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadOwners();
      const channels = subscribeOwnersAndPets(loadOwners);
      const fallbackTimer = setInterval(loadOwners, 20000);
      return () => {
        clearInterval(fallbackTimer);
        channels.forEach((channel) => { if (channel) supabase.removeChannel(channel); });
      };
    }, [loadOwners])
  );

  const query = search.trim().toLowerCase();
  const visibleOwners = owners.filter((owner) => {
    if (!query) return true;
    return [owner.full_name, owner.username, owner.phone, owner.email].some((value) =>
      String(value || '').toLowerCase().includes(query)
    );
  });

  const openOwnerPatients = (owner) =>
    navigation.navigate(
      'VetPatients',
      currentUser
        ? { user: currentUser, ownerId: owner.id, ownerName: owner.full_name || owner.username }
        : { ownerId: owner.id, ownerName: owner.full_name || owner.username }
    );

  return (
    <VetShell
      navigation={navigation}
      route={route}
      subtitle="Animal Patients"
      caption="Pet Owners"
      lowerHeaderAnimation={lowerHeaderAnimation}
    >
      <ScrollView
        ref={scrollViewRef}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={loadOwners} />}
      >
        <View style={styles.searchCard}>
          <TextInput
            style={styles.searchInput}
            placeholder="Search owner name, contact number, or email"
            placeholderTextColor="#8aa2b4"
            value={search}
            onChangeText={setSearch}
          />
        </View>

        {loading && !owners.length ? (
          <View style={styles.emptyCard}>
            <ActivityIndicator size="large" color="#447C99" />
            <Text style={styles.emptyText}>Loading pet owners...</Text>
          </View>
        ) : null}

        {!loading && error ? (
          <View style={styles.emptyCard}>
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity style={styles.retryButton} onPress={loadOwners} activeOpacity={0.9}>
              <Text style={styles.retryText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {!error &&
          visibleOwners.map((owner) => {
            const patientCount = petCounts[String(owner.id)] || 0;
            return (
              <TouchableOpacity
                key={owner.id}
                style={styles.ownerCard}
                onPress={() => openOwnerPatients(owner)}
                activeOpacity={0.9}
                accessibilityRole="button"
                accessibilityLabel={`Open ${owner.full_name || 'owner'}'s animal patients`}
              >
                <View style={styles.ownerTopRow}>
                  <Image
                    source={owner.avatar_url ? { uri: owner.avatar_url } : DEFAULT_AVATAR}
                    style={styles.ownerAvatar}
                    resizeMode="cover"
                  />
                  <View style={styles.ownerInfo}>
                    <Text style={styles.ownerName}>{owner.full_name || owner.username || 'Pet Owner'}</Text>
                    {owner.phone ? <Text style={styles.ownerDetail}>{owner.phone}</Text> : null}
                    {owner.email ? <Text style={styles.ownerDetail}>{owner.email}</Text> : null}
                    {owner.address ? <Text style={styles.ownerDetail}>{owner.address}</Text> : null}
                  </View>
                </View>

                <View style={styles.ownerFooterRow}>
                  <Text style={styles.patientCountText}>
                    {patientCount} animal patient{patientCount === 1 ? '' : 's'} registered
                  </Text>
                  <View style={styles.viewOwnerChip}>
                    <Text style={styles.viewOwnerChipText}>View Animal Patients</Text>
                  </View>
                </View>
              </TouchableOpacity>
            );
          })}

        {!loading && !error && !visibleOwners.length ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>{owners.length ? 'No owners found' : 'No pet owners yet'}</Text>
            <Text style={styles.emptyText}>
              {owners.length
                ? 'Try another name, contact number, or email.'
                : 'Pet owners registered on the web will appear here automatically.'}
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
    minHeight: 54,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#d7edf9',
    backgroundColor: '#fcfeff',
    paddingHorizontal: 14,
    justifyContent: 'center',
    marginBottom: 14,
  },
  searchInput: { fontSize: 14, fontWeight: '700', color: '#24566d' },
  ownerCard: {
    backgroundColor: '#fcfeff',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#dceef8',
    padding: 16,
    marginBottom: 12,
  },
  ownerTopRow: { flexDirection: 'row', alignItems: 'flex-start' },
  ownerAvatar: { width: 58, height: 58, borderRadius: 20, marginRight: 12, backgroundColor: '#e7f6f8' },
  ownerInfo: { flex: 1 },
  ownerName: { fontSize: 16.5, fontWeight: '900', color: '#24566d' },
  ownerDetail: { marginTop: 3, fontSize: 12, fontWeight: '600', color: '#5d7b91' },
  ownerFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#edf4f8',
  },
  patientCountText: { flex: 1, fontSize: 12, fontWeight: '800', color: '#447C99', marginRight: 10 },
  viewOwnerChip: {
    minHeight: 44,
    paddingHorizontal: 16,
    borderRadius: 14,
    backgroundColor: '#447C99',
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewOwnerChipText: { fontSize: 12, fontWeight: '900', color: '#ffffff' },
  emptyCard: { backgroundColor: '#fcfeff', borderRadius: 22, borderWidth: 1, borderColor: '#dceef8', padding: 18, alignItems: 'center' },
  emptyTitle: { fontSize: 16, fontWeight: '900', color: '#24566d' },
  emptyText: { marginTop: 8, fontSize: 13, lineHeight: 19, textAlign: 'center', fontWeight: '600', color: '#5d7b91' },
  errorText: { color: '#a33b3b', textAlign: 'center', fontWeight: '700' },
  retryButton: { marginTop: 12, backgroundColor: '#447C99', paddingHorizontal: 18, paddingVertical: 10, borderRadius: 14 },
  retryText: { color: '#ffffff', fontWeight: '900' },
});

export default VetPatientOwners;
