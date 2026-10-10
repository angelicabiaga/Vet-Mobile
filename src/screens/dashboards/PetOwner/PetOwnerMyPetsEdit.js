import { SafeAreaView } from 'react-native-safe-area-context';
import PetOwnerBottomNav from './PetOwnerBottomNav';
import PetOwnerHeaderGreeting from './PetOwnerHeaderGreeting';
import CollapsingHeaderRow from '../../../components/CollapsingHeaderRow';
import { useLowerHeaderMotion } from '../Veterinary/useLowerHeaderMotion';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Easing,
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Dropdown } from 'react-native-element-dropdown';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { styles } from '../../styles/PetOwnerMyPetsDesign';
import {
  MONTHS,
  OTHER_OPTION_VALUE,
  PET_SPECIES_OPTIONS,
  YEARS,
  createPetDraftFromPet,
  formatAge,
  getBreedOptionsForSpecies,
  getFormattedAgeFromBirthday,
  getPetPhotoSource,
 } from './PetOwnerMyPetsInfo';
import { archiveOwnerPet, getOwnerPet, saveOwnerPet, validatePatientDetails } from '../../../api/petService';
import { validatePickedImageAsset } from '../../../utils/imageValidation';
import useScrollToError from '../../../hooks/useScrollToError';

const DEFAULT_PROFILE_IMAGE = require('../../assets/Profile.png');
const CALENDAR_ICON = require('../../assets/calendar.png');
const CALENDAR_DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const TODAY = new Date();
const CURRENT_MONTH_INDEX = TODAY.getMonth();
const CURRENT_YEAR = TODAY.getFullYear();
const CURRENT_DAY = TODAY.getDate();
const YEAR_ROW_HEIGHT = 56; // calendarYearCell height (46) + vertical margin (10)

const getBirthdayDateFromPet = (pet) => {
  const monthIndex = Math.max(MONTHS.indexOf(pet?.birthMonth), 0);
  const day = Math.max(Number(pet?.birthDay) || 1, 1);
  const year = Number(pet?.birthYear) || Number(YEARS[0]);
  return new Date(year, monthIndex, day);
};

const buildCalendarDays = (visibleMonthDate) => {
  const year = visibleMonthDate.getFullYear();
  const month = visibleMonthDate.getMonth();
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];

  for (let index = 0; index < firstWeekday; index += 1) {
    cells.push(null);
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push(day);
  }

  while (cells.length % 7 !== 0) {
    cells.push(null);
  }

  return cells;
};

const isSameCalendarDate = (leftDate, rightDate) => (
  leftDate?.getFullYear() === rightDate?.getFullYear() &&
  leftDate?.getMonth() === rightDate?.getMonth() &&
  leftDate?.getDate() === rightDate?.getDate()
);

