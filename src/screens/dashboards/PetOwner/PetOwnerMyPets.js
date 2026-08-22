import { SafeAreaView } from 'react-native-safe-area-context';
import PetOwnerSideDrawer from './PetOwnerSideDrawer';
import React, { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
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
import { getOwnerPets, subscribeToOwnerPets } from '../../../api/petService';
import { getMobileMedicalRecords, subscribeToMedicalRecords, formatMedicalDate } from '../../../api/medicalRecordService';

const DEFAULT_PROFILE_IMAGE = require('../../assets/Profile.png');

const PetOwnerMyPets = ({ navigation, route }) => {
  const loggedInUser = route?.params?.user;
  const scrollViewRef = useRef(null);
  const profileImageUri = loggedInUser?.profileImageUri || loggedInUser?.avatar || '';
  const headerDisplayName =
    loggedInUser?.username ||
    loggedInUser?.name ||
    loggedInUser?.fullName ||
    'Pet Owner';
  const lowerHeaderAnimation = useRef(new Animated.Value(1)).current;
  const isLowerHeaderVisible = useRef(true);
  const lastScrollY = useRef(0);
  const [isHeaderMenuVisible, setIsHeaderMenuVisible] = useState(false);
  const [pets, setPets] = useState([]);
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const normalizedSearchQuery = searchQuery.trim().toLowerCase();

  const loadData = useCallback(async () => {
    if (!loggedInUser?.id) return;
    try {
      const [ownerPets, ownerRecords] = await Promise.all([
        getOwnerPets(loggedInUser.id),
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

  const filteredPatients = patients.filter(({ pet }) => {
    if (!normalizedSearchQuery) return true;
    return [pet.name, pet.breed, pet.species, pet.referenceCode].some((value) =>
      value?.toLowerCase().includes(normalizedSearchQuery)
    );
  });

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

  const handleScroll = (event) => {
    const currentScrollY = event.nativeEvent.contentOffset.y;
    if (currentScrollY > lastScrollY.current + 4 && currentScrollY > 8) {
      animateLowerHeader(0);
    } else if (currentScrollY < lastScrollY.current - 4 || currentScrollY <= 0) {
      animateLowerHeader(1);
    }
    lastScrollY.current = currentScrollY;
  };

  const openPatient = (petId) => {
    navigation.navigate('PetOwnerMyPetsView', { user: loggedInUser, petId });
  };

  return (
    <LinearGradient colors={['#f7fbfc', '#eef7f8', '#ffffff']} style={styles.background}>
      <SafeAreaView style={styles.container}>
        <LinearGradient
          colors={['#63B6C5', '#63B6C5', '#63B6C5']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.headerBar}
        >
          <LinearGradient
            colors={['#1f4e66', '#2f6f86', '#447C99', '#5f9eb4']}
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
                {profileImageUri ? (
                  <Image source={{ uri: profileImageUri }} style={styles.profileButtonImage} resizeMode="cover" />
                ) : (
                  <Image source={DEFAULT_PROFILE_IMAGE} style={styles.profileIcon} resizeMode="contain" />
                )}
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
              <TouchableOpacity
                style={styles.menuTriggerButton}
                onPress={() => setIsHeaderMenuVisible(true)}
                activeOpacity={0.85}
              >
                <Image source={require('../../assets/List.png')} style={styles.menuTriggerIcon} resizeMode="contain" />
              </TouchableOpacity>

              <View style={styles.ownerSummary}>
                <Text style={styles.headerCaption}>Manage your animal patients</Text>
                <Text style={styles.ownerName}>{headerDisplayName}</Text>
              </View>
            </View>
          </Animated.View>

          <PetOwnerSideDrawer
            visible={isHeaderMenuVisible}
            onClose={() => setIsHeaderMenuVisible(false)}
            navigation={navigation}
            user={loggedInUser}
            activeKey="pets"
          />
        </LinearGradient>

        <ScrollView
          ref={scrollViewRef}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          <View style={styles.sectionHeaderWrap}>
            <Text style={styles.sectionTitle}>Animal Patients</Text>
            <Text style={styles.sectionSubtitle}>Select a patient to view its profile</Text>
          </View>

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

            {loading ? (
              <View style={[styles.searchEmptyState, { alignItems: 'center' }]}>
                <ActivityIndicator color="#447C99" />
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

            {!loading && !error && filteredPatients.length
              ? filteredPatients.map(({ pet, visitCount, latestDate, status }) => {
                  const petPhoto = getPetPhotoSource(pet);
                  const statusStyleKey = status.key === 'good' ? 'statusBadgeGood' : status.key === 'warn' ? 'statusBadgeWarn' : 'statusBadgeNeutral';
                  const statusTextStyleKey = status.key === 'good' ? 'statusBadgeGoodText' : status.key === 'warn' ? 'statusBadgeWarnText' : 'statusBadgeNeutralText';

                  return (
                    <TouchableOpacity
                      key={pet.id}
                      style={styles.patientCard}
                      onPress={() => openPatient(pet.id)}
                      activeOpacity={0.9}
                      accessibilityRole="button"
                      accessibilityLabel={`Open ${pet.name || 'pet'}'s profile`}
                    >
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
                            <View style={[styles.statusBadge, styles[statusStyleKey]]}>
                              <Text style={[styles.statusBadgeText, styles[statusTextStyleKey]]}>{status.label}</Text>
                            </View>
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
                        <Text style={styles.referenceCodeText}>{pet.referenceCode}</Text>
                        <View style={styles.viewProfileChip}>
                          <Text style={styles.viewProfileChipText}>View Profile</Text>
                        </View>
                      </View>
                    </TouchableOpacity>
                  );
                })
              : null}

            {!loading && !error && !filteredPatients.length ? (
              <View style={styles.searchEmptyState}>
                <Text style={styles.searchEmptyTitle}>{pets.length ? 'No patients found' : 'No animal patients yet'}</Text>
                <Text style={styles.searchEmptyText}>
                  {pets.length
                    ? 'Try another name, breed, species, or reference code.'
                    : 'Add your first pet profile to start tracking their visits and medical history.'}
                </Text>
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

        <View style={styles.bottomNav}>
          <TouchableOpacity
            style={[styles.navItem, styles.activeNavItem]}
            onPress={() => navigation.navigate('PetOwnerQuickAssist', { user: loggedInUser })}
            activeOpacity={0.9}
          >
            <View style={[styles.navIconWrap, styles.activeNavIconWrap]}>
              <Image
                source={require('../../assets/support.png')}
                style={[styles.navIcon, styles.activeNavIcon]}
                resizeMode="contain"
              />
            </View>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </LinearGradient>
  );
};

export default PetOwnerMyPets;
