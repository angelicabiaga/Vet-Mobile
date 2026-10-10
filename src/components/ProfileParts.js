import React, { useState } from 'react';
import { ActionSheetIOS, Alert, Image, Modal, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Svg, { Circle, G, Path, Rect } from 'react-native-svg';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { confirmPasswordChangeOtp, requestPasswordChangeOtp } from '../api/profileService';
import { validatePickedImageAsset } from '../utils/imageValidation';
import { styles as profileStyles } from '../screens/styles/PetOwnerProfileDesign';

// Building blocks shared by the Pet Owner and Veterinarian profile screens,
// matching the web's profile page: banner with a round photo, the name and
// @username, detail rows with icons, and the password checklist.

const DEFAULT_PROFILE_IMAGE = require('../screens/assets/Profile.png');
const EYE_SHOW = require('../screens/assets/eye-show.png');
const EYE_HIDE = require('../screens/assets/eye-hide.png');

// Lucide icons (the web uses lucide-react), on one 24x24 grid.
const ICONS = {
  user: <><Circle cx="12" cy="8" r="5" /><Path d="M20 21a8 8 0 0 0-16 0" /></>,
  at: <><Circle cx="12" cy="12" r="4" /><Path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8" /></>,
  mail: <><Rect x="2" y="4" width="20" height="16" rx="2" /><Path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" /></>,
  phone: <Path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />,
  pin: <><Path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0" /><Circle cx="12" cy="10" r="3" /></>,
  stethoscope: <><Path d="M11 2v2" /><Path d="M5 2v2" /><Path d="M5 3H4a2 2 0 0 0-2 2v4a6 6 0 0 0 12 0V5a2 2 0 0 0-2-2h-1" /><Path d="M8 15a6 6 0 0 0 12 0v-3" /><Circle cx="20" cy="10" r="2" /></>,
  idCard: <><Path d="M16 10h2" /><Path d="M16 14h2" /><Path d="M6.17 15a3 3 0 0 1 5.66 0" /><Circle cx="9" cy="11" r="2" /><Rect x="2" y="5" width="20" height="14" rx="2" /></>,
  graduation: <><Path d="M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z" /><Path d="M22 10v6" /><Path d="M6 12.5V16a6 3 0 0 0 12 0v-3.5" /></>,
  clock: <><Circle cx="12" cy="12" r="10" /><Path d="M12 6v6l4 2" /></>,
  award: <><Path d="m15.477 12.89 1.515 8.526a.5.5 0 0 1-.81.47l-3.58-2.687a1 1 0 0 0-1.197 0l-3.586 2.686a.5.5 0 0 1-.81-.469l1.514-8.526" /><Circle cx="12" cy="8" r="6" /></>,
  briefcase: <><Path d="M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" /><Rect x="2" y="6" width="20" height="14" rx="2" /></>,
  heart: <Path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />,
  book: <><Path d="M12 7v14" /><Path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z" /></>,
  camera: <><Path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" /><Circle cx="12" cy="13" r="3" /></>,
  pencil: <><Path d="M12 20h9" /><Path d="M16.376 3.622a1 1 0 0 1 3.002 3.002L7.368 18.635a2 2 0 0 1-.855.506l-2.872.838a.5.5 0 0 1-.62-.62l.838-2.872a2 2 0 0 1 .506-.854z" /><Path d="m15 5 3 3" /></>,
  key: <><Path d="M2.586 17.414A2 2 0 0 0 2 18.828V21a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h1a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h.172a2 2 0 0 0 1.414-.586l.814-.814a6.5 6.5 0 1 0-4-4z" /><Circle cx="16.5" cy="7.5" r=".5" /></>,
  lock: <><Rect x="3" y="11" width="18" height="11" rx="2" /><Path d="M7 11V7a5 5 0 0 1 10 0v4" /></>,
  badgeCheck: <><Path d="M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z" /><Path d="m9 12 2 2 4-4" /></>,
  check: <Path d="M20 6 9 17l-5-5" />,
  x: <><Path d="M18 6 6 18" /><Path d="m6 6 12 12" /></>,
  logout: <><Path d="m16 17 5-5-5-5" /><Path d="M21 12H9" /><Path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /></>,
};

export function ProfileIcon({ name, size = 17, color = '#4DA8DA' }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <G fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">{ICONS[name]}</G>
    </Svg>
  );
}

