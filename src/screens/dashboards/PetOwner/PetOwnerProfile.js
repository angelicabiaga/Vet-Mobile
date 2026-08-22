import { SafeAreaView } from 'react-native-safe-area-context';
import PetOwnerSideDrawer from './PetOwnerSideDrawer';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActionSheetIOS,
  Alert,
  Animated,
  Easing,
  Image,
  Modal,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { styles } from '../../styles/PetOwnerProfileDesign';
import CustomModal from '../../../components/CustomModal';
import ProfileOtpModal from '../../../components/ProfileOtpModal';
import { getProfile, updateProfile, uploadProfileAvatar, subscribeProfile, requestEmailChangeOtp, confirmEmailChangeOtp, requestPasswordChangeOtp, confirmPasswordChangeOtp } from '../../../api/profileService';
import { validatePickedImageAsset } from '../../../utils/imageValidation';
import { isValidPhMobile, PH_MOBILE_FORMAT_ERROR } from '../../../utils/contactValidation';

const DEFAULT_PROFILE_IMAGE = require('../../assets/Profile.png');
const EYE_SHOW = require('../../assets/eye-show.png');
const EYE_HIDE = require('../../assets/eye-hide.png');

const PasswordInput = ({ value, onChangeText, placeholder }) => {
  const [visible, setVisible] = useState(false);
  return <View style={{ position: 'relative', justifyContent: 'center' }}>
    <TextInput value={value} onChangeText={onChangeText} style={[styles.inputField, { paddingRight: 48 }]} placeholder={placeholder} placeholderTextColor="#87a0b1" secureTextEntry={!visible} autoCapitalize="none" autoCorrect={false} />
    <TouchableOpacity onPress={() => setVisible((current) => !current)} style={{ position: 'absolute', right: 12, width: 30, height: 40, alignItems: 'center', justifyContent: 'center' }} accessibilityRole="button" accessibilityLabel={visible ? 'Hide password' : 'Show password'}>
      <Image source={visible ? EYE_HIDE : EYE_SHOW} style={{ width: 22, height: 22, tintColor: '#526d82' }} resizeMode="contain" />
    </TouchableOpacity>
  </View>;
};

const splitFullName = (value) => {
  const trimmedValue = (value || '').trim();

  if (!trimmedValue) {
    return { firstName: '', middleName: '', lastName: '' };
  }

  const parts = trimmedValue.split(/\s+/);

  if (parts.length < 3) {
    return { firstName: parts[0] || '', middleName: '', lastName: parts.slice(1).join(' ') };
  }

  const middleName = parts.slice(1, -1).join(' ').replace(/^([A-Za-z])\.$/, '$1');

  return {
    firstName: parts[0] || '',
    middleName,
    lastName: parts[parts.length - 1],
  };
};

const buildProfileFromUser = (user) => {
  const resolvedName = user?.full_name || user?.fullName || user?.name || '';
  const { firstName, middleName, lastName } = splitFullName(resolvedName);

  return {
    username:
      user?.username ||
      user?.name ||
      user?.fullName ||
      'Pet Owner',
    firstName,
    middleName,
    lastName,
    fullName: resolvedName,
    email:
      user?.email ||
      user?.gmail ||
      user?.accountEmail ||
      user?.userEmail ||
      '',
    contact: user?.phone || user?.contact || '',
    emergencyContact: user?.emergencyContact || '',
    address: user?.address || '',
    age: String(user?.age || ''),
    profileImageUri: user?.avatar_url || user?.profileImageUri || user?.avatar || '',
    newPassword: '',
    confirmPassword: '',
    currentPassword: '',
  };
};

