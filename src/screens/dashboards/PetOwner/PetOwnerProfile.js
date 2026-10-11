import { SafeAreaView } from 'react-native-safe-area-context';
import PetOwnerBottomNav from './PetOwnerBottomNav';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Image, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { styles } from '../../styles/PetOwnerProfileDesign';
import CustomModal from '../../../components/CustomModal';
import ProfileOtpModal from '../../../components/ProfileOtpModal';
import {
  ChangePasswordForm,
  FieldError,
  FormLabel,
  FormTitle,
  ProfileButton,
  ProfileDetails,
  ProfileHero,
  ProfileIcon,
  ProfileNotice,
  ProfileTag,
  pfStyles,
  usePasswordChange,
  useProfilePhotoPicker,
} from '../../../components/ProfileParts';
import useScrollToError from '../../../hooks/useScrollToError';
import {
  EMAIL_TAKEN_ERROR,
  USERNAME_TAKEN_ERROR,
  cancelEmailChange,
  confirmEmailChange,
  getProfile,
  isEmailTaken,
  isUsernameTaken,
  requestEmailChange,
  subscribeProfile,
  updateProfile,
  updateProfileAvatar,
  uploadProfileAvatar,
  validateEmail,
  validateUsername,
} from '../../../api/profileService';
import { logoutAndResetToLogin } from '../../../api/authService';
import { isValidPhMobile, PH_MOBILE_FORMAT_ERROR } from '../../../utils/contactValidation';

const DEFAULT_PROFILE_IMAGE = require('../../assets/Profile.png');
const NO_MESSAGE = { type: '', text: '' };

const splitFullName = (fullName) => {
  const parts = String(fullName || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: '', middleName: '', lastName: '' };
  if (parts.length === 1) return { firstName: parts[0], middleName: '', lastName: '' };
  if (parts.length === 2) return { firstName: parts[0], middleName: '', lastName: parts[1] };
  return { firstName: parts[0], middleName: parts.slice(1, -1).join(' '), lastName: parts[parts.length - 1] };
};

const joinFullName = ({ firstName, middleName, lastName }) =>
  [firstName, middleName, lastName].map((part) => String(part || '').trim()).filter(Boolean).join(' ');

// The saved profile in one shape, whichever keys the logged-in user uses.
const profileFromUser = (user) => ({
  full_name: user?.full_name || user?.fullName || user?.name || '',
  username: user?.username || '',
  email: user?.email || user?.gmail || user?.accountEmail || user?.userEmail || '',
  phone: user?.phone || user?.contact || '',
  address: user?.address || '',
  avatar_url: user?.avatar_url || user?.profileImageUri || user?.avatar || '',
});

// Other Pet Owner screens read these older keys from the route's user.
const withAliases = (profile) => ({ ...profile, fullName: profile.full_name, contact: profile.phone, profileImageUri: profile.avatar_url });

const formFromProfile = (profile) => ({
  ...splitFullName(profile.full_name),
  username: profile.username,
  email: profile.email,
  phone: profile.phone,
  address: profile.address,
});

const normalized = (value) => String(value || '').trim().toLowerCase();

const validateDetails = (form) => {
  const errors = {};
  if (!form.firstName.trim()) errors.firstName = 'First name is required.';
  if (!form.lastName.trim()) errors.lastName = 'Last name is required.';
  const usernameError = validateUsername(form.username);
  if (usernameError) errors.username = usernameError;
  const emailError = validateEmail(form.email);
  if (emailError) errors.email = emailError;
  if (!form.phone.trim()) errors.phone = 'Contact number is required.';
  else if (!isValidPhMobile(form.phone)) errors.phone = PH_MOBILE_FORMAT_ERROR;
  if (!String(form.address || '').trim()) errors.address = 'Address is required.';
  return errors;
};

const NO_EMAIL_CHANGE = { visible: false, challengeId: '', email: '', username: null, details: null, busy: false, error: '' };

