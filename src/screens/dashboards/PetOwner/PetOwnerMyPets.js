import { SafeAreaView } from 'react-native-safe-area-context';
import PetOwnerBottomNav from './PetOwnerBottomNav';
import PetOwnerHeaderGreeting from './PetOwnerHeaderGreeting';
import { useLowerHeaderMotion } from '../Veterinary/useLowerHeaderMotion';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Dropdown } from 'react-native-element-dropdown';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  Image,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { styles } from '../../styles/PetOwnerMyPetsDesign';
import { computePatientStatus, formatAge, getPetPhotoSource } from './PetOwnerMyPetsInfo';
import { archiveOwnerPet, getOwnerPets, subscribeToOwnerPets } from '../../../api/petService';
import { getMobileMedicalRecords, subscribeToMedicalRecords, formatMedicalDate } from '../../../api/medicalRecordService';

const DEFAULT_PROFILE_IMAGE = require('../../assets/Profile.png');

// Same page size as the web Animal Patients list.
const PAGE_SIZE = 8;

const PetOwnerMyPets = ({ navigation, route }) => {
  const loggedInUser = route?.params?.user;
  const scrollViewRef = useRef(null);
  const profileImageUri = loggedInUser?.profileImageUri || loggedInUser?.avatar || '';
  const headerDisplayName =
    loggedInUser?.username ||
    loggedInUser?.name ||
    loggedInUser?.fullName ||
    'Pet Owner';
  // Shared, steady hide-on-scroll for the lower header row (same as the vet header).
  const headerMotion = useLowerHeaderMotion();
  const lowerHeaderAnimation = headerMotion.lowerHeaderAnimation;
  const isLowerHeaderVisible = useRef(true);
  const lastScrollY = useRef(0);
  const [isHeaderMenuVisible, setIsHeaderMenuVisible] = useState(false);
  const [pets, setPets] = useState([]);
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [restoringId, setRestoringId] = useState(null);
  const [speciesFilter, setSpeciesFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const normalizedSearchQuery = searchQuery.trim().toLowerCase();

  const loadData = useCallback(async () => {
    if (!loggedInUser?.id) return;
    try {
      const [ownerPets, ownerRecords] = await Promise.all([
        getOwnerPets(loggedInUser.id, { includeArchived: true }),
        getMobileMedicalRecords({ ...loggedInUser, role: loggedInUser?.role || 'pet_owner' }),
      ]);
      setPets(ownerPets);
      setRecords(ownerRecords);
      setError('');
    } catch (e) {
      setError(e?.message || 'Unable to load your animal patients.');
    } finally {
      setLoading(false);
    }
  }, [loggedInUser?.id]);

  useFocusEffect(
    useCallback(() => {
      loadData();
      const petsChannel = subscribeToOwnerPets(loggedInUser?.id, loadData);
      const recordsUnsubscribe = subscribeToMedicalRecords(
        { ...loggedInUser, role: loggedInUser?.role || 'pet_owner' },
        loadData
      );
      return () => {
        if (petsChannel?.unsubscribe) petsChannel.unsubscribe();
        recordsUnsubscribe?.();
      };
    }, [loggedInUser?.id, loadData]),
  );

  const recordsByPet = records.reduce((acc, record) => {
    const id = String(record.pet_id || '');
    if (!id) return acc;
    (acc[id] = acc[id] || []).push(record);
    return acc;
  }, {});

  const patients = pets.map((pet) => {
    const petRecords = recordsByPet[String(pet.id)] || [];
    const sorted = [...petRecords].sort(
      (a, b) => new Date(b.consultation_date || 0) - new Date(a.consultation_date || 0)
    );
    return {
      pet,
      visitCount: petRecords.length,
      latestDate: sorted[0]?.consultation_date || null,
      status: computePatientStatus(petRecords),
    };
  });

  // Like the web's View Archived toggle: show either active or archived pets.
  const scopedPatients = patients.filter(({ pet }) => pet.isArchived === showArchived);

  // Species the owner's pets actually use -- mobile and web name species
  // differently ("Canine (Dog)" vs "Dog"), so a fixed list would miss some.
  const speciesFilterOptions = useMemo(() => {
    const species = [...new Set(pets.map((pet) => String(pet.species || '').trim()).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b));
    return [{ label: 'All species', value: 'all' }, ...species.map((value) => ({ label: value, value }))];
  }, [pets]);

  const filteredPatients = scopedPatients.filter(({ pet }) => {
    if (speciesFilter !== 'all' && String(pet.species || '').trim().toLowerCase() !== speciesFilter.toLowerCase()) {
      return false;
    }
    if (!normalizedSearchQuery) return true;
    return [pet.name, pet.breed, pet.species].some((value) =>
      value?.toLowerCase().includes(normalizedSearchQuery)
    );
  });

  // Display: 8 pets per page with page buttons, like the web list.
  const totalPages = Math.max(1, Math.ceil(filteredPatients.length / PAGE_SIZE));
  const page = Math.min(currentPage, totalPages);
  const pagedPatients = filteredPatients.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const hasActiveFilters = Boolean(searchQuery.trim()) || speciesFilter !== 'all';

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, speciesFilter, showArchived]);

  const goToPage = (nextPage) => {
    setCurrentPage(nextPage);
    scrollViewRef.current?.scrollTo({ y: 0, animated: true });
  };

  const clearFilters = () => {
    setSearchQuery('');
    setSpeciesFilter('all');
  };

  const restorePet = async (pet) => {
    if (restoringId) return;
    try {
      setRestoringId(pet.id);
      await archiveOwnerPet(pet.id, loggedInUser?.id, false);
      await loadData();
      Alert.alert('Animal Patients', 'Pet record restored successfully.');
    } catch (e) {
      Alert.alert('Animal Patients', e?.message || 'Unable to update the pet archive status.');
    } finally {
      setRestoringId(null);
    }
  };

  const animateLowerHeader = (toValue) => {
    const shouldBeVisible = toValue === 1;
    if (isLowerHeaderVisible.current === shouldBeVisible) return;
    isLowerHeaderVisible.current = shouldBeVisible;
    lowerHeaderAnimation.stopAnimation();
    Animated.timing(lowerHeaderAnimation, {
      toValue,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  };

  const handleScroll = (event) => headerMotion.handleScroll(event);

  const openPatient = (petId) => {
    navigation.navigate('PetOwnerMyPetsView', { user: loggedInUser, petId });
  };

  return (
    <LinearGradient colors={['#f7fbfc', '#eef7f8', '#ffffff']} style={styles.background}>
      <SafeAreaView style={styles.container}>
        <LinearGradient
          colors={['#3a7ab8', '#3a7ab8', '#3a7ab8']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.headerBar}
        >
          <LinearGradient
            colors={['#1e5a8c', '#256297', '#2c6ba3', '#3a7ab8']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.headerTopBand}
          >
            <View style={styles.headerTopRow}>
            <TouchableOpacity
              style={styles.brandSection}
              onPress={() => navigation.navigate('petowner-screen', { user: loggedInUser })}
              activeOpacity={0.85}
            >
              <View style={styles.logoWrap}>
                <Image source={require('../../assets/paw1.png')} style={styles.headerLogo} resizeMode="contain" />
              </View>

              <View style={styles.brandBlock}>
                <Text style={styles.headerTitle}>PawCruz</Text>
                <Text style={styles.headerSubtitle}>Animal Patients</Text>
              </View>
            </TouchableOpacity>

            <View style={styles.headerActions}>
              <TouchableOpacity
                style={styles.notifButton}
                onPress={() => navigation.navigate('PetOwnerNotif', { user: loggedInUser })}
                activeOpacity={0.85}
              >
                <View style={styles.notifBadge} />
                <Image source={require('../../assets/Bell_Icon.png')} style={styles.notifIcon} resizeMode="contain" />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.profileButton}
                onPress={() => navigation.navigate('PetOwnerProfile', { user: loggedInUser })}
                activeOpacity={0.85}
              >
                <Image source={DEFAULT_PROFILE_IMAGE} style={styles.profileIcon} resizeMode="contain" />
              </TouchableOpacity>
            </View>
          </View>
          </LinearGradient>

          <Animated.View
            style={[
              styles.headerBottomRowWrap,
              {
                maxHeight: lowerHeaderAnimation.interpolate({ inputRange: [0, 1], outputRange: [0, 96] }),
                opacity: lowerHeaderAnimation,
                transform: [
                  {
                    translateY: lowerHeaderAnimation.interpolate({ inputRange: [0, 1], outputRange: [-18, 0] }),
                  },
                ],
              },
            ]}
          >
            <View style={styles.headerBottomRow}>

              <PetOwnerHeaderGreeting caption="Manage your animal patients" user={loggedInUser} />
            </View>
          </Animated.View>

        </LinearGradient>

        <ScrollView
          ref={scrollViewRef}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >

          <View style={styles.petListCard}>
            <View style={styles.searchBarWrap}>
              <Image source={require('../../assets/Search.png')} style={styles.searchBarIcon} resizeMode="contain" />
              <TextInput
                value={searchQuery}
                onChangeText={setSearchQuery}
                style={styles.searchBarInput}
                placeholder="Search your animal patient..."
                placeholderTextColor="#87a0b1"
              />
            </View>

            <View style={styles.archiveFilterRow}>
              <View style={[styles.dropdownShell, styles.speciesFilterShell]}>
                <Dropdown
                  style={styles.speciesFilterDropdown}
                  containerStyle={styles.searchableDropdownContainer}
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
              <View style={styles.resultSummaryRow}>
                <Text style={styles.archiveFilterSummary}>
                  {filteredPatients.length === 0
                    ? `Showing 0 of ${scopedPatients.length} ${showArchived ? 'archived' : 'active'} pets`
                    : `Showing ${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, filteredPatients.length)} of ${filteredPatients.length} pets`}
                </Text>
                {hasActiveFilters ? (
                  <TouchableOpacity onPress={clearFilters} activeOpacity={0.8} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Text style={styles.clearFiltersText}>Clear filters</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            ) : null}

            {loading ? (
              <View style={[styles.searchEmptyState, { alignItems: 'center' }]}>
                <ActivityIndicator color="#2c6ba3" />
                <Text style={[styles.searchEmptyText, { marginTop: 10 }]}>Loading your animal patients...</Text>
              </View>
            ) : null}

            {!loading && error ? (
              <View style={styles.searchEmptyState}>
                <Text style={styles.searchEmptyTitle}>Something went wrong</Text>
                <Text style={styles.searchEmptyText}>{error}</Text>
                <TouchableOpacity
                  style={[styles.primaryActionButton, { alignSelf: 'flex-start', marginTop: 12 }]}
                  onPress={loadData}
                  activeOpacity={0.9}
                >
                  <Text style={styles.primaryActionText}>Retry</Text>
                </TouchableOpacity>
              </View>
            ) : null}

            {!loading && !error && pagedPatients.length
              ? pagedPatients.map(({ pet, visitCount, latestDate, status }) => {
                  const petPhoto = getPetPhotoSource(pet);
                  const statusStyleKey = status.key === 'good' ? 'statusBadgeGood' : status.key === 'warn' ? 'statusBadgeWarn' : 'statusBadgeNeutral';
                  const statusTextStyleKey = status.key === 'good' ? 'statusBadgeGoodText' : status.key === 'warn' ? 'statusBadgeWarnText' : 'statusBadgeNeutralText';
                  // Archived pets can't be opened or edited until restored (same as the web).
                  const CardComponent = pet.isArchived ? View : TouchableOpacity;
                  const cardProps = pet.isArchived
                    ? {}
                    : {
                        onPress: () => openPatient(pet.id),
                        activeOpacity: 0.9,
                        accessibilityRole: 'button',
                        accessibilityLabel: `Open ${pet.name || 'pet'}'s profile`,
                      };

                  return (
                    <CardComponent key={pet.id} style={styles.patientCard} {...cardProps}>
                      <View style={styles.patientCardTopRow}>
                        {petPhoto.source ? (
                          <Image source={petPhoto.source} style={styles.patientPhoto} resizeMode="cover" />
                        ) : (
                          <View style={styles.patientPhotoFallback}>
                            <Text style={styles.patientPhotoFallbackText}>{(pet.name || 'P').charAt(0)}</Text>
                          </View>
                        )}

                        <View style={styles.patientInfo}>
                          <View style={styles.patientTopLine}>
                            <Text style={styles.patientName}>{pet.name || 'Unnamed Pet'}</Text>
                            {pet.isArchived ? (
                              <View style={[styles.statusBadge, styles.statusBadgeArchived]}>
                                <Text style={[styles.statusBadgeText, styles.statusBadgeArchivedText]}>Archived</Text>
                              </View>
                            ) : (
                              <View style={[styles.statusBadge, styles[statusStyleKey]]}>
                                <Text style={[styles.statusBadgeText, styles[statusTextStyleKey]]}>{status.label}</Text>
                              </View>
                            )}
                          </View>
                          <Text style={styles.patientSpeciesBreed}>
                            {[pet.species, pet.breed].filter(Boolean).join(' • ') || 'Species not recorded'}
                          </Text>
                        </View>
                      </View>

                      <View style={styles.patientMetaGrid}>
                        <View style={styles.patientMetaItem}>
                          <Text style={styles.patientMetaLabel}>Age</Text>
                          <Text style={styles.patientMetaValue}>{formatAge(pet)}</Text>
                        </View>
                        <View style={styles.patientMetaItem}>
                          <Text style={styles.patientMetaLabel}>Weight</Text>
                          <Text style={styles.patientMetaValue}>{pet.weight ? `${pet.weight} kg` : 'Not recorded'}</Text>
                        </View>
                        <View style={styles.patientMetaItem}>
                          <Text style={styles.patientMetaLabel}>Consultations</Text>
                          <Text style={styles.patientMetaValue}>{visitCount}</Text>
                        </View>
                        <View style={styles.patientMetaItem}>
                          <Text style={styles.patientMetaLabel}>Latest Visit</Text>
                          <Text style={styles.patientMetaValue}>{latestDate ? formatMedicalDate(latestDate) : 'None yet'}</Text>
                        </View>
                      </View>

                      <View style={styles.patientCardFooterRow}>
                        {pet.isArchived ? (
                          <TouchableOpacity
                            style={[styles.restoreChip, restoringId === pet.id && { opacity: 0.6 }]}
                            onPress={() => restorePet(pet)}
                            disabled={Boolean(restoringId)}
                            activeOpacity={0.9}
                            accessibilityLabel={`Restore ${pet.name || 'pet'}`}
                          >
                            <Text style={styles.restoreChipText}>{restoringId === pet.id ? 'Restoring...' : 'Restore'}</Text>
                          </TouchableOpacity>
                        ) : (
                          <View style={styles.viewProfileChip}>
                            <Text style={styles.viewProfileChipText}>View Profile</Text>
                          </View>
                        )}
                      </View>
                    </CardComponent>
                  );
                })
              : null}

            {!loading && !error && !filteredPatients.length ? (
              <View style={styles.searchEmptyState}>
                <Text style={styles.searchEmptyTitle}>
                  {scopedPatients.length ? 'No patients found' : showArchived ? 'No archived pets' : 'No animal patients yet'}
                </Text>
                <Text style={styles.searchEmptyText}>
                  {scopedPatients.length
                    ? 'Try changing the search text or species filter.'
                    : showArchived
                      ? 'Pets you archive from Edit Pet Profile will appear here.'
                      : 'Add your first pet profile to start tracking their visits and medical history.'}
                </Text>
              </View>
            ) : null}

            {!loading && !error && totalPages > 1 ? (
              <View style={styles.paginationRow}>
                <TouchableOpacity
                  style={[styles.pageButton, page === 1 && styles.pageButtonDisabled]}
                  onPress={() => goToPage(page - 1)}
                  disabled={page === 1}
                  accessibilityLabel="Previous page"
                >
                  <Text style={styles.pageButtonText}>‹</Text>
                </TouchableOpacity>
                {Array.from({ length: totalPages }, (_, index) => index + 1).map((pageNumber) => (
                  <TouchableOpacity
                    key={pageNumber}
                    style={[styles.pageButton, pageNumber === page && styles.pageButtonActive]}
                    onPress={() => goToPage(pageNumber)}
                    accessibilityLabel={`Page ${pageNumber}`}
                  >
                    <Text style={[styles.pageButtonText, pageNumber === page && styles.pageButtonTextActive]}>{pageNumber}</Text>
                  </TouchableOpacity>
                ))}
                <TouchableOpacity
                  style={[styles.pageButton, page === totalPages && styles.pageButtonDisabled]}
                  onPress={() => goToPage(page + 1)}
                  disabled={page === totalPages}
                  accessibilityLabel="Next page"
                >
                  <Text style={styles.pageButtonText}>›</Text>
                </TouchableOpacity>
              </View>
            ) : null}

            <TouchableOpacity
              style={styles.addPetButton}
              activeOpacity={0.9}
              onPress={() => navigation.navigate('PetOwnerMyPetsEdit', { user: loggedInUser })}
            >
              <Text style={styles.addPetPlus}>+</Text>
              <Text style={styles.addPetText}>Add Pet Profile</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>

        <PetOwnerBottomNav navigation={navigation} user={loggedInUser} activeKey="pets" />
      </SafeAreaView>
    </LinearGradient>
  );
};

export default PetOwnerMyPets;