// Banner, round photo (with a camera button when it can be changed), name and
// @username. `children` goes under the name: tags, buttons, photo actions.
export function ProfileHero({ photoUri, onPickPhoto, name, handle, children }) {
  return (
    <>
      <LinearGradient colors={['#1e5a8c', '#2c6ba3', '#4DA8DA', '#78c4ca']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={pfStyles.banner}>
        <View style={[pfStyles.bubble, pfStyles.bubbleLeft]} />
        <View style={[pfStyles.bubble, pfStyles.bubbleRight]} />
      </LinearGradient>
      <View style={pfStyles.identity}>
        <View style={pfStyles.avatar}>
          <View style={pfStyles.avatarImg}>
            {photoUri ? (
              <Image source={{ uri: photoUri }} style={pfStyles.avatarPhoto} resizeMode="cover" />
            ) : (
              <Image source={DEFAULT_PROFILE_IMAGE} style={pfStyles.avatarDefault} resizeMode="contain" />
            )}
          </View>
          {onPickPhoto ? (
            <TouchableOpacity style={pfStyles.camera} onPress={onPickPhoto} activeOpacity={0.85} accessibilityLabel="Change photo">
              <ProfileIcon name="camera" size={15} color="#ffffff" />
            </TouchableOpacity>
          ) : null}
        </View>
        <Text style={pfStyles.name}>{name || '—'}</Text>
        {handle ? <Text style={pfStyles.handle} numberOfLines={1}>@{handle}</Text> : null}
        {children}
      </View>
    </>
  );
}

export function ProfileTag({ label, tone = 'blue' }) {
  return (
    <View style={[pfStyles.tag, pfStyles[`tag_${tone}`]]}>
      <Text style={[pfStyles.tagText, pfStyles[`tagText_${tone}`]]} numberOfLines={1}>{label}</Text>
    </View>
  );
}

// Primary (filled) or ghost (outlined) button with an icon.
export function ProfileButton({ icon, label, onPress, ghost = false, disabled = false }) {
  return (
    <TouchableOpacity style={[pfStyles.button, ghost ? pfStyles.buttonGhost : pfStyles.buttonPrimary, disabled && pfStyles.buttonDisabled]} onPress={onPress} disabled={disabled} activeOpacity={0.88}>
      {icon ? <ProfileIcon name={icon} size={17} color={ghost ? '#2c6ba3' : '#ffffff'} /> : null}
      <Text style={[pfStyles.buttonText, ghost && pfStyles.buttonTextGhost]} numberOfLines={1}>{label}</Text>
    </TouchableOpacity>
  );
}

// rows: [{ icon, label, value, empty?, badge? }]
export function ProfileDetails({ rows }) {
  return rows.map(({ icon, label, value, empty = 'Not set', badge }, index) => (
    <View key={label} style={[pfStyles.row, index === rows.length - 1 && pfStyles.rowLast]}>
      <View style={pfStyles.rowLabel}>
        <ProfileIcon name={icon} size={16} />
        <Text style={pfStyles.rowLabelText}>{label}</Text>
      </View>
      <View style={pfStyles.rowValueWrap}>
        <Text style={[pfStyles.rowValue, !value && pfStyles.rowEmpty]}>{value || empty}</Text>
        {value && badge ? badge : null}
      </View>
    </View>
  ));
}

export function ProfileSubheading({ icon, label }) {
  return (
    <View style={pfStyles.subheading}>
      <ProfileIcon name={icon} size={16} color="#17445a" />
      <Text style={pfStyles.subheadingText}>{label}</Text>
    </View>
  );
}

export function FormLabel({ label, required = false, optional = false }) {
  return (
    <Text style={pfStyles.label}>
      {label}
      {required ? <Text style={profileStyles.requiredMark}> *</Text> : null}
      {optional ? <Text style={pfStyles.optional}> (Optional)</Text> : null}
    </Text>
  );
}

// Username / email in the edit form: shown, never editable.
export function LockedField({ icon, value }) {
  return (
    <View style={pfStyles.locked}>
      <ProfileIcon name={icon} size={16} color="#9aa9b0" />
      <Text style={pfStyles.lockedText} numberOfLines={1} ellipsizeMode="middle">{value || '—'}</Text>
      <ProfileIcon name="lock" size={15} color="#9aa9b0" />
    </View>
  );
}

export function FieldError({ text }) {
  return text ? <Text style={pfStyles.fieldError}>{text}</Text> : null;
}

export function PasswordInput({ value, onChangeText, placeholder, error }) {
  const [visible, setVisible] = useState(false);
  return (
    <View style={pfStyles.passwordBox}>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        style={[profileStyles.inputField, pfStyles.passwordInput, error && profileStyles.inputFieldError]}
        placeholder={placeholder}
        placeholderTextColor="#87a0b1"
        secureTextEntry={!visible}
        autoCapitalize="none"
        autoCorrect={false}
      />
      <TouchableOpacity onPress={() => setVisible((current) => !current)} style={pfStyles.passwordEye} accessibilityRole="button" accessibilityLabel={visible ? 'Hide password' : 'Show password'}>
        <Image source={visible ? EYE_HIDE : EYE_SHOW} style={pfStyles.passwordEyeIcon} resizeMode="contain" />
      </TouchableOpacity>
    </View>
  );
}

export function ProfileNotice({ message }) {
  if (!message?.text) return null;
  return (
    <View style={[pfStyles.notice, pfStyles[`notice_${message.type || 'success'}`]]}>
      <Text style={[pfStyles.noticeText, pfStyles[`noticeText_${message.type || 'success'}`]]}>{message.text}</Text>
    </View>
  );
}

// Same rules and wording as the web's PasswordChecklist.
export const PASSWORD_RULES = [
  { key: 'length', label: 'At least 8 characters', test: (value) => value.length >= 8 },
  { key: 'upper', label: 'One uppercase letter (A–Z)', test: (value) => /[A-Z]/.test(value) },
  { key: 'lower', label: 'One lowercase letter (a–z)', test: (value) => /[a-z]/.test(value) },
  { key: 'number', label: 'One number (0–9)', test: (value) => /[0-9]/.test(value) },
  { key: 'special', label: 'One special character (!@#$%^&*, etc.)', test: (value) => /[^A-Za-z0-9]/.test(value) },
];

const EMPTY_PASSWORDS = { current: '', next: '', confirm: '' };

// Errors for the Change password form, keyed by field.
function validatePasswordForm({ current, next, confirm }) {
  const errors = {};
  if (!current) errors.current = 'Current password is required.';
  if (!next) errors.next = 'New password is required.';
  else {
    const failed = PASSWORD_RULES.find((rule) => !rule.test(next));
    if (failed) errors.next = `Password does not meet all requirements: ${failed.label}.`;
  }
  if (!confirm) errors.confirm = 'Please confirm your new password.';
  else if (next !== confirm) errors.confirm = 'Passwords do not match. Please re-enter to confirm.';
  return errors;
}

export function PasswordChecklist({ password }) {
  const value = String(password || '');
  return (
    <View style={pfStyles.checklist}>
      {PASSWORD_RULES.map((rule) => {
        const met = rule.test(value);
        return (
          <View key={rule.key} style={pfStyles.checkItem}>
            <ProfileIcon name={met ? 'check' : 'x'} size={13} color={met ? '#2f8f5b' : '#94a3ac'} />
            <Text style={[pfStyles.checkText, met && pfStyles.checkTextMet]}>{rule.label}</Text>
          </View>
        );
      })}
    </View>
  );
}

// Change password: the form's state plus the emailed-code step. setMessage
// shows errors and the final success; onChanged runs once the code is accepted.
// errorScroll (optional, from useScrollToError): scroll back to the first
// password field outlined in red when the form doesn't pass.
export function usePasswordChange(profileId, { setMessage, onChanged, errorScroll }) {
  const [passwords, setPasswords] = useState(EMPTY_PASSWORDS);
  const [errors, setErrors] = useState({});
  const [sending, setSending] = useState(false);
  const [otpVisible, setOtpVisible] = useState(false);
  const [otpError, setOtpError] = useState('');
  const [otpBusy, setOtpBusy] = useState(false);

  const reset = () => {
    setPasswords(EMPTY_PASSWORDS);
    setErrors({});
  };

  const update = (name, value) => {
    setPasswords((current) => ({ ...current, [name]: value }));
    setErrors((current) => (current[name] ? { ...current, [name]: undefined } : current));
  };

  const submit = async () => {
    const nextErrors = validatePasswordForm(passwords);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      setMessage({ type: 'error', text: 'Please fix the highlighted fields before continuing.' });
      errorScroll?.scrollToFirstError(nextErrors, ['current', 'next', 'confirm']);
      return;
    }
    setSending(true);
    setMessage({ type: '', text: '' });
    try {
      await requestPasswordChangeOtp(profileId, passwords.current);
      setOtpError('');
      setOtpVisible(true);
    } catch (error) {
      setMessage({ type: 'error', text: error?.message || 'Unable to send the verification code.' });
    } finally {
      setSending(false);
    }
  };

  const verify = async (code) => {
    try {
      setOtpBusy(true);
      setOtpError('');
      await confirmPasswordChangeOtp(profileId, code, passwords.next);
      setOtpVisible(false);
      reset();
      onChanged();
      setMessage({ type: 'success', text: 'Password changed successfully.' });
    } catch (error) {
      setOtpError(error?.message || 'Invalid or expired OTP.');
    } finally {
      setOtpBusy(false);
    }
  };

  const resend = async () => {
    try {
      setOtpBusy(true);
      setOtpError('');
      await requestPasswordChangeOtp(profileId, passwords.current);
      return true;
    } catch (error) {
      setOtpError(error?.message || 'Unable to resend OTP.');
      return false;
    } finally {
      setOtpBusy(false);
    }
  };

  const otpModalProps = {
    visible: otpVisible,
    purpose: 'change_password',
    busy: otpBusy,
    error: otpError,
    onClearError: () => setOtpError(''),
    onVerify: verify,
    onResend: resend,
    onCancel: () => {
      if (otpBusy) return;
      setOtpVisible(false);
      setOtpError('');
    },
  };

  return { passwords, errors, sending, update, submit, reset, otpModalProps, anchor: errorScroll?.anchor };
}