const PetOwnerProfile = ({ navigation, route }) => {
  const loggedInUser = route?.params?.user;
  const profileId = loggedInUser?.id;
  const scrollViewRef = useRef(null);
  // A failed save scrolls back to the first field outlined in red.
  const errorScroll = useScrollToError(scrollViewRef);
  const FIELD_ORDER = ['firstName', 'lastName', 'middleName', 'username', 'email', 'phone', 'address'];

  // `profile` is what the page shows; `form` is only the draft while editing.
  const [profile, setProfile] = useState(() => profileFromUser(loggedInUser));
  const [mode, setMode] = useState('view'); // 'view' | 'edit' | 'password'
  const [form, setForm] = useState(() => formFromProfile(profileFromUser(loggedInUser)));
  const [fieldErrors, setFieldErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(NO_MESSAGE);
  const [photoDraft, setPhotoDraft] = useState('');
  const [uploading, setUploading] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  // A pending email change waiting for the OTP sent to the current email.
  const [emailChange, setEmailChange] = useState(NO_EMAIL_CHANGE);

  const currentUser = { ...(loggedInUser || {}), ...withAliases(profile) };

  const apply = useCallback((row) => {
    if (!row) return;
    const next = profileFromUser(row);
    setProfile(next);
    navigation.setParams({ user: { ...(loggedInUser || {}), ...row, ...withAliases(next) } });
  }, [navigation, loggedInUser]);

  useEffect(() => {
    setProfile(profileFromUser(loggedInUser));
  }, [loggedInUser]);

  useEffect(() => {
    if (!profileId) return undefined;
    let active = true;
    getProfile(profileId).then((row) => active && apply(row)).catch((error) => {
      console.warn('Unable to sync Pet Owner profile:', error?.message || error);
    });
    const unsubscribe = subscribeProfile(profileId, (row) => active && apply(row));
    return () => { active = false; unsubscribe?.(); };
  }, [profileId]);

  useEffect(() => {
    if (message.type !== 'success') return undefined;
    const timer = setTimeout(() => setMessage(NO_MESSAGE), 6000);
    return () => clearTimeout(timer);
  }, [message]);

  const changeMode = (next) => {
    setMode(next);
    scrollViewRef.current?.scrollTo({ y: 0, animated: true });
  };

  const passwordChange = usePasswordChange(profileId, { setMessage, onChanged: () => changeMode('view'), onCancelled: () => changeMode('view'), errorScroll });

  const openMode = (next) => {
    setMessage(NO_MESSAGE);
    setFieldErrors({});
    setForm(formFromProfile(profile));
    passwordChange.reset();
    changeMode(next);
  };

  const updateField = (name, value) => {
    setForm((current) => ({ ...current, [name]: value }));
    setFieldErrors((current) => (current[name] ? { ...current, [name]: undefined } : current));
  };

  const detailsPayload = (username) => ({
    full_name: joinFullName(form),
    username,
    phone: form.phone,
    address: form.address,
    avatar_url: profile.avatar_url || null,
  });

  // Username saves directly. An email change waits for the OTP sent to the
  // CURRENT email, and then everything in the form is saved together, so a
  // cancelled or failed code saves nothing.
  const saveDetails = async () => {
    const errors = validateDetails(form);
    setFieldErrors(errors);
    if (Object.keys(errors).length) {
      errorScroll.scrollToFirstError(errors, FIELD_ORDER);
      setMessage({ type: 'error', text: 'Please fix the highlighted fields before saving.' });
      return;
    }
    const username = normalized(form.username);
    const email = normalized(form.email);
    const usernameChanged = username !== normalized(profile.username);
    const emailChanged = email !== normalized(profile.email);

    setSaving(true);
    setMessage(NO_MESSAGE);
    try {
      const taken = {};
      if (usernameChanged && await isUsernameTaken(username, profileId)) taken.username = USERNAME_TAKEN_ERROR;
      if (emailChanged && await isEmailTaken(email, profileId)) taken.email = EMAIL_TAKEN_ERROR;
      if (Object.keys(taken).length) {
        setFieldErrors(taken);
        errorScroll.scrollToFirstError(taken, FIELD_ORDER);
        setMessage({ type: 'error', text: taken.username || taken.email });
        return;
      }

      if (emailChanged) {
        const { challengeId } = await requestEmailChange(profileId, email, usernameChanged ? username : undefined);
        setEmailChange({ ...NO_EMAIL_CHANGE, visible: true, challengeId, email, username: usernameChanged ? username : null, details: detailsPayload(username) });
        return;
      }

      const updated = await updateProfile(profileId, detailsPayload(username));
      apply(updated);
      changeMode('view');
      setMessage({ type: 'success', text: usernameChanged ? 'Username updated successfully.' : 'Profile updated successfully.' });
    } catch (error) {
      setMessage({ type: 'error', text: error?.message || 'Unable to save your profile.' });
    } finally {
      setSaving(false);
    }
  };

  const verifyEmailChange = async (code) => {
    if (emailChange.busy) return;
    setEmailChange((current) => ({ ...current, busy: true, error: '' }));
    try {
      // The server checks the code and saves the new email (and username).
      let updated = await confirmEmailChange(emailChange.challengeId, code);
      apply(updated);
      let text = emailChange.username ? 'Email address and username updated successfully.' : 'Email address updated successfully.';
      let type = 'success';
      try {
        updated = await updateProfile(profileId, { ...emailChange.details, username: updated.username });
        apply(updated);
      } catch (error) {
        type = 'error';
        text = `${text} Your other changes were not saved: ${error?.message || 'please try again.'}`;
      }
      setEmailChange(NO_EMAIL_CHANGE);
      changeMode('view');
      setMessage({ type, text });
    } catch (error) {
      setEmailChange((current) => ({ ...current, busy: false, error: error?.message || 'Invalid verification code.' }));
    }
  };

  const resendEmailChange = async () => {
    try {
      const { challengeId } = await requestEmailChange(profileId, emailChange.email, emailChange.username || undefined);
      setEmailChange((current) => ({ ...current, challengeId, error: '' }));
      return true;
    } catch (error) {
      setEmailChange((current) => ({ ...current, error: error?.message || 'Unable to send a new code.' }));
      return false;
    }
  };

  // Nothing was saved; the email field goes back to the registered email.
  const cancelEmailChangeFlow = () => {
    cancelEmailChange(emailChange.challengeId);
    setEmailChange(NO_EMAIL_CHANGE);
    updateField('email', profile.email);
    setMessage({ type: 'error', text: 'Email change cancelled. Your email address was not changed.' });
  };

  const { openPhotoOptions, photoOptionsModal } = useProfilePhotoPicker((uri) => {
    setMessage(NO_MESSAGE);
    setPhotoDraft(uri);
  });

  const savePhoto = async () => {
    if (!photoDraft) return;
    setUploading(true);
    setMessage(NO_MESSAGE);
    try {
      const avatarUrl = await uploadProfileAvatar(profileId, photoDraft);
      apply(await updateProfileAvatar(profileId, avatarUrl));
      setPhotoDraft('');
      setMessage({ type: 'success', text: 'Profile photo updated.' });
    } catch (error) {
      setMessage({ type: 'error', text: error?.message || 'Unable to update your photo.' });
    } finally {
      setUploading(false);
    }
  };

  const detailRows = [
    { icon: 'user', label: 'Full name', value: profile.full_name },
    { icon: 'at', label: 'Username', value: profile.username ? `@${profile.username}` : '' },
    { icon: 'mail', label: 'Email', value: profile.email },
    { icon: 'phone', label: 'Contact number', value: profile.phone },
    { icon: 'pin', label: 'Address', value: profile.address },
  ];

  // Called as a function, not rendered as a component, so the input keeps
  // focus while typing.
  const textField = (name, label, { required, optional, multiline, transform, ...inputProps } = {}) => (
    <View key={name} ref={errorScroll.anchor(name)}>
      <FormLabel label={label} required={required} optional={optional} />
      <TextInput
        value={form[name]}
        onChangeText={(value) => updateField(name, transform ? transform(value) : value)}
        style={[styles.inputField, multiline && pfStyles.textArea, fieldErrors[name] && styles.inputFieldError]}
        placeholderTextColor="#87a0b1"
        multiline={multiline}
        {...inputProps}
      />
      <FieldError text={fieldErrors[name]} />
    </View>
  );

  return (
    <LinearGradient colors={['#f7fbfc', '#eef7f8', '#ffffff']} style={styles.background}>
      <SafeAreaView style={styles.container}>
        <LinearGradient colors={['#3a7ab8', '#3a7ab8', '#3a7ab8']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.headerBar, styles.headerBarCompact]}>
          <LinearGradient colors={['#1e5a8c', '#256297', '#2c6ba3', '#3a7ab8']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.headerTopBand, styles.headerTopBandCompact]}>
            <View style={styles.headerTopRow}>
              <TouchableOpacity style={styles.brandSection} onPress={() => navigation.navigate('petowner-screen', { user: currentUser })} activeOpacity={0.85}>
                <View style={styles.logoWrap}>
                  <Image source={require('../../assets/paw1.png')} style={styles.headerLogo} resizeMode="contain" />
                </View>
                <View style={styles.brandBlock}>
                  <Text style={styles.headerTitle}>PawCruz</Text>
                  <Text style={styles.headerSubtitle}>Profile</Text>
                </View>
              </TouchableOpacity>

              <View style={styles.headerActions}>
                <TouchableOpacity style={styles.notifButton} onPress={() => navigation.navigate('PetOwnerNotif', { user: currentUser })} activeOpacity={0.85}>
                  <View style={styles.notifBadge} />
                  <Image source={require('../../assets/Bell_Icon.png')} style={styles.notifIcon} resizeMode="contain" />
                </TouchableOpacity>

                <TouchableOpacity style={styles.profileButton} onPress={() => navigation.navigate('PetOwnerProfile', { user: currentUser })} activeOpacity={0.85}>
                  <Image source={DEFAULT_PROFILE_IMAGE} style={styles.profileIcon} resizeMode="contain" />
                </TouchableOpacity>
              </View>
            </View>
          </LinearGradient>
        </LinearGradient>

        <ScrollView ref={scrollViewRef} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scrollContent}>
          {mode === 'view' ? <ProfileNotice message={message} /> : null}

          <View style={pfStyles.card}>
            <ProfileHero photoUri={photoDraft || profile.avatar_url} onPickPhoto={uploading ? undefined : openPhotoOptions} name={profile.full_name || profile.username} handle={profile.username}>
              <View style={pfStyles.tags}>
                <ProfileTag label="Pet Owner" />
              </View>
              {photoDraft ? (
                <View style={pfStyles.actions}>
                  <ProfileButton label={uploading ? 'Saving…' : 'Save photo'} onPress={savePhoto} disabled={uploading} />
                  <ProfileButton label="Cancel" ghost onPress={() => setPhotoDraft('')} disabled={uploading} />
                </View>
              ) : null}
              {mode === 'view' ? (
                <View style={pfStyles.actions}>
                  <ProfileButton icon="pencil" label="Edit profile" onPress={() => openMode('edit')} />
                  <ProfileButton icon="key" label="Change password" ghost onPress={() => openMode('password')} />
                </View>
              ) : null}
            </ProfileHero>

            <View style={pfStyles.body}>
              {mode === 'view' ? (
                <ProfileDetails rows={detailRows} />
              ) : mode === 'edit' ? (
                <>
                  <FormTitle icon="pencil" title="Edit profile" />
                  {textField('firstName', 'First name', { required: true, placeholder: 'Enter first name' })}
                  {textField('lastName', 'Last name', { required: true, placeholder: 'Enter last name' })}
                  {textField('middleName', 'Middle name', {
                    optional: true,
                    placeholder: 'Enter middle name',
                    maxLength: 50,
                    transform: (value) => value.replace(/[^A-Za-zÀ-ÖØ-öø-ÿ.' -]/g, ''),
                  })}
                  {textField('username', 'Username', {
                    required: true,
                    placeholder: 'Enter username',
                    autoCapitalize: 'none',
                    autoCorrect: false,
                    maxLength: 30,
                  })}
                  {textField('email', 'Email', {
                    required: true,
                    placeholder: 'Enter email address',
                    keyboardType: 'email-address',
                    autoCapitalize: 'none',
                    autoCorrect: false,
                  })}
                  {textField('phone', 'Contact number', {
                    required: true,
                    placeholder: '09XXXXXXXXX or +639XXXXXXXXX',
                    keyboardType: 'phone-pad',
                    maxLength: 13,
                    transform: (value) => value.replace(/[^0-9+]/g, '').replace(/(?!^)\+/g, ''),
                  })}
                  {textField('address', 'Address', { required: true, multiline: true, placeholder: 'Enter address' })}
                  <Text style={pfStyles.hint}>Changing your email sends a 6-digit code to your current email. It changes only after you enter the code.</Text>
                  <View style={pfStyles.formActions}>
                    <ProfileButton icon="x" label="Cancel" ghost onPress={() => openMode('view')} disabled={saving} />
                    <ProfileButton icon="check" label={saving ? 'Saving…' : 'Save changes'} onPress={saveDetails} disabled={saving} />
                  </View>
                </>
              ) : (
                <ChangePasswordForm change={passwordChange} onCancel={() => openMode('view')} />
              )}
              {mode !== 'view' ? <View style={pfStyles.formNotice}><ProfileNotice message={message} /></View> : null}
            </View>
          </View>

          {mode === 'view' ? (
            <TouchableOpacity style={pfStyles.logout} onPress={() => setShowLogoutModal(true)} activeOpacity={0.9}>
              <ProfileIcon name="logout" size={18} color="#c24a4a" />
              <Text style={pfStyles.logoutText}>Logout</Text>
            </TouchableOpacity>
          ) : null}
        </ScrollView>

        <ProfileOtpModal {...passwordChange.otpModalProps} destinationEmail={profile.email} />
        <ProfileOtpModal
          visible={emailChange.visible}
          purpose="change_email"
          destinationEmail={profile.email}
          busy={emailChange.busy}
          error={emailChange.error}
          autoVerify
          onVerify={verifyEmailChange}
          onResend={resendEmailChange}
          onCancel={cancelEmailChangeFlow}
          onClearError={() => setEmailChange((current) => (current.error ? { ...current, error: '' } : current))}
        />

        {photoOptionsModal}

        <CustomModal
          show={showLogoutModal}
          onClose={() => setShowLogoutModal(false)}
          extraAction={
            <>
              <TouchableOpacity
                style={styles.confirmBtn}
                onPress={() => {
                  setShowLogoutModal(false);
                  logoutAndResetToLogin(navigation);
                }}
                activeOpacity={0.9}
              >
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
        <PetOwnerBottomNav navigation={navigation} user={currentUser} />
      </SafeAreaView>
    </LinearGradient>
  );
};

export default PetOwnerProfile;
