import React, { useEffect, useState } from 'react';
import { ActionSheetIOS, Alert, Image, Modal, Platform, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import CustomModal from '../../../components/CustomModal';
import ProfileOtpModal from '../../../components/ProfileOtpModal';
import VetShell, { getVetUser } from './VetShell';
import { useLowerHeaderMotion } from './useLowerHeaderMotion';
import { confirmEmailChangeOtp, confirmPasswordChangeOtp, getProfile, requestEmailChangeOtp, requestPasswordChangeOtp, subscribeProfile, updateProfile, uploadProfileAvatar } from '../../../api/profileService';
import { validatePickedImageAsset } from '../../../utils/imageValidation';
import { isValidPhMobile, PH_MOBILE_FORMAT_ERROR } from '../../../utils/contactValidation';
import { isValidPrcLicense, INVALID_PRC_LICENSE_MESSAGE } from '../../../utils/prcValidation';
import { getVerification, subscribeToVerification, submitVerification } from '../../../api/vetVerificationService';
import { styles } from '../../styles/PetOwnerProfileDesign';

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

const buildDraftFromRow = (row) => {
  const resolvedName = row?.full_name || '';
  const { firstName, middleName, lastName } = splitFullName(resolvedName);

  return {
    full_name: resolvedName,
    firstName,
    middleName,
    lastName,
    username: row?.username || '',
    email: row?.email || '',
    phone: row?.phone || '',
    address: row?.address || '',
    licenseNumber: row?.license_number || '',
    avatar_url: row?.avatar_url || '',
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  };
};

const VetProfile = ({ navigation, route }) => {
  const routeUser = getVetUser(route);
  const profileId = routeUser?.id || routeUser?.user_id || routeUser?.profile_id || null;
  const { scrollViewRef, lowerHeaderAnimation, handleScroll } = useLowerHeaderMotion();

  const [profileData, setProfileData] = useState(buildDraftFromRow(routeUser));
  const [draftProfile, setDraftProfile] = useState(profileData);
  const [isEditing, setIsEditing] = useState(false);
  const [showSaveConfirm, setShowSaveConfirm] = useState(false);
  const [showPhotoOptions, setShowPhotoOptions] = useState(false);
  const [showRequiredFieldsModal, setShowRequiredFieldsModal] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [showOtpModal, setShowOtpModal] = useState(false);
  const [otpError, setOtpError] = useState('');
  const [otpLoading, setOtpLoading] = useState(false);
  const [otpPurpose, setOtpPurpose] = useState('');
  const [pendingNewPassword, setPendingNewPassword] = useState('');
  const [sensitiveError, setSensitiveError] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [showLogoutModal, setShowLogoutModal] = useState(false);

  const [verification, setVerification] = useState(null);
  const [showVerifyModal, setShowVerifyModal] = useState(false);
  const [verifyLicenseNumber, setVerifyLicenseNumber] = useState('');
  const [verifySubmitting, setVerifySubmitting] = useState(false);
  const [verifyError, setVerifyError] = useState('');

  const apply = React.useCallback((row) => {
    if (!row) return;
    const next = buildDraftFromRow(row);
    setProfileData(next);
    setDraftProfile(next);
    navigation.setParams({ user: { ...(routeUser || {}), ...row } });
  }, [navigation, routeUser]);

  useEffect(() => {
    if (!profileId) return undefined;
    let active = true;
    getProfile(profileId).then((row) => active && apply(row)).catch((error) => setSensitiveError(error.message));
    const unsubscribe = subscribeProfile(profileId, (row) => active && apply(row));
    return () => { active = false; unsubscribe?.(); };
  }, [profileId]);

  useEffect(() => {
    if (!profileId) return undefined;
    let active = true;
    getVerification(profileId).then((row) => active && setVerification(row)).catch((error) => console.warn('Unable to load verification status:', error?.message || error));
    const unsubscribe = subscribeToVerification(profileId, (row) => active && setVerification(row));
    return () => { active = false; unsubscribe?.(); };
  }, [profileId]);

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
    if (!profile?.phone?.trim()) nextErrors.phone = 'Contact number is required.';
    else if (!isValidPhMobile(profile.phone)) nextErrors.phone = PH_MOBILE_FORMAT_ERROR;
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

  const saveProfile = async () => {
    const middleName = String(draftProfile.middleName || '').trim();
    const fullName = [draftProfile.firstName.trim(), middleName, draftProfile.lastName.trim()].filter(Boolean).join(' ');

    try {
      let avatarUrl = profileData.avatar_url || null;
      if (draftProfile.avatar_url && draftProfile.avatar_url !== profileData.avatar_url) {
        avatarUrl = await uploadProfileAvatar(profileId, draftProfile.avatar_url);
      }

      const updated = await updateProfile(profileId, {
        full_name: fullName,
        username: draftProfile.username,
        phone: draftProfile.phone,
        address: draftProfile.address,
        avatar_url: avatarUrl,
      });

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
      apply(updated);
      setIsEditing(false);
      setStatusMessage('Your profile changes were saved successfully.');
    } catch (error) {
      setShowSaveConfirm(false);
      setSensitiveError(error?.message || 'Unable to save profile.');
    }
  };

  const verifyProfileOtp = async (code) => {
    try {
      setOtpLoading(true);
      setOtpError('');
      let result;
      if (otpPurpose === 'change_email') result = await confirmEmailChangeOtp(profileId, code);
      else result = await confirmPasswordChangeOtp(profileId, code, pendingNewPassword);
      setShowOtpModal(false);
      const refreshed = result?.profile || await getProfile(profileId);
      apply(refreshed);
      setIsEditing(false);
      setStatusMessage(otpPurpose === 'change_email' ? 'Your new email address was verified and saved successfully.' : 'Your password was changed successfully.');
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
      if (otpPurpose === 'change_email') await requestEmailChangeOtp(profileId, draftProfile.currentPassword, draftProfile.email);
      else await requestPasswordChangeOtp(profileId, draftProfile.currentPassword);
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
      if (!permission.granted) return;
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, quality: 0.85 });
      if (result.canceled || !result.assets?.length) return;
      const validationError = validatePickedImageAsset(result.assets[0]);
      if (validationError) {
        Alert.alert('Invalid Photo', validationError);
        return;
      }
      updateDraftField('avatar_url', result.assets[0].uri);
    } catch (error) {
      console.warn('Failed to open album picker for profile photo:', error);
    }
  };

  const pickPhotoFromFiles = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: ['image/*'], copyToCacheDirectory: true, multiple: false });
      if (result.canceled || !result.assets?.length) return;
      const validationError = validatePickedImageAsset(result.assets[0]);
      if (validationError) {
        Alert.alert('Invalid Photo', validationError);
        return;
      }
      updateDraftField('avatar_url', result.assets[0].uri);
    } catch (error) {
      console.warn('Failed to open file picker for profile photo:', error);
    }
  };

  const takePhotoWithCamera = async () => {
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) return;
      const result = await ImagePicker.launchCameraAsync({ allowsEditing: true, quality: 0.85 });
      if (result.canceled || !result.assets?.length) return;
      const validationError = validatePickedImageAsset(result.assets[0]);
      if (validationError) {
        Alert.alert('Invalid Photo', validationError);
        return;
      }
      updateDraftField('avatar_url', result.assets[0].uri);
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
    if (!isEditing) return;

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ['Cancel', 'Choose from Album', 'Choose from Files', 'Use Camera'],
          cancelButtonIndex: 0,
          userInterfaceStyle: 'light',
        },
        (buttonIndex) => {
          if (buttonIndex === 1) pickPhotoFromAlbum();
          else if (buttonIndex === 2) pickPhotoFromFiles();
          else if (buttonIndex === 3) takePhotoWithCamera();
        }
      );
      return;
    }

    setShowPhotoOptions(true);
  };

  const verificationStatus = verification?.status || 'Unverified';
  const canSubmitVerification = ['Unverified', 'Rejected', 'Needs Resubmission'].includes(verificationStatus);

  const openVerifyModal = () => {
    setVerifyLicenseNumber('');
    setVerifyError('');
    setShowVerifyModal(true);
  };

  const closeVerifyModal = () => {
    if (verifySubmitting) return;
    setShowVerifyModal(false);
  };

  const handleSubmitVerification = async () => {
    if (!verifyLicenseNumber.trim()) {
      setVerifyError('Enter your PRC license number.');
      return;
    }
    if (!isValidPrcLicense(verifyLicenseNumber)) {
      setVerifyError(INVALID_PRC_LICENSE_MESSAGE);
      return;
    }
    setVerifyError('');
    setVerifySubmitting(true);
    try {
      const updated = await submitVerification(profileId, verifyLicenseNumber);
      setVerification(updated);
      setShowVerifyModal(false);
      setStatusMessage('Your PRC license number was submitted. An administrator will confirm it shortly.');
    } catch (error) {
      setVerifyError(error?.message || 'Unable to submit your verification.');
    } finally {
      setVerifySubmitting(false);
    }
  };

  const avatarUri = isEditing ? draftProfile.avatar_url : profileData.avatar_url;

  return (
    <VetShell navigation={navigation} route={route} subtitle="Veterinary Profile" caption="Account Settings" lowerHeaderAnimation={lowerHeaderAnimation}>
      <ScrollView ref={scrollViewRef} onScroll={handleScroll} scrollEventThrottle={16} showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <View style={styles.sectionHeaderWrap}>
          <Text style={styles.sectionTitle}>{isEditing ? 'Edit Profile' : 'Profile Overview'}</Text>
          <Text style={styles.sectionSubtitle}>
            {isEditing ? 'Update your profile details just like the pet owner edit flow' : 'Main veterinarian information and quick account summary'}
          </Text>
        </View>

        <View style={styles.profileCard}>
          <View style={styles.profileTopRow}>
            <View style={styles.avatarSection}>
              <TouchableOpacity style={styles.avatarWrap} onPress={openPhotoOptions} activeOpacity={isEditing ? 0.9 : 1} disabled={!isEditing}>
                {avatarUri ? (
                  <Image source={{ uri: avatarUri }} style={styles.avatarCustom} resizeMode="cover" />
                ) : (
                  <Image source={DEFAULT_PROFILE_IMAGE} style={styles.avatar} resizeMode="contain" />
                )}
              </TouchableOpacity>

              {isEditing ? (
                <TouchableOpacity style={styles.avatarPlusButton} onPress={openPhotoOptions} activeOpacity={0.9}>
                  <Text style={styles.avatarPlusText}>+</Text>
                </TouchableOpacity>
              ) : null}
            </View>

            <View style={styles.profileTopContent}>
              <View style={styles.profileTag}>
                <Text style={styles.profileTagText}>Veterinarian</Text>
              </View>
              <Text style={styles.profileName}>
                {isEditing ? draftProfile.username : profileData.username}
              </Text>
            </View>
          </View>

          {statusMessage ? <Text style={{ color: '#245f8e', fontSize: 12, fontWeight: '700', marginBottom: 12 }}>{statusMessage}</Text> : null}

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
                onChangeText={(value) => updateDraftField('username', value.toLowerCase())}
                style={styles.inputField}
                placeholder="Enter username"
                placeholderTextColor="#87a0b1"
                autoCapitalize="none"
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
                value={draftProfile.phone}
                onChangeText={(value) =>
                  updateDraftField('phone', value.replace(/[^0-9+]/g, '').replace(/(?!^)\+/g, ''))
                }
                style={[styles.inputField, fieldErrors.phone && styles.inputFieldError]}
                placeholder="09XXXXXXXXX or +639XXXXXXXXX"
                placeholderTextColor="#87a0b1"
                keyboardType="phone-pad"
                maxLength={13}
              />
              {fieldErrors.phone ? <Text style={styles.fieldErrorText}>{fieldErrors.phone}</Text> : null}

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
                <Text style={styles.infoValue}>{profileData.full_name}</Text>
              </View>
              <View style={styles.infoItem}>
                <Text style={styles.infoLabel}>Email</Text>
                <Text style={styles.infoValue}>{profileData.email || 'No email found'}</Text>
              </View>
              <View style={styles.infoItem}>
                <Text style={styles.infoLabel}>Contact Number</Text>
                <Text style={styles.infoValue}>{profileData.phone || 'Not provided'}</Text>
              </View>
              <View style={styles.infoItem}>
                <Text style={styles.infoLabel}>Address</Text>
                <Text style={styles.infoValue}>{profileData.address || 'Not provided'}</Text>
              </View>
              {verificationStatus === 'Verified' && profileData.licenseNumber ? (
                <View style={styles.infoItem}>
                  <Text style={styles.infoLabel}>Veterinary License Number</Text>
                  <Text style={styles.infoValue}>{profileData.licenseNumber}</Text>
                </View>
              ) : null}
            </View>
          )}
        </View>

        <View style={styles.sectionHeaderWrap}>
          <Text style={styles.sectionTitle}>License Verification</Text>
          <Text style={styles.sectionSubtitle}>PRC license number review status</Text>
        </View>

        <View style={styles.profileCard}>
          <View style={styles.verificationTopRow}>
            <Text style={styles.profileName}>
              {verificationStatus === 'Verified' ? 'Verified Veterinarian'
                : verificationStatus === 'Pending Review' ? 'Under Review'
                  : verificationStatus === 'Rejected' ? 'Verification Rejected'
                    : verificationStatus === 'Needs Resubmission' ? 'Resubmission Needed'
                      : 'Not Verified Yet'}
            </Text>
            <View style={[
              styles.verificationBadge,
              verificationStatus === 'Verified' && styles.verificationBadgeVerified,
              (verificationStatus === 'Pending Review' || verificationStatus === 'Needs Resubmission') && styles.verificationBadgePending,
              verificationStatus === 'Rejected' && styles.verificationBadgeRejected,
              verificationStatus === 'Unverified' && styles.verificationBadgeUnverified,
            ]}>
              <Text style={[
                styles.verificationBadgeText,
                verificationStatus === 'Verified' && styles.verificationBadgeTextVerified,
                (verificationStatus === 'Pending Review' || verificationStatus === 'Needs Resubmission') && styles.verificationBadgeTextPending,
                verificationStatus === 'Rejected' && styles.verificationBadgeTextRejected,
                verificationStatus === 'Unverified' && styles.verificationBadgeTextUnverified,
              ]}>
                {verificationStatus}
              </Text>
            </View>
          </View>

          {(verificationStatus === 'Rejected' || verificationStatus === 'Needs Resubmission') && verification?.rejection_reason ? (
            <View style={styles.verificationRejectionBox}>
              <Text style={styles.verificationRejectionTitle}>Administrator Note</Text>
              <Text style={styles.verificationRejectionText}>{verification.rejection_reason}</Text>
            </View>
          ) : null}

          <Text style={styles.verificationHint}>
            {verificationStatus === 'Verified'
              ? 'Your PRC license number was confirmed by an administrator.'
              : verificationStatus === 'Pending Review'
                ? 'Your PRC license number was submitted and is waiting for administrator review.'
                : verificationStatus === 'Rejected'
                  ? 'Your submission was rejected. Review the note above and submit again.'
                  : verificationStatus === 'Needs Resubmission'
                    ? 'Double-check your PRC license number and submit again.'
                    : 'Enter your PRC (Professional Regulation Commission) license number. An administrator will confirm it before your account shows as Verified.'}
          </Text>

          {canSubmitVerification ? (
            <TouchableOpacity style={styles.editButton} onPress={openVerifyModal} activeOpacity={0.9}>
              <Text style={styles.editButtonText}>
                {verificationStatus === 'Unverified' ? 'Verify Your License' : 'Resubmit License Number'}
              </Text>
            </TouchableOpacity>
          ) : null}
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
              <TouchableOpacity style={styles.editButton} onPress={handleDonePress} activeOpacity={0.9}>
                <Text style={styles.editButtonText}>Done</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.cancelEditButton} onPress={cancelEditMode} activeOpacity={0.9}>
                <Text style={styles.cancelEditButtonText}>Cancel</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <TouchableOpacity style={styles.editButton} onPress={openEditMode} activeOpacity={0.9}>
                <Text style={styles.editButtonText}>Edit Profile</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.logoutButton} onPress={() => setShowLogoutModal(true)} activeOpacity={0.9}>
                <Text style={styles.logoutButtonText}>Logout</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </ScrollView>

      <ProfileOtpModal visible={showOtpModal} purpose={otpPurpose} destinationEmail={otpPurpose === 'change_email' ? draftProfile.email : profileData.email} busy={otpLoading} error={otpError} onClearError={() => setOtpError('')} onVerify={verifyProfileOtp} onResend={sendProfileOtp} onCancel={() => { if (!otpLoading) { setShowOtpModal(false); setOtpError(''); } }} />

      <Modal transparent animationType="fade" visible={showRequiredFieldsModal} onRequestClose={() => setShowRequiredFieldsModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Required Fields</Text>
            <Text style={styles.modalMessage}>
              Please complete all required fields before saving your profile.
            </Text>
            <TouchableOpacity style={styles.modalPrimaryButtonFull} onPress={() => setShowRequiredFieldsModal(false)} activeOpacity={0.9}>
              <Text style={styles.modalPrimaryText}>OK</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal transparent animationType="fade" visible={showPhotoOptions} onRequestClose={() => setShowPhotoOptions(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.photoModalCard}>
            <Text style={styles.modalTitle}>Update Profile Photo</Text>
            <Text style={styles.modalMessage}>
              Choose how you want to add your profile picture.
            </Text>

            <TouchableOpacity style={styles.photoOptionButton} onPress={() => handlePhotoOptionPress(pickPhotoFromAlbum)} activeOpacity={0.9}>
              <Text style={styles.photoOptionText}>Choose from Album</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.photoOptionButton} onPress={() => handlePhotoOptionPress(pickPhotoFromFiles)} activeOpacity={0.9}>
              <Text style={styles.photoOptionText}>Choose from Files</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.photoOptionButton} onPress={() => handlePhotoOptionPress(takePhotoWithCamera)} activeOpacity={0.9}>
              <Text style={styles.photoOptionText}>Use Camera</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.photoOptionCancelButton} onPress={() => setShowPhotoOptions(false)} activeOpacity={0.9}>
              <Text style={styles.photoOptionCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal transparent animationType="fade" visible={showSaveConfirm} onRequestClose={() => setShowSaveConfirm(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Save Profile</Text>
            <Text style={styles.modalMessage}>
              Are you sure you want to save these profile changes?
            </Text>
            <View style={styles.modalButtonRow}>
              <TouchableOpacity style={styles.modalSecondaryButton} onPress={() => setShowSaveConfirm(false)} activeOpacity={0.9}>
                <Text style={styles.modalSecondaryText}>No</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalPrimaryButton} onPress={saveProfile} activeOpacity={0.9}>
                <Text style={styles.modalPrimaryText}>Yes</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal transparent animationType="fade" visible={showVerifyModal} onRequestClose={closeVerifyModal}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Verify Your License</Text>
            <Text style={styles.modalMessage}>
              Enter your PRC (Professional Regulation Commission) license number. An administrator will confirm it before your account shows as Verified.
            </Text>

            <Text style={styles.formLabel}>
              PRC License Number<Text style={styles.requiredMark}> *</Text>
            </Text>
            <TextInput
              value={verifyLicenseNumber}
              onChangeText={(value) => {
                setVerifyLicenseNumber(value);
                if (verifyError) setVerifyError('');
              }}
              style={[styles.inputField, verifyError && styles.inputFieldError]}
              placeholder="e.g. 0123456"
              placeholderTextColor="#87a0b1"
              autoCapitalize="characters"
              autoCorrect={false}
            />

            {verifyError ? <Text style={styles.fieldErrorText}>{verifyError}</Text> : null}

            <View style={styles.modalButtonRow}>
              <TouchableOpacity style={styles.modalSecondaryButton} onPress={closeVerifyModal} activeOpacity={0.9} disabled={verifySubmitting}>
                <Text style={styles.modalSecondaryText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalPrimaryButton} onPress={handleSubmitVerification} activeOpacity={0.9} disabled={verifySubmitting}>
                <Text style={styles.modalPrimaryText}>{verifySubmitting ? 'Submitting...' : 'Submit'}</Text>
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
            <TouchableOpacity style={styles.confirmBtn} onPress={() => { setShowLogoutModal(false); navigation.replace('login'); }} activeOpacity={0.9}>
              <Text style={styles.confirmBtnText}>Logout</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowLogoutModal(false)} activeOpacity={0.9}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
          </>
        }
      >
        Are you sure you want to logout?
      </CustomModal>
    </VetShell>
  );
};

export default VetProfile;