export function FormTitle({ icon, title }) {
  return (
    <View style={pfStyles.formTitle}>
      <ProfileIcon name={icon} size={19} color="#1d3a4a" />
      <Text style={pfStyles.formTitleText}>{title}</Text>
    </View>
  );
}

// change: what usePasswordChange returns.
export function ChangePasswordForm({ change, onCancel }) {
  const field = (name, label, placeholder) => (
    <>
      <View ref={change.anchor?.(name)}><FormLabel label={label} required /></View>
      <PasswordInput value={change.passwords[name]} onChangeText={(value) => change.update(name, value)} placeholder={placeholder} error={change.errors[name]} />
      <FieldError text={change.errors[name]} />
    </>
  );
  return (
    <>
      <FormTitle icon="lock" title="Change password" />
      {field('current', 'Current password', 'Enter current password')}
      {field('next', 'New password', 'Enter new password')}
      <PasswordChecklist password={change.passwords.next} />
      {field('confirm', 'Confirm new password', 'Confirm new password')}
      <Text style={pfStyles.hint}>We'll email you a code to confirm the change.</Text>
      <View style={pfStyles.formActions}>
        <ProfileButton icon="x" label="Cancel" ghost onPress={onCancel} disabled={change.sending} />
        <ProfileButton icon="lock" label={change.sending ? 'Sending code…' : 'Update password'} onPress={change.submit} disabled={change.sending} />
      </View>
    </>
  );
}

