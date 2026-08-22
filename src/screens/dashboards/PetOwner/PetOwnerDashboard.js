import { SafeAreaView } from 'react-native-safe-area-context';
import PetOwnerSideDrawer from './PetOwnerSideDrawer';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Image,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { styles } from '../../styles/PetOwnerDashboardDesign';
import { loadPetOwnerDashboard, subscribeToPetOwnerDashboard, unsubscribeChannels } from '../../../api/petService';

const DEFAULT_PROFILE_IMAGE = require('../../assets/Profile.png');
const ACTIVE_QUEUE_STATUSES = ['Waiting', 'Serving', 'Now Serving'];

const PetOwnerDashboard = ({ navigation, route }) => {
  const loggedInUser = route?.params?.user;
  const currentUser = loggedInUser || {};
  const headerDisplayName =
    loggedInUser?.username ||
    loggedInUser?.name ||
    loggedInUser?.fullName ||
    'Pet Owner';
  const profileImageUri = loggedInUser?.profileImageUri || loggedInUser?.avatar || '';
  const scrollViewRef = useRef(null);
  const [isHeaderMenuVisible, setIsHeaderMenuVisible] = useState(false);
  const headerMenuAnimation = useRef(new Animated.Value(0)).current;
  const lowerHeaderAnimation = useRef(new Animated.Value(1)).current;
  const isHeaderMenuAnimating = useRef(false);
  const isLowerHeaderVisible = useRef(true);
  const lastScrollY = useRef(0);

  const heroSlides = [
    {
      key: 'slide-1',
      label: 'Book visits',
      title: 'Plan appointments before your pet needs urgent care.',
      description: 'Use Book Appointment to choose a clinic schedule and keep every visit organized.',
    },
    {
      key: 'slide-2',
      label: 'Track patients',
      title: 'Keep your animal patients ready for faster clinic service.',
      description: 'Open Animal Patients to review pet details before booking a visit.',
    },
    {
      key: 'slide-3',
      label: 'Review records',
      title: 'Medical history is easier when everything is in one place.',
      description: 'Every finalized consultation now lives inside each pet\'s Animal Patient profile.',
    },
  ];

  const [activeHeroSlide, setActiveHeroSlide] = useState(0);
  const [dashboardActivity, setDashboardActivity] = useState({
    pets: [],
    appointments: [],
    medicalRecords: [],
    queues: [],
    activityLogs: [],
  });

  const petProfilesCount = dashboardActivity.pets.length;
  const activeAppointments = dashboardActivity.appointments.filter((item) => !["Completed", "Cancelled"].includes(item.status));
  const appointmentRequestCount = dashboardActivity.appointments.length;
  const healthRecordCount = dashboardActivity.medicalRecords.length;
  const visitNotesCount = dashboardActivity.appointments.filter((item) => item.status === "Completed").length;
  const latestActivity = dashboardActivity.activityLogs?.[0] || null;
  const bookedAppointment = activeAppointments[0] || null;
  const bookedPet = bookedAppointment ? dashboardActivity.pets.find((pet) => pet.id === bookedAppointment.pet_id) : null;
  const appointmentDateLabel = bookedAppointment
    ? `${bookedPet?.pet_name || 'Pet'} - ${bookedAppointment.appointment_date || ''}`
    : 'No active request yet';

  const activeQueueEntry = dashboardActivity.queues.find((entry) => ACTIVE_QUEUE_STATUSES.includes(entry.status)) || null;
  const hasActiveQueue = Boolean(activeQueueEntry);
  const queueNumber = activeQueueEntry?.queue_number || null;
  const queueStatusLabel = hasActiveQueue ? activeQueueEntry.status : 'No Active Queue';
  const queuePet = hasActiveQueue ? dashboardActivity.pets.find((pet) => pet.id === activeQueueEntry.pet_id) : null;
  const queuePetName = hasActiveQueue ? (queuePet?.pet_name || 'Pet') : 'No pet checked in';

  const activityTracks = [
    {
      key: 'pets',
      label: 'Animal Patients',
      value: String(petProfilesCount),
      detail: petProfilesCount === 1 ? '1 registered pet' : `${petProfilesCount} registered pets`,
      accent: styles.activityTrackAccentBlue,
      route: 'PetOwnerMyPets',
    },
    {
      key: 'appointments',
      label: 'Appointment Requests',
      value: String(appointmentRequestCount),
      detail: activeAppointments.length ? appointmentDateLabel : `${appointmentRequestCount} total booking${appointmentRequestCount === 1 ? '' : 's'}`,
      accent: styles.activityTrackAccentGreen,
      route: 'PetOwnerAppointment',
    },
    {
      key: 'records',
      label: 'Health Records',
      value: String(healthRecordCount),
      detail: 'Medical history and vaccines',
      accent: styles.activityTrackAccentGold,
      route: 'PetOwnerMyPets',
    },
    {
      key: 'visits',
      label: 'Visit Notes',
      value: String(visitNotesCount),
      detail: visitNotesCount === 1 ? '1 completed clinic visit' : `${visitNotesCount} completed clinic visits`,
      accent: styles.activityTrackAccentTeal,
      route: 'PetOwnerMyPets',
    },
  ];
  const headerMenuItems = [
    { key: 'dashboard', label: 'Dashboard', icon: require('../../assets/Dashboard_Icon.png'), route: 'petowner-screen' },
    { key: 'appointment', label: 'Appointment', icon: require('../../assets/Appointment_Icon.png'), route: 'PetOwnerAppointment' },
    { key: 'mypets', label: 'Animal Patients', icon: require('../../assets/Pets_Icon.png'), route: 'PetOwnerMyPets' },
    { key: 'messages', label: 'Messages', icon: require('../../assets/Message_Icon.png'), route: 'PetOwnerMessages' },
  ];

  const refreshDashboard = useCallback(async () => {
    if (!currentUser?.id) return;
    try {
      setDashboardActivity(await loadPetOwnerDashboard(currentUser.id));
    } catch (error) {
      console.warn("Unable to sync Pet Owner dashboard:", error);
    }
  }, [currentUser?.id]);

  useFocusEffect(
    useCallback(() => {
      refreshDashboard();
      const channels = subscribeToPetOwnerDashboard(currentUser?.id, refreshDashboard);
      const fallbackTimer = setInterval(refreshDashboard, 15000);

      return () => {
        clearInterval(fallbackTimer);
        unsubscribeChannels(channels);
      };
    }, [currentUser?.id, refreshDashboard]),
  );
  useEffect(() => {
    const interval = setInterval(() => {
      setActiveHeroSlide((current) => (current + 1) % heroSlides.length);
    }, 2000);

    return () => clearInterval(interval);
  }, [heroSlides.length]);

  const openHeaderMenu = () => {
    if (isHeaderMenuVisible || isHeaderMenuAnimating.current) {
      return;
    }

    isHeaderMenuAnimating.current = true;
    setIsHeaderMenuVisible(true);
    headerMenuAnimation.stopAnimation();
    Animated.timing(headerMenuAnimation, {
      toValue: 1,
      duration: 240,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(() => {
      isHeaderMenuAnimating.current = false;
    });
  };

  const closeHeaderMenu = (onClosed) => {
    if (isHeaderMenuAnimating.current) {
      return;
    }

    if (!isHeaderMenuVisible) {
      onClosed?.();
      return;
    }

    isHeaderMenuAnimating.current = true;
    headerMenuAnimation.stopAnimation();
    Animated.timing(headerMenuAnimation, {
      toValue: 0,
      duration: 220,
      easing: Easing.inOut(Easing.cubic),
      useNativeDriver: true,
    }).start(() => {
      isHeaderMenuAnimating.current = false;
      setIsHeaderMenuVisible(false);
      onClosed?.();
    });
  };

  const toggleHeaderMenu = () => {
    if (isHeaderMenuVisible) {
      closeHeaderMenu();
      return;
    }

    scrollViewRef.current?.scrollTo({ y: 0, animated: true });
    openHeaderMenu();
  };

  const handleHeaderMenuPress = (route) => {
    closeHeaderMenu();
    navigation.navigate(route, { user: currentUser });
  };

  const animateLowerHeader = (toValue) => {
    const shouldBeVisible = toValue === 1;

    if (isLowerHeaderVisible.current === shouldBeVisible) {
      return;
    }

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
      if (isHeaderMenuVisible) {
        closeHeaderMenu(() => animateLowerHeader(0));
        lastScrollY.current = currentScrollY;
        return;
      }
      animateLowerHeader(0);
    } else if (currentScrollY < lastScrollY.current - 4 || currentScrollY <= 0) {
      animateLowerHeader(1);
    }

    lastScrollY.current = currentScrollY;
  };

  return (
    <LinearGradient
      colors={['#f7fbfc', '#eef7f8', '#ffffff']}
      style={styles.background}
    >
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
              onPress={() => navigation.navigate('petowner-screen', { user: currentUser })}
              activeOpacity={0.85}
            >
              <View style={styles.logoWrap}>
                <Image
                  source={require('../../assets/paw1.png')}
                  style={styles.headerLogo}
                  resizeMode="contain"
                />
              </View>

              <View style={styles.brandBlock}>
                <Text style={styles.headerTitle}>PawCruz</Text>
                <Text style={styles.headerSubtitle}>Pet Owner Dashboard</Text>
              </View>
            </TouchableOpacity>

            <View style={styles.headerActions}>
              <TouchableOpacity
                style={styles.notifButton}
                onPress={() => navigation.navigate('PetOwnerNotif', { user: currentUser })}
                activeOpacity={0.85}
              >
                <View style={styles.notifBadge} />
                <Image
                  source={require('../../assets/Bell_Icon.png')}
                  style={styles.notifIcon}
                  resizeMode="contain"
                />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.profileButton}
                onPress={() => navigation.navigate('PetOwnerProfile', { user: currentUser })}
                activeOpacity={0.85}
              >
                {profileImageUri ? (
                  <Image
                    source={{ uri: profileImageUri }}
                    style={styles.profileButtonImage}
                    resizeMode="cover"
                  />
                ) : (
                  <Image
                    source={DEFAULT_PROFILE_IMAGE}
                    style={styles.profileIcon}
                    resizeMode="contain"
                  />
                )}
              </TouchableOpacity>
            </View>
            </View>
          </LinearGradient>

          <Animated.View
            style={[
              styles.headerBottomRowWrap,
              {
                maxHeight: lowerHeaderAnimation.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, 96],
                }),
                opacity: lowerHeaderAnimation,
                transform: [
                  {
                    translateY: lowerHeaderAnimation.interpolate({
                      inputRange: [0, 1],
                      outputRange: [-18, 0],
                    }),
                  },
                ],
              },
            ]}
          >
            <View style={styles.headerBottomRow}>
            <TouchableOpacity
              style={styles.menuTriggerButton}
              onPress={toggleHeaderMenu}
              activeOpacity={0.85}
            >
              <Image
                source={require('../../assets/List.png')}
                style={styles.menuTriggerIcon}
                resizeMode="contain"
              />
            </TouchableOpacity>

            <View style={styles.ownerSummary}>
              <Text style={styles.headerCaption}>Welcome</Text>
              <Text style={styles.ownerName}>{headerDisplayName}</Text>
            </View>
            </View>
          </Animated.View>

          <PetOwnerSideDrawer visible={isHeaderMenuVisible} onClose={() => setIsHeaderMenuVisible(false)} navigation={navigation} user={currentUser} activeKey="dashboard" />
          {false ? (
            <Animated.View
              style={[
                styles.headerMenuPanel,
                {
                  opacity: headerMenuAnimation,
                  transform: [
                    {
                      translateY: headerMenuAnimation.interpolate({
                        inputRange: [0, 1],
                        outputRange: [-18, 0],
                      }),
                    },
                    {
                      scale: headerMenuAnimation.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0.96, 1],
                      }),
                    },
                  ],
                },
              ]}
            >
              {headerMenuItems.map((item, index) => {
                const itemEnterStart = index * 0.08;
                const itemEnterMid = Math.min(itemEnterStart + 0.45, 0.99);
                const itemOpacity = headerMenuAnimation.interpolate({
                  inputRange: [itemEnterStart, itemEnterMid, 1],
                  outputRange: [0, 1, 1],
                  extrapolate: 'clamp',
                });
                const itemTranslateY = headerMenuAnimation.interpolate({
                  inputRange: [itemEnterStart, 1],
                  outputRange: [14, 0],
                  extrapolate: 'clamp',
                });
                const itemScale = headerMenuAnimation.interpolate({
                  inputRange: [itemEnterStart, 1],
                  outputRange: [0.97, 1],
                  extrapolate: 'clamp',
                });

                return (
                  <Animated.View
                    key={item.key}
                    style={{
                      opacity: itemOpacity,
                      transform: [{ translateY: itemTranslateY }, { scale: itemScale }],
                    }}
                  >
                    <TouchableOpacity
                      style={styles.headerMenuItem}
                      onPress={() => handleHeaderMenuPress(item.route)}
                      activeOpacity={0.88}
                    >
                      <View style={styles.headerMenuItemIconWrap}>
                        <Image
                          source={item.icon}
                          style={styles.headerMenuItemIcon}
                          resizeMode="contain"
                        />
                      </View>
                      <Text style={styles.headerMenuItemLabel}>{item.label}</Text>
                    </TouchableOpacity>
                  </Animated.View>
                );
              })}
            </Animated.View>
          ) : null}
        </LinearGradient>

        <ScrollView
          ref={scrollViewRef}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          <LinearGradient
            colors={['#63B6C5', '#63B6C5', '#63B6C5']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.welcomeCard}
          >
            <View style={styles.heroQueueEyebrowRow}>
              <Text style={styles.heroQueueEyebrow}>MY QUEUE</Text>
              <View style={styles.heroQueueStatusPill}>
                <Text style={styles.heroQueueStatusPillText} numberOfLines={1}>{queueStatusLabel}</Text>
              </View>
            </View>

            <View style={styles.heroQueueNumberWrap}>
              <Text style={styles.heroQueueNumberCaption}>QUEUE NUMBER</Text>
              <Text style={styles.heroQueueNumberValue}>{queueNumber || '—'}</Text>
              <Text style={styles.heroQueuePetName}>{queuePetName}</Text>
            </View>

            <TouchableOpacity
              style={styles.heroViewQueueButton}
              onPress={() => navigation.navigate('PetOwnerQueue', { user: currentUser })}
              activeOpacity={0.88}
              accessibilityRole="button"
              accessibilityLabel="View complete queue details"
            >
              <Image source={require('../../assets/List.png')} style={styles.heroViewQueueIcon} resizeMode="contain" />
              <Text style={styles.heroViewQueueText}>View Queue</Text>
            </TouchableOpacity>
          </LinearGradient>

          <View style={styles.heroSlideCard}>
            <Image
              source={require('../../assets/dashboard.jpg')}
              style={styles.heroSlideBackground}
              resizeMode="cover"
            />
            <View style={styles.heroSlideOverlay} />
            <View style={styles.heroSlideContent}>
              <View style={styles.heroSlideTopRow}>
              <Text style={styles.heroSlideLabel}>{heroSlides[activeHeroSlide].label}</Text>
              <View style={styles.heroDotsRow}>
                {heroSlides.map((slide, index) => (
                  <View
                    key={slide.key}
                    style={[
                      styles.heroDot,
                      index === activeHeroSlide && styles.heroDotActive,
                    ]}
                  />
                ))}
              </View>
              </View>

              <Text style={styles.heroQuoteMark}>"</Text>
              <Text style={styles.heroSlideTitle}>{heroSlides[activeHeroSlide].title}</Text>
              <Text style={styles.welcomeDesc}>{heroSlides[activeHeroSlide].description}</Text>
            </View>
          </View>

          <View style={styles.sectionHeaderWrap}>
            <Text style={styles.sectionTitle}>Track Activities</Text>
            <Text style={styles.sectionSubtitle}>Your pet profiles, booking status, and health notes at a glance.</Text>
          </View>

          <View style={styles.activityPanel}>
            <View style={styles.activityStatsGrid}>
              {activityTracks.map((track) => (
                <TouchableOpacity
                  key={track.key}
                  style={styles.activityStatCard}
                  onPress={() => navigation.navigate(track.route, { user: currentUser })}
                  activeOpacity={0.88}
                >
                  <View style={[styles.activityStatAccent, track.accent]} />
                  <Text style={styles.activityStatLabel}>{track.label}</Text>
                  <Text style={styles.activityStatValue}>{track.value}</Text>
                  <Text style={styles.activityStatDetail}>{track.detail}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.activityTrackNote}>
              {latestActivity
                ? `Latest activity: ${latestActivity.description || latestActivity.action || "PawCruz activity"}`
                : "Your latest pet, appointment, queue, and medical activity will appear here automatically."}
            </Text>
          </View>

          <View style={styles.sectionHeaderWrap}>
            <Text style={styles.sectionTitle}>Services</Text>
            <Text style={styles.sectionSubtitle}>Main tools and features</Text>
          </View>

          <View style={styles.menuGrid}>
            <TouchableOpacity
              style={styles.menuCard}
              onPress={() => navigation.navigate('PetOwnerAppointment', { user: currentUser })}
              activeOpacity={0.9}
            >
              <View style={styles.iconCircle}>
                <Image
                  source={require('../../assets/Appointment_Icon.png')}
                  style={styles.iconImage}
                  resizeMode="contain"
                />
              </View>
              <Text style={styles.menuLabel}>Book</Text>
              <Text style={styles.menuLabel}>Appointment</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.menuCard}
              onPress={() => navigation.navigate('PetOwnerMyPets', { user: currentUser })}
              activeOpacity={0.9}
            >
              <View style={styles.iconCircle}>
                <Image
                  source={require('../../assets/Pets_Icon.png')}
                  style={styles.iconImage}
                  resizeMode="contain"
                />
              </View>
              <Text style={styles.menuLabel}>Animal</Text>
              <Text style={styles.menuLabel}>Patients</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.menuCard}
              onPress={() => navigation.navigate('PetOwnerMessages', { user: currentUser })}
              activeOpacity={0.9}
            >
              <View style={styles.iconCircle}>
                <Image
                  source={require('../../assets/Message_Icon.png')}
                  style={styles.iconImage}
                  resizeMode="contain"
                />
              </View>
              <Text style={styles.menuLabel}>Messages</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.menuCard}
              onPress={() => navigation.navigate('PetOwnerPayHis', { user: currentUser })}
              activeOpacity={0.9}
            >
              <View style={styles.iconCircle}>
                <Image
                  source={require('../../assets/payment_icon.png')}
                  style={styles.iconImage}
                  resizeMode="contain"
                />
              </View>
              <Text style={styles.menuLabel}>Payment</Text>
              <Text style={styles.menuLabel}>History</Text>
            </TouchableOpacity>

          </View>
        </ScrollView>

        <View style={styles.bottomNav}>
          <TouchableOpacity
            style={[styles.navItem, styles.activeNavItem]}
            onPress={() => navigation.navigate('PetOwnerQuickAssist', { user: currentUser })}
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

export default PetOwnerDashboard;
