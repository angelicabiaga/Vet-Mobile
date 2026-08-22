import { SafeAreaView } from 'react-native-safe-area-context';
import PetOwnerSideDrawer from './PetOwnerSideDrawer';
import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Image, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { styles } from '../../styles/PetOwnerMyPetsDesign';
import { computePatientStatus, formatAge, formatBirthday, getPetPhotoSource } from './PetOwnerMyPetsInfo';
import { getOwnerPet, subscribeToOwnerPets } from '../../../api/petService';
import { getMobileMedicalRecords, subscribeToMedicalRecords } from '../../../api/medicalRecordService';
import PetOwnerMyPetsMedicalHistory from './PetOwnerMyPetsMedicalHistory';
import PetOwnerMyPetsAIHealth from './PetOwnerMyPetsAIHealth';

const DEFAULT_PROFILE_IMAGE = require('../../assets/Profile.png');

const PetOwnerMyPetsView = ({ navigation, route }) => {
  const loggedInUser = route?.params?.user;
  const petId = route?.params?.petId;
  const profileImageUri = loggedInUser?.profileImageUri || loggedInUser?.avatar || '';
  const headerDisplayName = loggedInUser?.username || loggedInUser?.name || loggedInUser?.fullName || 'Pet Owner';
  const ownerContact = loggedInUser?.email || loggedInUser?.phone || loggedInUser?.contactNumber || '';
  const [isHeaderMenuVisible, setIsHeaderMenuVisible] = useState(false);
  const [pet, setPet] = useState(null);
  const [petLoaded, setPetLoaded] = useState(false);
  const [records, setRecords] = useState([]);
  const [recordsLoading, setRecordsLoading] = useState(true);
  const [recordsError, setRecordsError] = useState('');
  const [activeTab, setActiveTab] = useState('medical');
  const [aiTabVisited, setAiTabVisited] = useState(false);

  const loadPet = useCallback(async () => {
    if (!petId || !loggedInUser?.id) return;
    try {
      setPet(await getOwnerPet(petId, loggedInUser.id));
    } catch (error) {
      console.warn('Unable to sync pet profile:', error);
      setPet(null);
    } finally {
      setPetLoaded(true);
    }
  }, [petId, loggedInUser?.id]);

  const loadRecords = useCallback(async () => {
    if (!petId || !loggedInUser?.id) return;
    try {
      const rows = await getMobileMedicalRecords(
        { ...loggedInUser, role: loggedInUser?.role || 'pet_owner' },
        { petId }
      );
      setRecords(rows);
      setRecordsError('');
    } catch (error) {
      setRecordsError(error?.message || 'Unable to load this patient\'s medical history.');
    } finally {
      setRecordsLoading(false);
    }
  }, [petId, loggedInUser?.id]);

  useFocusEffect(
    useCallback(() => {
      loadPet();
      loadRecords();
      const petsChannel = subscribeToOwnerPets(loggedInUser?.id, loadPet);
      const recordsUnsubscribe = subscribeToMedicalRecords(
        { ...loggedInUser, role: loggedInUser?.role || 'pet_owner' },
        loadRecords
      );
      return () => {
        if (petsChannel?.unsubscribe) petsChannel.unsubscribe();
        recordsUnsubscribe?.();
      };
    }, [loggedInUser?.id, loadPet, loadRecords]),
  );

  const activePhoto = useMemo(() => getPetPhotoSource(pet), [pet]);
  const status = useMemo(() => computePatientStatus(records), [records]);
  const statusStyleKey = status.key === 'good' ? 'statusBadgeGood' : status.key === 'warn' ? 'statusBadgeWarn' : 'statusBadgeNeutral';
  const statusTextStyleKey = status.key === 'good' ? 'statusBadgeGoodText' : status.key === 'warn' ? 'statusBadgeWarnText' : 'statusBadgeNeutralText';

  const selectTab = (tab) => {
    setActiveTab(tab);
    if (tab === 'ai') setAiTabVisited(true);
  };

  if (petLoaded && !pet) {
    return (
      <LinearGradient colors={['#f7fbfc', '#eef7f8', '#ffffff']} style={styles.background}>
        <SafeAreaView style={styles.container}>
          <View style={[styles.emptyModeCard, { margin: 18 }]}>
            <Text style={styles.emptyModeTitle}>Animal patient not found</Text>
            <TouchableOpacity
              style={[styles.primaryActionButton, { alignSelf: 'flex-start', marginTop: 12 }]}
              onPress={() => navigation.navigate('PetOwnerMyPets', { user: loggedInUser })}
              activeOpacity={0.9}
            >
              <Text style={styles.primaryActionText}>Back to Animal Patients</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  if (!pet) {
    return (
      <LinearGradient colors={['#f7fbfc', '#eef7f8', '#ffffff']} style={styles.background}>
        <SafeAreaView style={[styles.container, { alignItems: 'center', justifyContent: 'center' }]}>
          <ActivityIndicator size="large" color="#447C99" />
        </SafeAreaView>
      </LinearGradient>
    );
  }

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
                <Text style={styles.headerSubtitle}>Animal Patient Profile</Text>
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

          <View style={styles.headerBottomRow}>
            <TouchableOpacity
              style={styles.menuTriggerButton}
              onPress={() => setIsHeaderMenuVisible(true)}
              activeOpacity={0.85}
            >
              <Image source={require('../../assets/List.png')} style={styles.menuTriggerIcon} resizeMode="contain" />
            </TouchableOpacity>

            <View style={styles.ownerSummary}>
              <Text style={styles.headerCaption}>Animal patient details</Text>
              <Text style={styles.ownerName}>{headerDisplayName}</Text>
            </View>
          </View>

          <PetOwnerSideDrawer
            visible={isHeaderMenuVisible}
            onClose={() => setIsHeaderMenuVisible(false)}
            navigation={navigation}
            user={loggedInUser}
            activeKey="pets"
          />
        </LinearGradient>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          <View style={styles.sectionHeaderWrap}>
            <Text style={styles.sectionTitle}>Animal Patient Profile</Text>
            <Text style={styles.sectionSubtitle}>Medical history and AI predictive health in one place</Text>
          </View>

          <View style={styles.detailCard}>
            <View style={styles.detailTopRow}>
              <TouchableOpacity
                style={styles.secondaryActionButton}
                onPress={() => navigation.navigate('PetOwnerMyPets', { user: loggedInUser, selectedPetId: pet.id })}
                activeOpacity={0.9}
              >
                <Text style={styles.secondaryActionText}>Back</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.primaryActionButton}
                onPress={() => navigation.navigate('PetOwnerMyPetsEdit', { user: loggedInUser, petId: pet.id })}
                activeOpacity={0.9}
              >
                <Text style={styles.primaryActionText}>Edit</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.viewProfileHeader}>
              <View style={[styles.largePetAvatar, { backgroundColor: pet.profileColor }]}>
                {activePhoto.source ? (
                  <Image
                    source={activePhoto.source}
                    style={[styles.largePetAvatarImage, activePhoto.isCustom && styles.largePetAvatarImageCustom]}
                    resizeMode="cover"
                  />
                ) : (
                  <Text style={styles.largePetAvatarText}>{(pet.name || 'P').charAt(0)}</Text>
                )}
              </View>

              <View style={styles.viewProfileInfo}>
                <View style={styles.patientTopLine}>
                  <Text style={styles.profileName}>{pet.name || 'Unnamed Pet'}</Text>
                  <View style={[styles.statusBadge, styles[statusStyleKey]]}>
                    <Text style={[styles.statusBadgeText, styles[statusTextStyleKey]]}>{status.label}</Text>
                  </View>
                </View>
                <Text style={styles.profileBreed}>{pet.breed || 'No breed yet'}</Text>
                <Text style={styles.patientIdText}>Patient ID: {pet.referenceCode}</Text>
              </View>
            </View>

            <View style={styles.profileGrid}>
              <View style={styles.profileInfoItem}>
                <Text style={styles.profileInfoLabel}>Species</Text>
                <Text style={styles.profileInfoValue}>{pet.species || '-'}</Text>
              </View>
              <View style={styles.profileInfoItem}>
                <Text style={styles.profileInfoLabel}>Breed</Text>
                <Text style={styles.profileInfoValue}>{pet.breed || '-'}</Text>
              </View>
              <View style={styles.profileInfoItem}>
                <Text style={styles.profileInfoLabel}>Sex</Text>
                <Text style={styles.profileInfoValue}>{pet.sex || '-'}</Text>
              </View>
              <View style={styles.profileInfoItem}>
                <Text style={styles.profileInfoLabel}>Age</Text>
                <Text style={styles.profileInfoValue}>{formatAge(pet)}</Text>
              </View>
              <View style={styles.profileInfoItem}>
                <Text style={styles.profileInfoLabel}>Weight</Text>
                <Text style={styles.profileInfoValue}>{pet.weight ? `${pet.weight} kg` : '-'}</Text>
              </View>
              <View style={styles.profileInfoItem}>
                <Text style={styles.profileInfoLabel}>Birthday</Text>
                <Text style={styles.profileInfoValue}>{formatBirthday(pet)}</Text>
              </View>
            </View>

            <View style={styles.ownerInfoCard}>
              <Text style={styles.ownerInfoLabel}>Owner</Text>
              <Text style={styles.ownerInfoValue}>{headerDisplayName}</Text>
              {ownerContact ? <Text style={styles.ownerInfoSub}>{ownerContact}</Text> : null}
            </View>

            <View style={styles.tabRow}>
              <TouchableOpacity
                style={[styles.tabButton, activeTab === 'medical' && styles.tabButtonActive]}
                onPress={() => selectTab('medical')}
                activeOpacity={0.9}
                accessibilityRole="tab"
                accessibilityState={{ selected: activeTab === 'medical' }}
              >
                <Text style={[styles.tabButtonText, activeTab === 'medical' && styles.tabButtonTextActive]}>
                  Medical History
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.tabButton, activeTab === 'ai' && styles.tabButtonActive]}
                onPress={() => selectTab('ai')}
                activeOpacity={0.9}
                accessibilityRole="tab"
                accessibilityState={{ selected: activeTab === 'ai' }}
              >
                <Text style={[styles.tabButtonText, activeTab === 'ai' && styles.tabButtonTextActive]}>
                  AI Predictive Health
                </Text>
              </TouchableOpacity>
            </View>

            {activeTab === 'medical' ? (
              <PetOwnerMyPetsMedicalHistory
                records={records}
                loading={recordsLoading}
                error={recordsError}
                onRetry={loadRecords}
              />
            ) : null}

            {aiTabVisited ? (
              <View style={activeTab === 'ai' ? undefined : { display: 'none' }}>
                <PetOwnerMyPetsAIHealth pet={pet} records={records} recordsLoading={recordsLoading} active={activeTab === 'ai'} />
              </View>
            ) : null}
          </View>
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
};

export default PetOwnerMyPetsView;