const PetOwnerMyPetsEdit = ({ navigation, route }) => {
  // Lower header row hides on scroll down, like the Veterinarian header.
  const headerMotion = useLowerHeaderMotion();
  const loggedInUser = route?.params?.user;
  const petId = route?.params?.petId;
  const returnToRoute = route?.params?.returnToRoute || '';
  const returnToParams = route?.params?.returnToParams || {};
  const isCreatingPet = !petId;
  const initialPet = createPetDraftFromPet(null);
  const profileImageUri = loggedInUser?.profileImageUri || loggedInUser?.avatar || '';
  const headerDisplayName =
    loggedInUser?.username ||
    loggedInUser?.name ||
    loggedInUser?.fullName ||
    'Pet Owner';
  const headerMenuAnimation = useRef(new Animated.Value(0)).current;
  const isHeaderMenuAnimating = useRef(false);
  const [isHeaderMenuVisible, setIsHeaderMenuVisible] = useState(false);
  const [draftPet, setDraftPet] = useState(initialPet);
  const [isCustomBreedMode, setIsCustomBreedMode] = useState(() => (
    Boolean(initialPet.breed) && !getBreedOptionsForSpecies(initialPet.species).some((item) => item.value === initialPet.breed)
  ));
  const [showDoneConfirm, setShowDoneConfirm] = useState(false);
  // Save state: blocks a second tap; errors show on screen (Alert is a no-op on web).
  const [savingPet, setSavingPet] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [showRequiredFieldsModal, setShowRequiredFieldsModal] = useState(false);
  const [showPhotoOptionsModal, setShowPhotoOptionsModal] = useState(false);
  const [showBirthdayCalendar, setShowBirthdayCalendar] = useState(false);
  const [calendarMonthDate, setCalendarMonthDate] = useState(() => getBirthdayDateFromPet(initialPet));
  const [pendingBirthdayDate, setPendingBirthdayDate] = useState(null);
  const [showYearGrid, setShowYearGrid] = useState(false);
  const yearGridRef = useRef(null);

  const activePhoto = getPetPhotoSource(draftPet);
  const breedOptions = useMemo(() => getBreedOptionsForSpecies(draftPet.species), [draftPet.species]);
  const birthdayLabel = `${draftPet.birthMonth} ${draftPet.birthDay}, ${draftPet.birthYear}`;
  const birthdayDate = useMemo(() => getBirthdayDateFromPet(draftPet), [draftPet.birthMonth, draftPet.birthDay, draftPet.birthYear]);
  const ageLabel = useMemo(() => formatAge(draftPet), [draftPet]);
  const calendarDays = useMemo(() => buildCalendarDays(calendarMonthDate), [calendarMonthDate]);
  const activeCalendarDate = pendingBirthdayDate || birthdayDate;
  const yearOptions = useMemo(() => (
    YEARS.map((year) => ({
      label: year,
      value: year,
    }))
  ), []);
  const selectedBreedValue = isCustomBreedMode ? OTHER_OPTION_VALUE : (draftPet.breed || null);
  useEffect(() => {
    let active = true;
    async function loadExistingPet() {
      if (!petId || !loggedInUser?.id) return;
      try {
        const existing = await getOwnerPet(petId, loggedInUser.id);
        if (active && existing) {
          const nextDraft = createPetDraftFromPet(existing);
          setDraftPet(nextDraft);
          setIsCustomBreedMode(Boolean(nextDraft.breed) && !getBreedOptionsForSpecies(nextDraft.species).some((item) => item.value === nextDraft.breed));
        }
      } catch (error) {
        Alert.alert("Animal Patients", error.message || "Unable to load this pet.");
      }
    }
    loadExistingPet();
    return () => { active = false; };
  }, [petId, loggedInUser?.id]);

  const headerMenuItems = [
    { key: 'dashboard', label: 'Dashboard', icon: require('../../assets/Dashboard_Icon.png'), route: 'petowner-screen' },
    { key: 'appointment', label: 'Appointment', icon: require('../../assets/Appointment_Icon.png'), route: 'PetOwnerAppointment' },
    { key: 'mypets', label: 'Animal Patients', icon: require('../../assets/Pets_Icon.png'), route: 'PetOwnerMyPets' },
    { key: 'messages', label: 'Messages', icon: require('../../assets/Message_Icon.png'), route: 'PetOwnerMessages' },
  ];

  // Per-field validation shown under each input with a red border.
  const [fieldErrors, setFieldErrors] = useState({});
  const scrollRef = useRef(null);
  // A failed save scrolls back to the first field outlined in red.
  const errorScroll = useScrollToError(scrollRef);
  const FIELD_ORDER = ['photo', 'name', 'species', 'breed', 'birthday', 'weight', 'color', 'microchipNumber', 'allergies', 'existingConditions', 'notes'];
  const LABEL_FIELDS = {
    Name: 'name', Species: 'species', Breed: 'breed', Birthday: 'birthday', 'Weight (kg)': 'weight', Color: 'color',
    'Microchip Number': 'microchipNumber', Allergies: 'allergies', 'Existing Conditions': 'existingConditions', 'Additional Notes': 'notes',
  };
  const clearFieldError = (...names) => setFieldErrors((current) => (
    names.some((name) => current[name]) ? names.reduce((next, name) => ({ ...next, [name]: undefined }), current) : current
  ));
  const fieldErrorText = (name) => (fieldErrors[name] ? <Text style={inlineStyles.errorText}>{fieldErrors[name]}</Text> : null);

  const updateDraftPetField = (field, value) => {
    clearFieldError(field === 'profileImageUri' ? 'photo' : field);
    setDraftPet((current) => ({ ...current, [field]: value }));
  };

  const renderFormLabel = (label, showRequiredMark = false) => (
    <Text style={styles.formLabel} ref={LABEL_FIELDS[label] ? errorScroll.anchor(LABEL_FIELDS[label]) : undefined}>
      {label}
      {showRequiredMark ? <Text style={styles.requiredMark}> *</Text> : null}
    </Text>
  );

  const renderOptionalLabel = (label) => (
    <Text style={styles.formLabel} ref={LABEL_FIELDS[label] ? errorScroll.anchor(LABEL_FIELDS[label]) : undefined}>
      {label}
      <Text style={styles.optionalMark}> (Optional)</Text>
    </Text>
  );

  const hasEmptyRequiredField = (pet) =>
    !pet?.name?.trim() ||
    !pet?.species?.trim() ||
    !pet?.breed?.trim() ||
    !pet?.birthMonth ||
    !pet?.birthDay ||
    !pet?.birthYear;

  const handleSpeciesChange = (item) => {
    clearFieldError('species');
    setIsCustomBreedMode(false);
    setDraftPet((current) => ({
      ...current,
      species: item.value,
      breed: '',
      customBreed: '',
    }));
  };

  const handleBreedChange = (item) => {
    clearFieldError('breed');
    if (item.value === OTHER_OPTION_VALUE) {
      setIsCustomBreedMode(true);
      setDraftPet((current) => ({
        ...current,
        breed: current.customBreed || '',
      }));
      return;
    }

    setIsCustomBreedMode(false);
    setDraftPet((current) => ({
      ...current,
      breed: item.value,
      customBreed: '',
    }));
  };

  const handleCustomBreedChange = (value) => {
    clearFieldError('breed');
    setDraftPet((current) => ({
      ...current,
      customBreed: value,
      breed: value,
    }));
  };

  const openBirthdayCalendar = () => {
    setCalendarMonthDate(getBirthdayDateFromPet(draftPet));
    setPendingBirthdayDate(null);
    setShowYearGrid(false);
    setShowBirthdayCalendar(true);
  };

  // Year grid rows are 3 chips wide; open it scrolled to the selected year.
  const scrollYearGridToSelected = () => {
    const index = yearOptions.findIndex((option) => Number(option.value) === calendarMonthDate.getFullYear());
    const row = Math.floor(Math.max(index, 0) / 3);
    yearGridRef.current?.scrollTo({ y: Math.max(0, (row - 1) * YEAR_ROW_HEIGHT), animated: false });
  };

  const handleBirthdaySelect = (day) => {
    const nextDate = new Date(calendarMonthDate.getFullYear(), calendarMonthDate.getMonth(), day);
    setPendingBirthdayDate(nextDate);
  };

  const handleBirthdayDone = () => {
    if (!pendingBirthdayDate) {
      return;
    }
    clearFieldError('birthday');

    setDraftPet((current) => ({
      ...current,
      birthMonth: MONTHS[pendingBirthdayDate.getMonth()],
      birthDay: String(pendingBirthdayDate.getDate()),
      birthYear: String(pendingBirthdayDate.getFullYear()),
      age: getFormattedAgeFromBirthday({
        birthMonth: MONTHS[pendingBirthdayDate.getMonth()],
        birthDay: String(pendingBirthdayDate.getDate()),
        birthYear: String(pendingBirthdayDate.getFullYear()),
      }),
    }));
    setPendingBirthdayDate(null);
    setShowBirthdayCalendar(false);
  };

  const shiftCalendarMonth = (direction) => {
    setCalendarMonthDate((current) => {
      const candidateDate = new Date(current.getFullYear(), current.getMonth() + direction, 1);
      const latestAllowedDate = new Date(CURRENT_YEAR, CURRENT_MONTH_INDEX, 1);

      if (candidateDate > latestAllowedDate) {
        return current;
      }

      return candidateDate;
    });
  };

  const handleCalendarYearChange = (item) => {
    const year = Number(item.value);
    const limitedMonthIndex = year === CURRENT_YEAR
      ? Math.min(calendarMonthDate.getMonth(), CURRENT_MONTH_INDEX)
      : calendarMonthDate.getMonth();

    setCalendarMonthDate(new Date(year, limitedMonthIndex, 1));
    setPendingBirthdayDate(null);
  };

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

    openHeaderMenu();
  };

  const handleHeaderMenuPress = (routeName) => {
    closeHeaderMenu();
    navigation.navigate(routeName, { user: loggedInUser });
  };

  const takePhoto = async () => {
    setShowPhotoOptionsModal(false);
    const permission = await ImagePicker.requestCameraPermissionsAsync();

    if (!permission.granted) {
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      quality: 0.85,
    });

    if (result.canceled || !result.assets?.length) {
      return;
    }

    const validationError = validatePickedImageAsset(result.assets[0]);
    if (validationError) {
      setFieldErrors((current) => ({ ...current, photo: validationError }));
      return;
    }

    updateDraftPetField('profileImageUri', result.assets[0].uri);
  };

  const pickPhotoFromAlbum = async () => {
    setShowPhotoOptionsModal(false);
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 0.85,
    });

    if (result.canceled || !result.assets?.length) {
      return;
    }

    const validationError = validatePickedImageAsset(result.assets[0]);
    if (validationError) {
      setFieldErrors((current) => ({ ...current, photo: validationError }));
      return;
    }

    updateDraftPetField('profileImageUri', result.assets[0].uri);
  };

  const pickPhotoFromFiles = async () => {
    setShowPhotoOptionsModal(false);
    const result = await DocumentPicker.getDocumentAsync({
      type: 'image/*',
      copyToCacheDirectory: true,
      multiple: false,
    });

    if (result.canceled || !result.assets?.length) {
      return;
    }

    const validationError = validatePickedImageAsset(result.assets[0]);
    if (validationError) {
      setFieldErrors((current) => ({ ...current, photo: validationError }));
      return;
    }

    updateDraftPetField('profileImageUri', result.assets[0].uri);
  };

  const handleDonePress = () => {
    // Same rules as the web form and the vet's patient editor. Sex stays
    // optional here, as before.
    const { petName, species, breed, birthday, weight, color, microchipNumber, allergies, existingConditions, notes } =
      validatePatientDetails({ ...draftPet, petName: draftPet.name });
    const errors = Object.fromEntries(Object.entries({
      name: petName, species, breed, birthday, weight, color, microchipNumber, allergies, existingConditions, notes,
    }).filter(([, message]) => message));
    setFieldErrors(errors);
    if (Object.keys(errors).length) {
      errorScroll.scrollToFirstError(errors, FIELD_ORDER);
      return;
    }

    setShowDoneConfirm(true);
  };

  const handleCancelPress = () => {
    if (returnToRoute) {
      navigation.navigate(returnToRoute, { ...returnToParams, user: loggedInUser }, { merge: true });
      return;
    }

    if (petId) {
      navigation.replace('PetOwnerMyPetsView', { user: loggedInUser, petId });
      return;
    }

    navigation.navigate('PetOwnerMyPets', { user: loggedInUser });
  };

  const [archiving, setArchiving] = useState(false);

  const archivePet = async () => {
    try {
      setArchiving(true);
      await archiveOwnerPet(petId, loggedInUser?.id, true);
      navigation.navigate('PetOwnerMyPets', { user: loggedInUser });
      Alert.alert('Animal Patients', 'Pet record archived successfully.');
    } catch (error) {
      Alert.alert('Animal Patients', error.message || 'Unable to update the pet archive status.');
    } finally {
      setArchiving(false);
    }
  };

  // Same confirmation the web app shows before archiving.
  const handleArchivePress = () => {
    if (archiving) return;
    Alert.alert(
      'Archive this pet?',
      `${draftPet.name || 'This pet'}'s record will be archived and hidden from the active list. You can restore it anytime from View Archived.`,
      [
        { text: 'No', style: 'cancel' },
        { text: 'Yes, Archive', style: 'destructive', onPress: archivePet },
      ],
    );
  };

  const handleSavePet = async () => {
    if (savingPet) return;
    setSavingPet(true);
    setSaveError('');
    try {
      const savedPet = await saveOwnerPet(draftPet, loggedInUser?.id);
      setShowDoneConfirm(false);
      setSavingPet(false);

      if (returnToRoute) {
        navigation.navigate(returnToRoute, { ...returnToParams, user: loggedInUser, preselectedPetId: savedPet.id }, { merge: true });
        return;
      }

      navigation.replace('PetOwnerMyPetsView', {
        user: loggedInUser,
        petId: savedPet.id,
        savedNotice: isCreatingPet ? `${savedPet.name || 'Your pet'} was added successfully.` : 'Pet profile saved successfully.',
      });
    } catch (error) {
      setShowDoneConfirm(false);
      setSavingPet(false);
      setSaveError(error?.message || 'Unable to save the pet right now. Please try again.');
      scrollRef.current?.scrollTo({ y: 0, animated: true });
    }
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
                <Text style={styles.headerSubtitle}>
                  {isCreatingPet ? 'Add Pet Profile' : 'Edit Pet Profile'}
                </Text>
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

          <CollapsingHeaderRow animation={headerMotion.lowerHeaderAnimation}>
            <View style={styles.headerBottomRow}>

              <PetOwnerHeaderGreeting caption="Edit your pet's profile" user={loggedInUser} />
            </View>
          </CollapsingHeaderRow>

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
                  ],
                },
              ]}
            >
              {headerMenuItems.map((item) => (
                <TouchableOpacity
                  key={item.key}
                  style={styles.headerMenuItem}
                  onPress={() => handleHeaderMenuPress(item.route)}
                  activeOpacity={0.88}
                >
                  <View style={styles.headerMenuItemIconWrap}>
                    <Image source={item.icon} style={styles.headerMenuItemIcon} resizeMode="contain" />
                  </View>
                  <Text style={styles.headerMenuItemLabel}>{item.label}</Text>
                </TouchableOpacity>
              ))}
            </Animated.View>
          ) : null}
        </LinearGradient>

        <ScrollView onScroll={headerMotion.handleScroll} scrollEventThrottle={16} ref={scrollRef} showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>

          <View style={styles.detailCard}>
            <View style={styles.detailTopRow}>
              <TouchableOpacity
                style={styles.secondaryActionButtonWide}
                onPress={handleCancelPress}
                activeOpacity={0.9}
              >
                <Text style={styles.secondaryActionText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.primaryActionButtonWide} onPress={handleDonePress} activeOpacity={0.9}>
                <Text style={styles.primaryActionText}>Done</Text>
              </TouchableOpacity>
            </View>
            {saveError ? <Text style={inlineStyles.saveError}>{saveError}</Text> : null}

            <View style={styles.editPhotoSection} ref={errorScroll.anchor('photo')}>
              <View style={styles.editAvatarWrap}>
                <View style={[styles.largePetAvatar, { backgroundColor: draftPet.profileColor }]}>
                  {activePhoto.source ? (
                    <Image
                      source={activePhoto.source}
                      style={activePhoto.isCustom ? styles.largePetAvatarImageCustom : styles.largePetAvatarImage}
                      resizeMode="cover"
                    />
                  ) : (
                    <Text style={styles.largePetAvatarText}>{draftPet.name.charAt(0) || 'P'}</Text>
                  )}
                </View>

                <TouchableOpacity
                  style={styles.avatarAddButton}
                  onPress={() => setShowPhotoOptionsModal(true)}
                  activeOpacity={0.9}
                >
                  <Text style={styles.avatarAddButtonText}>+</Text>
                </TouchableOpacity>
              </View>
              {fieldErrorText('photo')}

            </View>

            <View style={styles.formCard}>

              {renderFormLabel('Name', !draftPet.name?.trim())}
              <TextInput
                value={draftPet.name}
                onChangeText={(value) => updateDraftPetField('name', value)}
                style={[styles.inputField, fieldErrors.name && inlineStyles.invalid]}
                placeholder="Enter pet name"
                placeholderTextColor="#87a0b1"
              />
              {fieldErrorText('name')}

              {renderFormLabel('Species', !draftPet.species?.trim())}
              <View style={styles.enhancedFieldCard}>
                <View style={[styles.dropdownShell, fieldErrors.species && inlineStyles.invalid]}>
                  <Dropdown
                    style={styles.searchableDropdown}
                    containerStyle={styles.searchableDropdownContainer}
                    placeholderStyle={styles.dropdownPlaceholder}
                    selectedTextStyle={styles.dropdownSelectedText}
                    itemTextStyle={styles.dropdownItemText}
                    iconStyle={styles.dropdownIcon}
                    activeColor="#edf7fd"
                    data={PET_SPECIES_OPTIONS.map((species) => ({ label: species, value: species }))}
                    search
                    maxHeight={280}
                    labelField="label"
                    valueField="value"
                    placeholder="Select species"
                    searchPlaceholder="Search species..."
                    value={draftPet.species}
                    onChange={handleSpeciesChange}
                  />
                </View>
                {fieldErrorText('species')}
                <Text style={styles.inlineFieldHint}>Breed options update based on the species you pick.</Text>
              </View>

              {renderFormLabel('Breed', !draftPet.breed?.trim())}
              <View style={styles.enhancedFieldCard}>
                <View style={[styles.dropdownShell, fieldErrors.breed && !isCustomBreedMode && inlineStyles.invalid]}>
                  <Dropdown
                    style={styles.searchableDropdown}
                    containerStyle={styles.searchableDropdownContainer}
                    placeholderStyle={styles.dropdownPlaceholder}
                    selectedTextStyle={styles.dropdownSelectedText}
                    itemTextStyle={styles.dropdownItemText}
                    iconStyle={styles.dropdownIcon}
                    activeColor="#edf7fd"
                    data={breedOptions}
                    search
                    maxHeight={300}
                    labelField="label"
                    valueField="value"
                    placeholder={`Select ${draftPet.species === 'Feline (Cat)' ? 'cat' : 'pet'} breed`}
                    searchPlaceholder="Search breed..."
                    value={selectedBreedValue}
                    onChange={handleBreedChange}
                  />
                </View>
                {isCustomBreedMode ? (
                  <TextInput
                    value={draftPet.customBreed}
                    onChangeText={handleCustomBreedChange}
                    style={[styles.inputField, styles.stackedInputField, fieldErrors.breed && inlineStyles.invalid]}
                    placeholder="Type breed"
                    placeholderTextColor="#87a0b1"
                  />
                ) : null}
                {fieldErrorText('breed')}
              </View>

              <Text style={styles.formLabel}>Sex</Text>
              <View style={styles.pickerFieldWrap}>
                <Dropdown
                  style={styles.searchableDropdown}
                  containerStyle={styles.searchableDropdownContainer}
                  placeholderStyle={styles.dropdownPlaceholder}
                  selectedTextStyle={styles.dropdownSelectedText}
                  itemTextStyle={styles.dropdownItemText}
                  iconStyle={styles.dropdownIcon}
                  activeColor="#edf7fd"
                  data={[
                    { label: 'Male', value: 'Male' },
                    { label: 'Female', value: 'Female' },
                  ]}
                  labelField="label"
                  valueField="value"
                  placeholder="Select sex"
                  value={draftPet.sex}
                  onChange={(item) => updateDraftPetField('sex', item.value)}
                />
              </View>

              {renderFormLabel('Birthday', !draftPet.birthMonth || !draftPet.birthDay || !draftPet.birthYear)}
              <View style={styles.birthdayFieldCard}>
                <Text style={styles.birthdayInfoText}>Select the birthday to identify the pet&apos;s age.</Text>
                <TouchableOpacity style={[styles.calendarTriggerButton, fieldErrors.birthday && inlineStyles.invalid]} onPress={openBirthdayCalendar} activeOpacity={0.88}>
                  <View>
                    <Text style={styles.calendarTriggerLabel}>Selected Date</Text>
                    <Text style={styles.calendarTriggerValue}>{birthdayLabel}</Text>
                  </View>
                  <Image source={CALENDAR_ICON} style={styles.calendarTriggerIconImage} resizeMode="contain" />
                </TouchableOpacity>
                {fieldErrorText('birthday')}
                <View style={styles.birthdayAgeSummary}>
                  <Text style={styles.birthdayAgeLabel}>Age</Text>
                  <Text style={styles.birthdayAgeValue}>{ageLabel}</Text>
                </View>
              </View>

              {renderOptionalLabel('Weight (kg)')}
              <TextInput
                value={draftPet.weight}
                onChangeText={(value) => updateDraftPetField('weight', value.replace(/[^0-9.]/g, ''))}
                style={[styles.inputField, fieldErrors.weight && inlineStyles.invalid]}
                placeholder="Enter pet weight in kg"
                placeholderTextColor="#87a0b1"
                keyboardType="decimal-pad"
                maxLength={6}
              />
              {fieldErrorText('weight')}

              {renderOptionalLabel('Color')}
              <TextInput
                value={draftPet.color}
                onChangeText={(value) => updateDraftPetField('color', value)}
                style={[styles.inputField, fieldErrors.color && inlineStyles.invalid]}
                placeholder="Enter pet color"
                placeholderTextColor="#87a0b1"
                maxLength={40}
              />
              {fieldErrorText('color')}

              {renderOptionalLabel('Microchip Number')}
              <TextInput
                value={draftPet.microchipNumber}
                onChangeText={(value) => updateDraftPetField('microchipNumber', value.replace(/[^0-9]/g, ''))}
                style={[styles.inputField, fieldErrors.microchipNumber && inlineStyles.invalid]}
                placeholder="Enter microchip number (9 to 15 digits)"
                placeholderTextColor="#87a0b1"
                keyboardType="number-pad"
                maxLength={15}
              />
              {fieldErrorText('microchipNumber')}

              {renderOptionalLabel('Allergies')}
              <TextInput
                value={draftPet.allergies}
                onChangeText={(value) => updateDraftPetField('allergies', value)}
                style={[styles.textAreaField, fieldErrors.allergies && inlineStyles.invalid]}
                placeholder="Enter known allergies or write none"
                placeholderTextColor="#87a0b1"
                multiline
                textAlignVertical="top"
                maxLength={500}
              />
              {fieldErrorText('allergies')}

              {renderOptionalLabel('Existing Conditions')}
              <TextInput
                value={draftPet.existingConditions}
                onChangeText={(value) => updateDraftPetField('existingConditions', value)}
                style={[styles.textAreaField, fieldErrors.existingConditions && inlineStyles.invalid]}
                placeholder="Enter existing medical conditions"
                placeholderTextColor="#87a0b1"
                multiline
                textAlignVertical="top"
                maxLength={500}
              />
              {fieldErrorText('existingConditions')}

              {/* Saved to the same notes column the web form's Additional Notes uses. */}
              {renderOptionalLabel('Additional Notes')}
              <TextInput
                value={draftPet.notes}
                onChangeText={(value) => updateDraftPetField('notes', value)}
                style={[styles.textAreaField, fieldErrors.notes && inlineStyles.invalid]}
                placeholder="Enter special markings, care or behavior notes"
                placeholderTextColor="#87a0b1"
                multiline
                textAlignVertical="top"
                maxLength={500}
              />
              {fieldErrorText('notes')}
            </View>

            {!isCreatingPet ? (
              <TouchableOpacity
                style={[styles.archivePetButton, archiving && { opacity: 0.6 }]}
                onPress={handleArchivePress}
                disabled={archiving}
                activeOpacity={0.9}
              >
                <Text style={styles.archivePetButtonText}>{archiving ? 'Archiving...' : 'Archive Pet'}</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </ScrollView>

        <Modal transparent animationType="fade" visible={showPhotoOptionsModal} onRequestClose={() => setShowPhotoOptionsModal(false)}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Update Pet Photo</Text>
              <Text style={styles.modalMessage}>Choose how you want to add the pet profile picture.</Text>
              <TouchableOpacity style={styles.photoOptionButton} onPress={takePhoto} activeOpacity={0.9}>
                <Text style={styles.photoOptionButtonText}>Take a Photo</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.photoOptionButton} onPress={pickPhotoFromAlbum} activeOpacity={0.9}>
                <Text style={styles.photoOptionButtonText}>Choose from Album</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.photoOptionButton} onPress={pickPhotoFromFiles} activeOpacity={0.9}>
                <Text style={styles.photoOptionButtonText}>Choose from Files</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSecondaryButton} onPress={() => setShowPhotoOptionsModal(false)} activeOpacity={0.9}>
                <Text style={styles.modalSecondaryText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        <Modal transparent animationType="fade" visible={showBirthdayCalendar} onRequestClose={() => setShowBirthdayCalendar(false)}>
          <View style={styles.modalOverlay}>
            <View style={styles.calendarModalCard}>
              <Text style={styles.modalTitle}>Select Birthday</Text>
              <Text style={styles.modalMessage}>Pick the exact birth date from the calendar below.</Text>

              <View style={styles.calendarHeaderRow}>
                <TouchableOpacity style={styles.calendarNavButton} onPress={() => shiftCalendarMonth(-1)} activeOpacity={0.88}>
                  <Text style={styles.calendarNavButtonText}>Previous</Text>
                </TouchableOpacity>
                <View style={styles.calendarTitleWrap}>
                  <Text style={styles.calendarActiveMonth}>{MONTHS[calendarMonthDate.getMonth()]}</Text>
                  <TouchableOpacity
                    style={[styles.calendarPickerWrapYear, styles.calendarYearToggle]}
                    onPress={() => setShowYearGrid((open) => !open)}
                    activeOpacity={0.88}
                  >
                    <Text style={styles.dropdownSelectedText}>{calendarMonthDate.getFullYear()}</Text>
                    <Text style={styles.calendarYearChevron}>{showYearGrid ? '▲' : '▼'}</Text>
                  </TouchableOpacity>
                </View>
                <TouchableOpacity
                  style={[
                    styles.calendarNavButton,
                    calendarMonthDate.getFullYear() === CURRENT_YEAR &&
                    calendarMonthDate.getMonth() === CURRENT_MONTH_INDEX &&
                    styles.calendarNavButtonDisabled,
                  ]}
                  onPress={() => shiftCalendarMonth(1)}
                  activeOpacity={0.88}
                  disabled={
                    calendarMonthDate.getFullYear() === CURRENT_YEAR &&
                    calendarMonthDate.getMonth() === CURRENT_MONTH_INDEX
                  }
                >
                  <Text style={styles.calendarNavButtonText}>Next</Text>
                </TouchableOpacity>
              </View>

              {showYearGrid ? (
                <ScrollView
                  ref={yearGridRef}
                  style={styles.calendarYearGridScroll}
                  contentContainerStyle={styles.calendarYearGrid}
                  showsVerticalScrollIndicator={false}
                  onLayout={scrollYearGridToSelected}
                >
                  {yearOptions.map((option) => {
                    const isSelectedYear = Number(option.value) === calendarMonthDate.getFullYear();
                    return (
                      <TouchableOpacity
                        key={option.value}
                        style={[styles.calendarYearCell, isSelectedYear && styles.calendarDayCellSelected]}
                        onPress={() => {
                          handleCalendarYearChange(option);
                          setShowYearGrid(false);
                        }}
                        activeOpacity={0.88}
                      >
                        <Text style={[styles.calendarDayText, isSelectedYear && styles.calendarDayTextSelected]}>
                          {option.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              ) : (
              <>
              <View style={styles.calendarWeekHeader}>
                {CALENDAR_DAY_LABELS.map((label) => (
                  <Text key={label} style={styles.calendarWeekLabel}>{label}</Text>
                ))}
              </View>

              <View style={styles.calendarGrid}>
                {calendarDays.map((day, index) => {
                  const isFutureDate = day
                    ? (
                      calendarMonthDate.getFullYear() > CURRENT_YEAR ||
                      (
                        calendarMonthDate.getFullYear() === CURRENT_YEAR &&
                        calendarMonthDate.getMonth() > CURRENT_MONTH_INDEX
                      ) ||
                      (
                        calendarMonthDate.getFullYear() === CURRENT_YEAR &&
                        calendarMonthDate.getMonth() === CURRENT_MONTH_INDEX &&
                        day > CURRENT_DAY
                      )
                    )
                    : false;
                  const isSelected =
                    day &&
                    isSameCalendarDate(activeCalendarDate, new Date(calendarMonthDate.getFullYear(), calendarMonthDate.getMonth(), day));

                  return (
                    <TouchableOpacity
                      key={`${calendarMonthDate.getMonth()}-${calendarMonthDate.getFullYear()}-${index}`}
                      style={[
                        styles.calendarDayCell,
                        !day && styles.calendarDayCellEmpty,
                        isFutureDate && styles.calendarDayCellDisabled,
                        isSelected && styles.calendarDayCellSelected,
                      ]}
                      onPress={() => day && !isFutureDate && handleBirthdaySelect(day)}
                      disabled={!day || isFutureDate}
                      activeOpacity={0.88}
                    >
                      <Text
                        style={[
                          styles.calendarDayText,
                          !day && styles.calendarDayTextEmpty,
                          isFutureDate && styles.calendarDayTextDisabled,
                          isSelected && styles.calendarDayTextSelected,
                        ]}
                      >
                        {day || ''}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              </>
              )}

              <View style={styles.modalButtonRow}>
                <TouchableOpacity
                  style={styles.modalSecondaryButton}
                  onPress={() => {
                    setPendingBirthdayDate(null);
                    setShowBirthdayCalendar(false);
                  }}
                  activeOpacity={0.9}
                >
                  <Text style={styles.modalSecondaryText}>Cancel</Text>
                </TouchableOpacity>
                {pendingBirthdayDate ? (
                  <TouchableOpacity style={styles.modalPrimaryButton} onPress={handleBirthdayDone} activeOpacity={0.9}>
                    <Text style={styles.modalPrimaryText}>Done</Text>
                  </TouchableOpacity>
                ) : (
                  <View style={styles.calendarDonePlaceholder} />
                )}
              </View>
            </View>
          </View>
        </Modal>

        <Modal transparent animationType="fade" visible={showRequiredFieldsModal} onRequestClose={() => setShowRequiredFieldsModal(false)}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Required Fields</Text>
              <Text style={styles.modalMessage}>Please complete all required pet fields first.</Text>
              <TouchableOpacity style={styles.modalSingleButton} onPress={() => setShowRequiredFieldsModal(false)} activeOpacity={0.9}>
                <Text style={styles.modalSingleButtonText}>Back</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        <Modal transparent animationType="fade" visible={showDoneConfirm} onRequestClose={() => setShowDoneConfirm(false)}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Save Changes</Text>
              <Text style={styles.modalMessage}>Are you sure you want to apply these pet profile updates?</Text>
              <View style={styles.modalButtonRow}>
                <TouchableOpacity style={styles.modalSecondaryButton} onPress={() => setShowDoneConfirm(false)} disabled={savingPet} activeOpacity={0.9}>
                  <Text style={styles.modalSecondaryText}>No</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.modalPrimaryButton, savingPet && { opacity: 0.6 }]} onPress={handleSavePet} disabled={savingPet} activeOpacity={0.9}>
                  <Text style={styles.modalPrimaryText}>{savingPet ? 'Saving…' : 'Yes'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
        <PetOwnerBottomNav navigation={navigation} user={loggedInUser} activeKey="pets" />
      </SafeAreaView>
    </LinearGradient>
  );
};

export default PetOwnerMyPetsEdit;

const inlineStyles = StyleSheet.create({
  invalid: { borderColor: '#dc2626', borderWidth: 1 },
  errorText: { marginTop: 6, fontSize: 12, lineHeight: 17, fontWeight: '700', color: '#dc2626' },
  saveError: { marginTop: 12, padding: 10, borderRadius: 12, backgroundColor: '#fff1f1', borderWidth: 1, borderColor: '#f4cccc', color: '#a33f3f', fontSize: 12.5, fontWeight: '700' },
});