// Album / Files / Camera choice for a new profile photo. Calls onPicked with
// the local uri of a valid image.
export function useProfilePhotoPicker(onPicked) {
  const [visible, setVisible] = useState(false);

  const pick = async (launch) => {
    try {
      const result = await launch();
      if (!result || result.canceled || !result.assets?.length) return;
      const validationError = validatePickedImageAsset(result.assets[0]);
      if (validationError) {
        Alert.alert('Invalid Photo', validationError);
        return;
      }
      onPicked(result.assets[0].uri);
    } catch (error) {
      console.warn('Unable to pick a profile photo:', error?.message || error);
    }
  };

  const fromAlbum = () => pick(async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return null;
    return ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, quality: 0.85 });
  });
  const fromFiles = () => pick(() => DocumentPicker.getDocumentAsync({ type: ['image/*'], copyToCacheDirectory: true, multiple: false }));
  const fromCamera = () => pick(async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) return null;
    return ImagePicker.launchCameraAsync({ allowsEditing: true, quality: 0.85 });
  });

  const choose = (action) => {
    setVisible(false);
    // Let the sheet close before the system picker opens.
    setTimeout(action, Platform.OS === 'ios' ? 280 : 120);
  };

  const openPhotoOptions = () => {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: ['Cancel', 'Choose from Album', 'Choose from Files', 'Use Camera'], cancelButtonIndex: 0, userInterfaceStyle: 'light' },
        (index) => [null, fromAlbum, fromFiles, fromCamera][index]?.()
      );
      return;
    }
    setVisible(true);
  };

  const photoOptionsModal = (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={() => setVisible(false)}>
      <View style={profileStyles.modalOverlay}>
        <View style={profileStyles.photoModalCard}>
          <Text style={profileStyles.modalTitle}>Update Profile Photo</Text>
          <Text style={profileStyles.modalMessage}>Choose how you want to add your profile picture.</Text>
          {[['Choose from Album', fromAlbum], ['Choose from Files', fromFiles], ['Use Camera', fromCamera]].map(([label, action]) => (
            <TouchableOpacity key={label} style={profileStyles.photoOptionButton} onPress={() => choose(action)} activeOpacity={0.9}>
              <Text style={profileStyles.photoOptionText}>{label}</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity style={profileStyles.photoOptionCancelButton} onPress={() => setVisible(false)} activeOpacity={0.9}>
            <Text style={profileStyles.photoOptionCancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );

  return { openPhotoOptions, photoOptionsModal };
}

export const pfStyles = StyleSheet.create({
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#e6f2f7',
    marginBottom: 18,
    ...Platform.select({
      ios: { shadowColor: '#2f7596', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.1, shadowRadius: 18 },
      android: { elevation: 5 },
    }),
  },
  banner: { height: 110, borderTopLeftRadius: 23, borderTopRightRadius: 23, overflow: 'hidden' },
  bubble: { position: 'absolute', borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.15)' },
  bubbleLeft: { width: 120, height: 120, top: -26, left: 8 },
  bubbleRight: { width: 170, height: 170, bottom: -90, right: -30, backgroundColor: 'rgba(255,255,255,0.1)' },
  identity: { alignItems: 'center', paddingHorizontal: 18, paddingBottom: 20, marginTop: -56 },
  avatar: { width: 112, height: 112, marginBottom: 12 },
  avatarImg: {
    width: '100%',
    height: '100%',
    borderRadius: 56,
    overflow: 'hidden',
    backgroundColor: '#e6f6fc',
    borderWidth: 5,
    borderColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarPhoto: { width: '100%', height: '100%' },
  avatarDefault: { width: 50, height: 50, tintColor: '#4DA8DA' },
  camera: {
    position: 'absolute',
    right: 2,
    bottom: 4,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#2c6ba3',
    borderWidth: 3,
    borderColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: { fontSize: 22, fontWeight: '900', color: '#1d3a4a', textAlign: 'center', alignSelf: 'stretch' },
  handle: { marginTop: 3, fontSize: 13.5, fontWeight: '700', color: '#6f7f88', textAlign: 'center', alignSelf: 'stretch' },
  tags: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginTop: 10, alignSelf: 'stretch' },
  tag: { maxWidth: '100%', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, borderWidth: 1 },
  tag_blue: { backgroundColor: '#e7f6fc', borderColor: '#d2e9f6' },
  tag_green: { backgroundColor: '#e7f7ec', borderColor: '#bfe8cc' },
  tag_amber: { backgroundColor: '#fff4e0', borderColor: '#f4dfb0' },
  tag_red: { backgroundColor: '#fff1f1', borderColor: '#ffd7d7' },
  tag_muted: { backgroundColor: '#eef1f4', borderColor: '#dde5ea' },
  tagText: { fontSize: 11.5, fontWeight: '800' },
  tagText_blue: { color: '#267fa9' },
  tagText_green: { color: '#1f9d55' },
  tagText_amber: { color: '#a9750c' },
  tagText_red: { color: '#c24a4a' },
  tagText_muted: { color: '#5f7f8a' },
  spec: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 10, alignSelf: 'stretch' },
  specText: { flexShrink: 1, fontSize: 13.5, fontWeight: '700', color: '#2c6ba3', textAlign: 'center' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 16, alignSelf: 'stretch' },
  button: {
    flexGrow: 1,
    flexBasis: 140,
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    borderRadius: 13,
    borderWidth: 1,
    paddingHorizontal: 12,
  },
  buttonPrimary: { backgroundColor: '#2c6ba3', borderColor: '#2c6ba3' },
  buttonGhost: { backgroundColor: '#ffffff', borderColor: '#cfe4ed' },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { flexShrink: 1, fontSize: 13.5, fontWeight: '900', color: '#ffffff' },
  buttonTextGhost: { color: '#2c6ba3' },
  linkDanger: { marginTop: 10, fontSize: 12.5, fontWeight: '800', color: '#c1454c', textDecorationLine: 'underline' },
  uploading: { marginTop: 8, fontSize: 12.5, fontWeight: '700', color: '#2c6ba3' },
  body: { borderTopWidth: 1, borderTopColor: '#edf3f6', paddingHorizontal: 18, paddingTop: 8, paddingBottom: 18 },
  row: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f0f5f7' },
  rowLast: { borderBottomWidth: 0 },
  rowLabel: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowLabelText: { flexShrink: 1, fontSize: 12.5, fontWeight: '700', color: '#6f7f88' },
  rowValueWrap: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 5, paddingLeft: 24 },
  rowValue: { flexShrink: 1, fontSize: 14.5, fontWeight: '700', color: '#1d3a4a', lineHeight: 20 },
  rowEmpty: { color: '#a3b3ba', fontWeight: '500', fontStyle: 'italic' },
  subheading: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 16, marginBottom: 2 },
  subheadingText: { flexShrink: 1, fontSize: 12.5, fontWeight: '900', color: '#17445a', textTransform: 'uppercase', letterSpacing: 0.3 },
  formTitle: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10, marginBottom: 4 },
  formTitleText: { fontSize: 17, fontWeight: '900', color: '#1d3a4a' },
  label: { marginTop: 12, marginBottom: 6, fontSize: 13, fontWeight: '800', color: '#334e5a' },
  optional: { fontWeight: '600', color: '#8aa0ab' },
  textArea: { minHeight: 88, paddingTop: 12, paddingBottom: 12, textAlignVertical: 'top' },
  fieldError: { marginTop: 6, fontSize: 12, lineHeight: 17, fontWeight: '700', color: '#dc2626' },
  passwordBox: { justifyContent: 'center' },
  passwordInput: { paddingRight: 52 },
  passwordEye: { position: 'absolute', right: 10, width: 36, height: 44, alignItems: 'center', justifyContent: 'center' },
  passwordEyeIcon: { width: 22, height: 22, tintColor: '#526d82' },
  locked: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 14,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#d3e2e8',
    backgroundColor: '#f4f7f8',
    paddingHorizontal: 12,
  },
  lockedText: { flex: 1, fontSize: 14, fontWeight: '700', color: '#5f7380' },
  hint: { marginTop: 12, fontSize: 12.5, lineHeight: 18, fontWeight: '600', color: '#6f7f88' },
  checklist: { marginTop: 10, gap: 5 },
  checkItem: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  checkText: { flexShrink: 1, fontSize: 12.5, fontWeight: '600', color: '#94a3ac' },
  checkTextMet: { color: '#2f8f5b' },
  formActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 16 },
  formNotice: { marginTop: 12 },
  notice: { borderRadius: 14, paddingHorizontal: 14, paddingVertical: 11, marginBottom: 12 },
  notice_success: { backgroundColor: '#eaf8ef' },
  notice_error: { backgroundColor: '#fff0f0' },
  notice_warn: { backgroundColor: '#fff5d9' },
  noticeText: { fontSize: 13, lineHeight: 19, fontWeight: '700' },
  noticeText_success: { color: '#28794c' },
  noticeText_error: { color: '#a94444' },
  noticeText_warn: { color: '#9a7015' },
  logout: {
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#ffd7d7',
    backgroundColor: '#fff1f1',
    marginBottom: 20,
  },
  logoutText: { fontSize: 14, fontWeight: '900', color: '#c24a4a' },
});
