import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Modal, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
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
  ProfileSubheading,
  ProfileTag,
  pfStyles,
  usePasswordChange,
  useProfilePhotoPicker,
} from '../../../components/ProfileParts';
import useScrollToError from '../../../hooks/useScrollToError';
import VetShell, { getVetUser } from './VetShell';
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
  updateProfileAvatar,
  updateVeterinarianProfile,
  uploadProfileAvatar,
  validateEmail,
  validateUsername,
} from '../../../api/profileService';
import { logoutAndResetToLogin } from '../../../api/authService';
import { isValidPhMobile, PH_MOBILE_FORMAT_ERROR } from '../../../utils/contactValidation';
import { isValidPrcLicense, INVALID_PRC_LICENSE_MESSAGE } from '../../../utils/prcValidation';
import { getVerification, subscribeToVerification, submitVerification } from '../../../api/vetVerificationService';
import { styles } from '../../styles/PetOwnerProfileDesign';

const NO_MESSAGE = { type: '', text: '' };

// "Dr." is a title, not a first name: keep it out of the name fields and put
// it back on save only when the profile already had it (as on the web).
const DR_PREFIX = /^(?:dr\.\s*|dr\s+)+/i;
const stripDrTitle = (name) => String(name || '').trim().replace(DR_PREFIX, '').trim();
const withDrTitle = (name, fallback = '') => {
  const bare = stripDrTitle(name);
  return bare ? `Dr. ${bare}` : fallback;
};
const titleOf = (fullName) => (stripDrTitle(fullName) !== String(fullName || '').trim() ? 'Dr.' : '');

const splitFullName = (fullName) => {
  const parts = stripDrTitle(fullName).split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: '', middleName: '', lastName: '' };
  if (parts.length === 1) return { firstName: parts[0], middleName: '', lastName: '' };
  if (parts.length === 2) return { firstName: parts[0], middleName: '', lastName: parts[1] };
  return { firstName: parts[0], middleName: parts.slice(1, -1).join(' '), lastName: parts[parts.length - 1] };
};

const joinFullName = ({ firstName, middleName, lastName }, title = '') => {
  const name = [firstName, middleName, lastName].map((part) => String(part || '').trim()).filter(Boolean).join(' ');
  return name && title ? `${title} ${name}` : name;
};

// Background in Veterinary Medicine: [field, label on the page, label in the form].
const BACKGROUND_TEXT_FIELDS = [
  ['certifications_training', 'Certifications and training', 'Certifications and Professional Training', 'award'],
  ['previous_practice', 'Previous practice', 'Previous Veterinary Practice', 'briefcase'],
  ['professional_interests', 'Professional interests', 'Professional Interests', 'heart'],
  ['biography', 'Short biography', 'Short Biography', 'book'],
];

const VERIFICATION = {
  Verified: { title: 'Verified Veterinarian', tone: 'green', hint: 'Your PRC license number was confirmed by an administrator.' },
  'Pending Review': { title: 'Under Review', tone: 'amber', hint: 'Your PRC license number was submitted and is waiting for administrator review.' },
  Rejected: { title: 'Verification Rejected', tone: 'red', hint: 'Your submission was rejected. Review the note above and submit again.' },
  'Needs Resubmission': { title: 'Resubmission Needed', tone: 'amber', hint: 'Double-check your PRC license number and submit again.' },
  Unverified: { title: 'Not Verified Yet', tone: 'muted', hint: 'Enter your PRC (Professional Regulation Commission) license number. An administrator will confirm it before your account shows as Verified.' },
};

// The edit form's values from the saved profile.
const formFromProfile = (row) => ({
  ...splitFullName(row?.full_name),
  username: row?.username || '',
  email: row?.email || '',
  phone: row?.phone || '',
  address: row?.address || '',
  specialization: row?.specialization || '',
  education: row?.education || '',
  years_experience: row?.years_experience === null || row?.years_experience === undefined ? '' : String(row.years_experience),
  certifications_training: row?.certifications_training || '',
  previous_practice: row?.previous_practice || '',
  professional_interests: row?.professional_interests || '',
  biography: row?.biography || '',
});

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
  if (!form.address.trim()) errors.address = 'Address is required.';
  if (!form.specialization.trim()) errors.specialization = 'Specialization is required.';
  return errors;
};