const PetOwnerProfile = ({ navigation, route }) => {
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [showSaveConfirm, setShowSaveConfirm] = useState(false);
  const [showProfileToast, setShowProfileToast] = useState(false);
  const [showPhotoOptions, setShowPhotoOptions] = useState(false);
  const [showRequiredFieldsModal, setShowRequiredFieldsModal] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [showOtpModal, setShowOtpModal] = useState(false);
  const [otpError, setOtpError] = useState('');
  const [otpLoading, setOtpLoading] = useState(false);
  const [otpPurpose, setOtpPurpose] = useState('');
  const [pendingNewPassword, setPendingNewPassword] = useState('');
  const [sensitiveError, setSensitiveError] = useState('');
  const [profileToastTitle, setProfileToastTitle] = useState('Profile Updated');
  const [profileToastMessage, setProfileToastMessage] = useState('Your profile changes were saved successfully.');
  const scrollViewRef = useRef(null);

  const loggedInUser = route?.params?.user;

  const [profileData, setProfileData] = useState(buildProfileFromUser(loggedInUser));

  const [draftProfile, setDraftProfile] = useState(profileData);
  const currentUser = { ...(loggedInUser || {}), ...profileData };
  const profileImageUri = currentUser?.profileImageUri || currentUser?.avatar || '';
  const headerMenuAnimation = useRef(new Animated.Value(0)).current;
  const lowerHeaderAnimation = useRef(new Animated.Value(1)).current;
  const isHeaderMenuAnimating = useRef(false);
  const isLowerHeaderVisible = useRef(true);
  const lastScrollY = useRef(0);
  const [isHeaderMenuVisible, setIsHeaderMenuVisible] = useState(false);
  const headerMenuItems = [
    { key: 'dashboard', label: 'Dashboard', icon: require('../../assets/Dashboard_Icon.png'), route: 'petowner-screen' },
    { key: 'appointment', label: 'Appointment', icon: require('../../assets/Appointment_Icon.png'), route: 'PetOwnerAppointment' },
    { key: 'mypets', label: 'Animal Patients', icon: require('../../assets/Pets_Icon.png'), route: 'PetOwnerMyPets' },
    { key: 'messages', label: 'Messages', icon: require('../../assets/Message_Icon.png'), route: 'PetOwnerMessages' },  ];

  useEffect(() => {
    const syncedProfile = buildProfileFromUser(loggedInUser);
    setProfileData(syncedProfile);
    setDraftProfile(syncedProfile);
  }, [loggedInUser]);

  useEffect(() => {
    const profileId = loggedInUser?.id;
    if (!profileId) return undefined;
    let active = true;

    const applyProfile = (row) => {
      if (!active || !row) return;
      const synced = buildProfileFromUser(row);
      setProfileData(synced);
      setDraftProfile(synced);
      navigation.setParams({ user: { ...(loggedInUser || {}), ...row, ...synced } });
    };

    getProfile(profileId).then(applyProfile).catch((error) => {
      console.warn('Unable to sync Pet Owner profile:', error?.message || error);
    });
    const unsubscribe = subscribeProfile(profileId, applyProfile);
    return () => { active = false; unsubscribe?.(); };
  }, [loggedInUser?.id]);

  useEffect(() => {
    if (!showProfileToast) {
      return undefined;
    }

    const timer = setTimeout(() => {
      setShowProfileToast(false);
    }, 5000);

    return () => clearTimeout(timer);
  }, [showProfileToast]);

  const openEditMode = () => {
    setDraftProfile(profileData);
    setFieldErrors({});
    setIsEditing(true);
  };

  const cancelEditMode = () => {
    setDraftProfile(profileData);
    setFieldErrors({});
    setIsEditing(false);
    setShowPhotoOptions(false);
  };

  const saveProfile = async () => {
    const profileId = loggedInUser?.id;
    const middleName = String(draftProfile.middleName || '').trim();
    const fullName = [draftProfile.firstName.trim(), middleName, draftProfile.lastName.trim()].filter(Boolean).join(' ');

    try {
      let avatarUrl = profileData.profileImageUri || null;
      if (draftProfile.profileImageUri && draftProfile.profileImageUri !== profileData.profileImageUri) {
        avatarUrl = await uploadProfileAvatar(profileId, draftProfile.profileImageUri);
      }

      const updated = await updateProfile(profileId, {
        full_name: fullName,
        username: draftProfile.username,
        phone: draftProfile.contact,
        address: draftProfile.address,
        avatar_url: avatarUrl,
      });

      const nextProfile = buildProfileFromUser(updated);
      setShowSaveConfirm(false);
      const emailChanged = draftProfile.email.trim().toLowerCase() !== profileData.email.trim().toLowerCase();
      if (emailChanged) {
        await requestEmailChangeOtp(profileId, draftProfile.currentPassword, draftProfile.email);
        setOtpPurpose('change_email');
        setOtpError('');
        setShowOtpModal(true);
        return;
      }
      if (draftProfile.newPassword) {
        await requestPasswordChangeOtp(profileId, draftProfile.currentPassword);
        setPendingNewPassword(draftProfile.newPassword);
        setOtpPurpose('change_password');
        setOtpError('');
        setShowOtpModal(true);
        return;
      }
      setProfileData(nextProfile);
      setDraftProfile(nextProfile);
      setIsEditing(false);
      setProfileToastTitle('Profile Updated');
      setProfileToastMessage('Your profile changes were saved successfully.');
      setShowProfileToast(true);
      navigation.setParams({ user: { ...(loggedInUser || {}), ...updated, ...nextProfile } });
    } catch (error) {
      setShowSaveConfirm(false);
      setSensitiveError(error?.message || 'Unable to save profile.');
      console.warn('Unable to save synced profile:', error?.message || error);
    }
  };

  const updateDraftField = (field, value) => {
    setDraftProfile((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => (current[field] ? { ...current, [field]: undefined } : current));
  };

  const hasEmptyRequiredField = (profile) =>
    !profile?.firstName?.trim() ||
    !profile?.lastName?.trim() ||
    !profile?.username?.trim() ||
    !profile?.email?.trim();

  const validateProfileFields = (profile) => {
    const nextErrors = {};
    if (!profile?.firstName?.trim()) nextErrors.firstName = 'First name is required.';
    if (!profile?.lastName?.trim()) nextErrors.lastName = 'Last name is required.';
    if (!profile?.contact?.trim()) nextErrors.contact = 'Contact number is required.';
    else if (!isValidPhMobile(profile.contact)) nextErrors.contact = PH_MOBILE_FORMAT_ERROR;
    if (!profile?.address?.trim()) nextErrors.address = 'Address is required.';
    return nextErrors;
  };

  const handleDonePress = () => {
    const nextFieldErrors = validateProfileFields(draftProfile);
    if (Object.keys(nextFieldErrors).length) {
      setFieldErrors(nextFieldErrors);
      return;
    }

    if (hasEmptyRequiredField(draftProfile)) {
      setShowRequiredFieldsModal(true);
      return;
    }

    const emailChanged = draftProfile.email.trim().toLowerCase() !== profileData.email.trim().toLowerCase();
    const passwordChanged = Boolean(draftProfile.newPassword);

    if (emailChanged && passwordChanged) {
      setSensitiveError('Change your email and password separately, as each requires its own verification code.');
      return;
    }

    if (emailChanged && !/^\S+@\S+\.\S+$/.test(draftProfile.email.trim())) {
      setSensitiveError('Enter a valid email address.');
      return;
    }

    if (passwordChanged) {
      const strongPassword = draftProfile.newPassword.length >= 8 && /[A-Z]/.test(draftProfile.newPassword) && /[a-z]/.test(draftProfile.newPassword) && /\d/.test(draftProfile.newPassword) && /[^A-Za-z0-9]/.test(draftProfile.newPassword);
      if (!strongPassword || draftProfile.newPassword !== draftProfile.confirmPassword) {
        setSensitiveError(!strongPassword ? 'Password must meet all security requirements.' : 'Passwords do not match.');
        return;
      }
    }

    setSensitiveError('');

    if ((emailChanged || passwordChanged) && !draftProfile.currentPassword) {
      setSensitiveError('Enter your current password to verify this change.');
      return;
    }

    setShowSaveConfirm(true);
  };

  const verifyProfileOtp = async (code) => {
    try {
      setOtpLoading(true);
      setOtpError('');
      let result;
      if (otpPurpose === 'change_email') result = await confirmEmailChangeOtp(loggedInUser?.id, code);
      else result = await confirmPasswordChangeOtp(loggedInUser?.id, code, pendingNewPassword);
      setShowOtpModal(false);
      const refreshed = result?.profile || await getProfile(loggedInUser?.id);
      const nextProfile = buildProfileFromUser(refreshed);
      setProfileData(nextProfile);
      setDraftProfile(nextProfile);
      setIsEditing(false);
      setShowProfileToast(true);
      setProfileToastTitle(otpPurpose === 'change_email' ? 'Email Changed' : 'Password Changed');
      setProfileToastMessage(otpPurpose === 'change_email' ? 'Your new email address was verified and saved successfully.' : 'Your password was changed successfully.');
      navigation.setParams({ user: { ...(loggedInUser || {}), ...refreshed, ...nextProfile } });
    } catch (error) {
      setOtpError(error.message || 'Invalid or expired OTP.');
    } finally {
      setOtpLoading(false);
    }
  };

  const sendProfileOtp = async () => {
    try {
      setOtpLoading(true);
      setOtpError('');
      if (otpPurpose === 'change_email') await requestEmailChangeOtp(loggedInUser?.id, draftProfile.currentPassword, draftProfile.email);
      else await requestPasswordChangeOtp(loggedInUser?.id, draftProfile.currentPassword);
      return true;
    } catch (error) {
      setOtpError(error.message || 'Unable to resend OTP.');
      return false;
    } finally {
      setOtpLoading(false);
    }
  };

  const pickPhotoFromAlbum = async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permission.granted) {
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.85,
      });

      if (result.canceled || !result.assets?.length) {
        return;
      }

      const validationError = validatePickedImageAsset(result.assets[0]);
      if (validationError) {
        Alert.alert('Invalid Photo', validationError);
        return;
      }

      updateDraftField('profileImageUri', result.assets[0].uri);
    } catch (error) {
      console.warn('Failed to open album picker for profile photo:', error);
    }
  };

  const pickPhotoFromFiles = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['image/*'],
        copyToCacheDirectory: true,
        multiple: false,
      });

      if (result.canceled || !result.assets?.length) {
        return;
      }

      const validationError = validatePickedImageAsset(result.assets[0]);
      if (validationError) {
        Alert.alert('Invalid Photo', validationError);
        return;
      }

      updateDraftField('profileImageUri', result.assets[0].uri);
    } catch (error) {
      console.warn('Failed to open file picker for profile photo:', error);
    }
  };

  const takePhotoWithCamera = async () => {
    try {
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
        Alert.alert('Invalid Photo', validationError);
        return;
      }

      updateDraftField('profileImageUri', result.assets[0].uri);
    } catch (error) {
      console.warn('Failed to open camera for profile photo:', error);
    }
  };

  const handlePhotoOptionPress = (action) => {
    setShowPhotoOptions(false);
    setTimeout(() => {
      action();
    }, Platform.OS === 'ios' ? 280 : 120);
  };

  const openPhotoOptions = () => {
    if (!isEditing) {
      return;
    }

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ['Cancel', 'Choose from Album', 'Choose from Files', 'Use Camera'],
          cancelButtonIndex: 0,
          userInterfaceStyle: 'light',
        },
        (buttonIndex) => {
          if (buttonIndex === 1) {
            pickPhotoFromAlbum();
          } else if (buttonIndex === 2) {
            pickPhotoFromFiles();
          } else if (buttonIndex === 3) {
            takePhotoWithCamera();
          }
        }
      );
      return;
    }

    setShowPhotoOptions(true);
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

    scrollViewRef.current?.scrollTo({ y: 0, animated: true });
    openHeaderMenu();
  };

  const handleHeaderMenuPress = (routeName) => {
    closeHeaderMenu();
    navigation.navigate(routeName, { user: currentUser });
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
                <Text style={styles.headerSubtitle}>Pet Owner Profile</Text>
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

          {showProfileToast ? (
            <View style={styles.notificationToast}>
              <View style={styles.notificationPointer} />
              <Text style={styles.notificationToastTitle}>{profileToastTitle}</Text>
              <Text style={styles.notificationToastText}>
                {profileToastMessage}
              </Text>
            </View>
          ) : null}

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
              <Text style={styles.headerCaption}>Account overview</Text>
              <Text style={styles.ownerName}>{profileData.username}</Text>
            </View>
            </View>
          </Animated.View>

          <PetOwnerSideDrawer visible={isHeaderMenuVisible} onClose={() => setIsHeaderMenuVisible(false)} navigation={navigation} user={currentUser} />
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
          <View style={styles.sectionHeaderWrap}>
            <Text style={styles.sectionTitle}>
              {isEditing ? 'Edit Profile' : 'Profile Overview'}
            </Text>
            <Text style={styles.sectionSubtitle}>
              {isEditing
                ? 'Update your profile details just like the pet edit flow'
                : 'Main owner information and quick account summary'}
            </Text>
          </View>

          <View style={styles.profileCard}>
            <View style={styles.profileTopRow}>
              <View style={styles.avatarSection}>
                <TouchableOpacity
                  style={styles.avatarWrap}
                  onPress={openPhotoOptions}
                  activeOpacity={isEditing ? 0.9 : 1}
                  disabled={!isEditing}
                >
                  {((isEditing ? draftProfile.profileImageUri : profileData.profileImageUri)) ? (
                    <Image
                      source={{
                        uri: isEditing
                          ? draftProfile.profileImageUri
                          : profileData.profileImageUri,
                      }}
                      style={styles.avatarCustom}
                      resizeMode="cover"
                    />
                    ) : (
                      <Image
                        source={DEFAULT_PROFILE_IMAGE}
                        style={styles.avatar}
                        resizeMode="contain"
                      />
                    )}
                </TouchableOpacity>

                {isEditing ? (
                  <TouchableOpacity
                    style={styles.avatarPlusButton}
                    onPress={openPhotoOptions}
                    activeOpacity={0.9}
                  >
                    <Text style={styles.avatarPlusText}>+</Text>
                  </TouchableOpacity>
                ) : null}
              </View>

              <View style={styles.profileTopContent}>
                <Text style={styles.profileName}>
                  {isEditing ? draftProfile.username : profileData.username}
                </Text>
              </View>
            </View>

            {isEditing ? (
              <View style={styles.formCard}>
                <Text style={styles.formLabel}>
                  First Name<Text style={styles.requiredMark}> *</Text>
                </Text>
                <TextInput
                  value={draftProfile.firstName}
                  onChangeText={(value) => updateDraftField('firstName', value)}
                  style={[styles.inputField, fieldErrors.firstName && styles.inputFieldError]}
                  placeholder="Enter first name"
                  placeholderTextColor="#87a0b1"
                />
                {fieldErrors.firstName ? <Text style={styles.fieldErrorText}>{fieldErrors.firstName}</Text> : null}

                <Text style={styles.formLabel}>Middle Name (Optional)</Text>
                <TextInput
                  value={draftProfile.middleName}
                  onChangeText={(value) => updateDraftField('middleName', value.replace(/[^A-Za-zÀ-ÖØ-öø-ÿ' -]/g, ''))}
                  style={styles.inputField}
                  placeholder="Enter middle name"
                  placeholderTextColor="#87a0b1"
                  maxLength={50}
                />

                <Text style={styles.formLabel}>
                  Last Name<Text style={styles.requiredMark}> *</Text>
                </Text>
                <TextInput
                  value={draftProfile.lastName}
                  onChangeText={(value) => updateDraftField('lastName', value)}
                  style={[styles.inputField, fieldErrors.lastName && styles.inputFieldError]}
                  placeholder="Enter last name"
                  placeholderTextColor="#87a0b1"
                />
                {fieldErrors.lastName ? <Text style={styles.fieldErrorText}>{fieldErrors.lastName}</Text> : null}

                <Text style={styles.formLabel}>
                  Username<Text style={styles.requiredMark}> *</Text>
                </Text>
                <TextInput
                  value={draftProfile.username}
                  editable={false}
                  style={[styles.inputField, styles.disabledInputField]}
                  placeholderTextColor="#9aaebd"
                />

                <Text style={styles.formLabel}>
                  Email<Text style={styles.requiredMark}> *</Text>
                </Text>
                <TextInput
                  value={draftProfile.email}
                  onChangeText={(value) => {
                    updateDraftField('email', value);
                    setSensitiveError('');
                  }}
                  style={styles.inputField}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  placeholderTextColor="#9aaebd"
                />

                <Text style={styles.formLabel}>New Password (Optional)</Text>
                <PasswordInput
                  value={draftProfile.newPassword}
                  onChangeText={(value) => {
                    updateDraftField('newPassword', value);
                    setSensitiveError('');
                  }}
                  placeholder="Enter new password"
                />

                <Text style={styles.formLabel}>Confirm New Password</Text>
                <PasswordInput
                  value={draftProfile.confirmPassword}
                  onChangeText={(value) => {
                    updateDraftField('confirmPassword', value);
                    setSensitiveError('');
                  }}
                  placeholder="Confirm new password"
                />
                <Text style={{ color: '#526d82', fontSize: 12, lineHeight: 18, marginBottom: 12 }}>
                  Use at least 8 characters with uppercase, lowercase, number, and special character.
                </Text>
                {(draftProfile.email.trim().toLowerCase() !== profileData.email.trim().toLowerCase() || draftProfile.newPassword) ? <>
                  <Text style={styles.formLabel}>Current Password<Text style={styles.requiredMark}> *</Text></Text>
                  <PasswordInput value={draftProfile.currentPassword} onChangeText={(value) => updateDraftField('currentPassword', value)} placeholder="Enter current password" />
                </> : null}
                {sensitiveError ? <Text style={{ color: '#dc2626', fontSize: 12, fontWeight: '700', marginBottom: 12 }}>{sensitiveError}</Text> : null}

                <Text style={styles.formLabel}>
                  Contact Number<Text style={styles.requiredMark}> *</Text>
                </Text>
                <TextInput
                  value={draftProfile.contact}
                  onChangeText={(value) =>
                    updateDraftField('contact', value.replace(/[^0-9+]/g, '').replace(/(?!^)\+/g, ''))
                  }
                  style={[styles.inputField, fieldErrors.contact && styles.inputFieldError]}
                  placeholder="09XXXXXXXXX or +639XXXXXXXXX"
                  placeholderTextColor="#87a0b1"
                  keyboardType="phone-pad"
                  maxLength={13}
                />
                {fieldErrors.contact ? <Text style={styles.fieldErrorText}>{fieldErrors.contact}</Text> : null}

                <Text style={styles.formLabel}>
                  Emergency Contact (Optional)
                </Text>
                <TextInput
                  value={draftProfile.emergencyContact}
                  onChangeText={(value) =>
                    updateDraftField(
                      'emergencyContact',
                      value.replace(/[^0-9]/g, '')
                    )
                  }
                  style={styles.inputField}
                  placeholder="Enter emergency contact"
                  placeholderTextColor="#87a0b1"
                  keyboardType="number-pad"
                  maxLength={11}
                />

                <Text style={styles.formLabel}>
                  Address<Text style={styles.requiredMark}> *</Text>
                </Text>
                <TextInput
                  value={draftProfile.address}
                  onChangeText={(value) => updateDraftField('address', value)}
                  style={[styles.inputField, fieldErrors.address && styles.inputFieldError]}
                  placeholder="Enter address"
                  placeholderTextColor="#87a0b1"
                />
                {fieldErrors.address ? <Text style={styles.fieldErrorText}>{fieldErrors.address}</Text> : null}
              </View>
            ) : (
              <View style={styles.infoGrid}>
                <View style={styles.infoItem}>
                  <Text style={styles.infoLabel}>Full Name</Text>
                  <Text style={styles.infoValue}>{profileData.fullName}</Text>
                </View>
                <View style={styles.infoItem}>
                  <Text style={styles.infoLabel}>Email</Text>
                  <Text style={styles.infoValue}>{profileData.email || 'No email found'}</Text>
                </View>
                <View style={styles.infoItem}>
                  <Text style={styles.infoLabel}>Contact Number</Text>
                  <Text style={styles.infoValue}>{profileData.contact}</Text>
                </View>
                <View style={styles.infoItem}>
                  <Text style={styles.infoLabel}>Emergency</Text>
                  <Text style={styles.infoValue}>{profileData.emergencyContact}</Text>
                </View>
              </View>
            )}
          </View>

          <View style={styles.sectionHeaderWrap}>
            <Text style={styles.sectionTitle}>Account Actions</Text>
            <Text style={styles.sectionSubtitle}>
              Update your account or safely sign out
            </Text>
          </View>

          <View style={styles.actionCard}>
            {isEditing ? (
              <>
                <TouchableOpacity
                  style={styles.editButton}
                  onPress={handleDonePress}
                  activeOpacity={0.9}
                >
                  <Text style={styles.editButtonText}>Done</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.cancelEditButton}
                  onPress={cancelEditMode}
                  activeOpacity={0.9}
                >
                  <Text style={styles.cancelEditButtonText}>Cancel</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <TouchableOpacity
                  style={styles.editButton}
                  onPress={openEditMode}
                  activeOpacity={0.9}
                >
                  <Text style={styles.editButtonText}>Edit Profile</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.logoutButton}
                  onPress={() => setShowLogoutModal(true)}
                  activeOpacity={0.9}
                >
                  <Text style={styles.logoutButtonText}>Logout</Text>
                </TouchableOpacity>
              </>
            )}
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

        <ProfileOtpModal visible={showOtpModal} purpose={otpPurpose} destinationEmail={otpPurpose === 'change_email' ? draftProfile.email : profileData.email} busy={otpLoading} error={otpError} onClearError={() => setOtpError('')} onVerify={verifyProfileOtp} onResend={sendProfileOtp} onCancel={() => { if (!otpLoading) { setShowOtpModal(false); setOtpError(''); } }} />

        <Modal
          transparent
          animationType="fade"
          visible={showRequiredFieldsModal}
          onRequestClose={() => setShowRequiredFieldsModal(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Required Fields</Text>
              <Text style={styles.modalMessage}>
                Please complete all required fields before saving your profile.
              </Text>
              <TouchableOpacity
                style={styles.modalPrimaryButtonFull}
                onPress={() => setShowRequiredFieldsModal(false)}
                activeOpacity={0.9}
              >
                <Text style={styles.modalPrimaryText}>OK</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        <Modal
          transparent
          animationType="fade"
          visible={showPhotoOptions}
          onRequestClose={() => setShowPhotoOptions(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.photoModalCard}>
              <Text style={styles.modalTitle}>Update Profile Photo</Text>
              <Text style={styles.modalMessage}>
                Choose how you want to add your profile picture.
              </Text>

              <TouchableOpacity
                style={styles.photoOptionButton}
                onPress={() => handlePhotoOptionPress(pickPhotoFromAlbum)}
                activeOpacity={0.9}
              >
                <Text style={styles.photoOptionText}>Choose from Album</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.photoOptionButton}
                onPress={() => handlePhotoOptionPress(pickPhotoFromFiles)}
                activeOpacity={0.9}
              >
                <Text style={styles.photoOptionText}>Choose from Files</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.photoOptionButton}
                onPress={() => handlePhotoOptionPress(takePhotoWithCamera)}
                activeOpacity={0.9}
              >
                <Text style={styles.photoOptionText}>Use Camera</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.photoOptionCancelButton}
                onPress={() => setShowPhotoOptions(false)}
                activeOpacity={0.9}
              >
                <Text style={styles.photoOptionCancelText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        <Modal
          transparent
          animationType="fade"
          visible={showSaveConfirm}
          onRequestClose={() => setShowSaveConfirm(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Save Profile</Text>
              <Text style={styles.modalMessage}>
                Are you sure you want to save these profile changes?
              </Text>
              <View style={styles.modalButtonRow}>
                <TouchableOpacity
                  style={styles.modalSecondaryButton}
                  onPress={() => setShowSaveConfirm(false)}
                  activeOpacity={0.9}
                >
                  <Text style={styles.modalSecondaryText}>No</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.modalPrimaryButton}
                  onPress={saveProfile}
                  activeOpacity={0.9}
                >
                  <Text style={styles.modalPrimaryText}>Yes</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        <CustomModal
          show={showLogoutModal}
          onClose={() => setShowLogoutModal(false)}
          extraAction={
            <>
              <TouchableOpacity
                style={styles.confirmBtn}
                onPress={() => {
                  setShowLogoutModal(false);
                  navigation.replace('login');
                }}
                activeOpacity={0.9}
              >
                <Text style={styles.confirmBtnText}>Logout</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setShowLogoutModal(false)}
                activeOpacity={0.9}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
            </>
          }
        >
          Are you sure you want to logout?
        </CustomModal>
      </SafeAreaView>
    </LinearGradient>
  );
};

export default PetOwnerProfile;