const VetProfile = ({ navigation, route }) => {
  const routeUser = getVetUser(route);
  const profileId = routeUser?.id || routeUser?.user_id || routeUser?.profile_id || null;
  const scrollViewRef = useRef(null);
  // A failed save scrolls back to the first field outlined in red.
  const errorScroll = useScrollToError(scrollViewRef);
  const FIELD_ORDER = ['firstName', 'lastName', 'middleName', 'username', 'email', 'phone', 'specialization', 'address', 'education', 'years_experience'];

  // `profile` is the saved row the page shows; `form` is only the draft while editing.
  const [profile, setProfile] = useState(routeUser);
  const [mode, setMode] = useState('view'); // 'view' | 'edit' | 'password'
  const [form, setForm] = useState(() => formFromProfile(routeUser));
  const [fieldErrors, setFieldErrors] = useState({});
  const [saving, setSaving] = useState(false);
  // A pending email change waiting for the OTP sent to the CURRENT email
  // (same flow as the pet owner profile).
  const [emailChange, setEmailChange] = useState({ visible: false, challengeId: '', email: '', username: null, details: null, busy: false, error: '' });
  const [message, setMessage] = useState(NO_MESSAGE);
  const [photoDraft, setPhotoDraft] = useState('');
  const [uploading, setUploading] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);

  const [verification, setVerification] = useState(null);
  const [showVerifyModal, setShowVerifyModal] = useState(false);
  const [verifyLicenseNumber, setVerifyLicenseNumber] = useState('');
  const [verifySubmitting, setVerifySubmitting] = useState(false);
  const [verifyError, setVerifyError] = useState('');

  const apply = useCallback((row) => {
    if (!row) return;
    setProfile(row);
    navigation.setParams({ user: { ...(routeUser || {}), ...row } });
  }, [navigation, routeUser]);

  useEffect(() => {
    if (!profileId) return undefined;
    let active = true;
    getProfile(profileId).then((row) => active && apply(row)).catch((error) => active && setMessage({ type: 'error', text: error.message }));
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

  const NO_EMAIL_CHANGE = { visible: false, challengeId: '', email: '', username: null, details: null, busy: false, error: '' };
  const normalized = (value) => String(value || '').trim().toLowerCase();

  // Same rules as the pet owner profile: username saves directly; an email
  // change waits for the code sent to the CURRENT email, then everything in
  // the form is saved together (a cancelled or failed code saves nothing).
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
    const usernameChanged = username !== normalized(profile?.username);
    const emailChanged = email !== normalized(profile?.email);
    const details = { ...form, username, full_name: joinFullName(form, titleOf(profile?.full_name)) };

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
        setEmailChange({ ...NO_EMAIL_CHANGE, visible: true, challengeId, email, username: usernameChanged ? username : null, details });
        return;
      }

      const updated = await updateVeterinarianProfile(profileId, details);
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
        updated = await updateVeterinarianProfile(profileId, { ...emailChange.details, username: updated.username });
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
    updateField('email', profile?.email || '');
    setMessage({ type: 'error', text: 'Email change cancelled. Your email address was not changed.' });
  };

  const { openPhotoOptions, photoOptionsModal } = useProfilePhotoPicker((uri) => {
    setMessage(NO_MESSAGE);
    setPhotoDraft(uri);
  }, (text) => setMessage({ type: 'error', text }));

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

  const removePhoto = async () => {
    setUploading(true);
    setMessage(NO_MESSAGE);
    try {
      apply(await updateProfileAvatar(profileId, null));
      setMessage({ type: 'success', text: 'Profile photo removed.' });
    } catch (error) {
      setMessage({ type: 'error', text: error?.message || 'Unable to remove your photo.' });
    } finally {
      setUploading(false);
    }
  };

  const confirmRemovePhoto = () => {
    Alert.alert('Remove profile photo?', 'Your profile will show the default picture.', [
      { text: 'Keep it', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: removePhoto },
    ]);
  };

  const verificationStatus = verification?.status || 'Unverified';
  const verificationCopy = VERIFICATION[verificationStatus] || VERIFICATION.Unverified;
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
      setMessage({ type: 'success', text: 'Your PRC license number was submitted. An administrator will confirm it shortly.' });
    } catch (error) {
      setVerifyError(error?.message || 'Unable to submit your verification.');
    } finally {
      setVerifySubmitting(false);
    }
  };

  const years = profile?.years_experience;
  const contactRows = [
    { icon: 'user', label: 'Full name', value: profile?.full_name },
    { icon: 'at', label: 'Username', value: profile?.username ? `@${profile.username}` : '' },
    { icon: 'mail', label: 'Email', value: profile?.email },
    { icon: 'phone', label: 'Contact number', value: profile?.phone },
    { icon: 'pin', label: 'Address', value: profile?.address },
    { icon: 'stethoscope', label: 'Specialization', value: profile?.specialization },
    {
      icon: 'idCard',
      label: 'License number',
      value: profile?.license_number,
      empty: 'Not on file',
      badge: verificationStatus === 'Verified' ? <ProfileTag label="Verified" tone="green" /> : null,
    },
  ];
  const backgroundRows = [
    { icon: 'graduation', label: 'Education', value: profile?.education },
    { icon: 'clock', label: 'Years of experience', value: years === null || years === undefined || years === '' ? '' : `${years} year${Number(years) === 1 ? '' : 's'}` },
    ...BACKGROUND_TEXT_FIELDS.map(([key, label, , icon]) => ({ icon, label, value: profile?.[key] })),
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
    <VetShell navigation={navigation} route={route} subtitle="Profile" showGreeting={false}>
      <ScrollView ref={scrollViewRef} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scrollContent}>
        {mode === 'view' ? <ProfileNotice message={message} /> : null}

        <View style={pfStyles.card}>
          <ProfileHero photoUri={photoDraft || profile?.avatar_url} onPickPhoto={uploading ? undefined : openPhotoOptions} name={withDrTitle(profile?.full_name, 'Veterinarian')} handle={profile?.username}>
            <View style={pfStyles.tags}>
              <ProfileTag label="Veterinarian" />
              <ProfileTag label={verificationStatus} tone={verificationCopy.tone} />
            </View>
            {profile?.specialization ? (
              <View style={pfStyles.spec}>
                <ProfileIcon name="stethoscope" size={15} color="#2c6ba3" />
                <Text style={pfStyles.specText}>{profile.specialization}</Text>
              </View>
            ) : null}
            {photoDraft ? (
              <View style={pfStyles.actions}>
                <ProfileButton label={uploading ? 'Saving…' : 'Save photo'} onPress={savePhoto} disabled={uploading} />
                <ProfileButton label="Cancel" ghost onPress={() => setPhotoDraft('')} disabled={uploading} />
              </View>
            ) : profile?.avatar_url && mode === 'view' ? (
              <TouchableOpacity onPress={confirmRemovePhoto} disabled={uploading} activeOpacity={0.8}>
                <Text style={pfStyles.linkDanger}>{uploading ? 'Removing…' : 'Remove photo'}</Text>
              </TouchableOpacity>
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
              <>
                <ProfileDetails rows={contactRows} />
                <ProfileSubheading icon="graduation" label="Background in Veterinary Medicine" />
                <ProfileDetails rows={backgroundRows} />
              </>
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
                {textField('specialization', 'Specialization', { required: true, placeholder: 'e.g. Small Animal Medicine' })}
                {textField('address', 'Address', { required: true, multiline: true, placeholder: 'Enter address' })}

                <ProfileSubheading icon="graduation" label="Background in Veterinary Medicine" />
                {textField('education', 'Education', { optional: true, multiline: true, placeholder: 'Veterinary school, degree, year' })}
                {textField('years_experience', 'Years of Veterinary Experience', {
                  optional: true,
                  keyboardType: 'number-pad',
                  maxLength: 2,
                  transform: (value) => value.replace(/[^0-9]/g, ''),
                })}
                {BACKGROUND_TEXT_FIELDS.map(([key, , formLabel]) => textField(key, formLabel, { optional: true, multiline: true }))}

                <Text style={pfStyles.hint}>Changing your email sends a 6-digit code to your current email. It changes only after you enter the code. License number can't be changed here.</Text>
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
          <>
            <View style={styles.sectionHeaderWrap}>
              <Text style={styles.sectionTitle}>License Verification</Text>
              <Text style={styles.sectionSubtitle}>PRC license number review status</Text>
            </View>

            <View style={styles.profileCard}>
              <View style={styles.verificationTopRow}>
                <Text style={styles.verificationTitle}>{verificationCopy.title}</Text>
                <ProfileTag label={verificationStatus} tone={verificationCopy.tone} />
              </View>

              {(verificationStatus === 'Rejected' || verificationStatus === 'Needs Resubmission') && verification?.rejection_reason ? (
                <View style={styles.verificationRejectionBox}>
                  <Text style={styles.verificationRejectionTitle}>Administrator Note</Text>
                  <Text style={styles.verificationRejectionText}>{verification.rejection_reason}</Text>
                </View>
              ) : null}

              <Text style={styles.verificationHint}>{verificationCopy.hint}</Text>

              {canSubmitVerification ? (
                <TouchableOpacity style={styles.editButton} onPress={openVerifyModal} activeOpacity={0.9}>
                  <Text style={styles.editButtonText}>
                    {verificationStatus === 'Unverified' ? 'Verify Your License' : 'Resubmit License Number'}
                  </Text>
                </TouchableOpacity>
              ) : null}
            </View>

            <TouchableOpacity style={pfStyles.logout} onPress={() => setShowLogoutModal(true)} activeOpacity={0.9}>
              <ProfileIcon name="logout" size={18} color="#c24a4a" />
              <Text style={pfStyles.logoutText}>Logout</Text>
            </TouchableOpacity>
          </>
        ) : null}
      </ScrollView>

      <ProfileOtpModal {...passwordChange.otpModalProps} destinationEmail={profile?.email} />
      <ProfileOtpModal
        visible={emailChange.visible}
        purpose="change_email"
        destinationEmail={profile?.email}
        busy={emailChange.busy}
        error={emailChange.error}
        autoVerify
        onVerify={verifyEmailChange}
        onResend={resendEmailChange}
        onCancel={cancelEmailChangeFlow}
        onClearError={() => setEmailChange((current) => (current.error ? { ...current, error: '' } : current))}
      />

      {photoOptionsModal}

      <Modal transparent animationType="fade" visible={showVerifyModal} onRequestClose={closeVerifyModal}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Verify Your License</Text>
            <Text style={styles.modalMessage}>
              Enter your PRC (Professional Regulation Commission) license number. An administrator will confirm it before your account shows as Verified.
            </Text>

            <FormLabel label="PRC License Number" required />
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
            <FieldError text={verifyError} />

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
            <TouchableOpacity style={styles.confirmBtn} onPress={() => { setShowLogoutModal(false); logoutAndResetToLogin(navigation); }} activeOpacity={0.9}>
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
