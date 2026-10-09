import * as SecureStore from "../utils/secureStorage";
import { supabase } from '../config/supabaseClient';
import { createAndSendOtp, verifyProfileOtp } from './authService';
import { getSessionUser, setSessionUser } from '../session/sessionStore';
import { readImageForUpload } from '../utils/imageValidation';
import { CONTACT_TAKEN_ERROR, isDuplicatePhoneError, isValidPhMobile, PH_MOBILE_FORMAT_ERROR } from '../utils/contactValidation';

const SESSION_KEY = 'pawcruz_session';

function safeProfile(profile) {
  if (!profile) return null;
  const { password, ...safe } = profile;
  return safe;
}

async function refreshStoredSession(profile) {
  try {
    const raw = await SecureStore.getItemAsync(SESSION_KEY);
    const stored = raw ? JSON.parse(raw) : {};
    // Never let another account's profile overwrite the logged-in user's session.
    const sessionId = stored.user?.id || stored.profile?.id;
    if (!profile?.id || !sessionId || String(sessionId) !== String(profile.id)) return;
    const next = {
      ...stored,
      user: { ...(stored.user || {}), id: profile.id, email: profile.email },
      profile: { ...(stored.profile || {}), ...safeProfile(profile) },
    };
    await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(next));
    if (String(getSessionUser()?.id) === String(profile.id)) setSessionUser(next.profile);
  } catch (error) {
    console.warn('Unable to refresh mobile profile session:', error?.message || error);
  }
}

export async function getProfile(profileId) {
  if (!profileId) return null;
  const { data, error } = await supabase.from('profiles').select('*').eq('id', profileId).single();
  if (error) throw new Error(`Unable to load profile: ${error.message}`);
  return data;
}

// Username and email rules shared by the Edit Profile form and the save calls.
export const USERNAME_TAKEN_ERROR = 'Username is already taken.';
export const EMAIL_TAKEN_ERROR = 'Email address is already registered.';
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
// Exact, case-insensitive match for ilike; % and _ can't act as wildcards.
const exactIlike = (value) => String(value).replace(/[\\%_]/g, '\\$&');

export function validateUsername(value) {
  const username = String(value ?? '').trim().toLowerCase();
  if (!username) return 'Username is required.';
  if (!/^[a-z0-9_.-]{3,30}$/.test(username)) return 'Username must contain 3–30 letters, numbers, dots, dashes, or underscores.';
  return '';
}

export function validateEmail(value) {
  const email = String(value ?? '').trim().toLowerCase();
  if (!email) return 'Email address is required.';
  if (!EMAIL_PATTERN.test(email)) return 'Enter a valid email address.';
  return '';
}

async function isTakenByAnother(column, value, profileId) {
  const { data, error } = await supabase.from('profiles').select('id')
    .ilike(column, exactIlike(value)).neq('id', profileId).limit(1);
  if (error) throw new Error('Unable to check your details right now. Please try again.');
  return Boolean(data?.length);
}

export const isUsernameTaken = (username, profileId) => isTakenByAnother('username', String(username).trim().toLowerCase(), profileId);
export const isEmailTaken = (email, profileId) => isTakenByAnother('email', String(email).trim().toLowerCase(), profileId);

// Database rejections in plain words (no error codes).
function profileSaveError(error) {
  if (isDuplicatePhoneError(error)) return new Error(CONTACT_TAKEN_ERROR);
  const text = `${error?.message || ''} ${error?.details || ''}`.toLowerCase();
  if (error?.code === '23505' && text.includes('username')) return new Error(USERNAME_TAKEN_ERROR);
  if (error?.code === '23505' && text.includes('email')) return new Error(EMAIL_TAKEN_ERROR);
  console.warn('Profile save failed:', error?.code, error?.message);
  return new Error('Unable to save your profile. Please try again.');
}

export async function updateProfile(profileId, values) {
  if (!profileId) throw new Error('Profile is unavailable.');
  const fullName = String(values.full_name ?? values.fullName ?? '').trim();
  const username = String(values.username ?? '').trim().toLowerCase();

  const payload = {
    full_name: fullName,
    username,
    phone: String(values.phone ?? values.contact ?? '').trim() || null,
    address: String(values.address ?? '').trim() || null,
    avatar_url: values.avatar_url ?? values.profileImageUri ?? values.avatar ?? null,
    updated_at: new Date().toISOString(),
  };

  if (payload.full_name.length < 2) throw new Error('Enter your complete name.');
  const usernameError = validateUsername(payload.username);
  if (usernameError) throw new Error(usernameError);
  if (await isUsernameTaken(payload.username, profileId)) throw new Error(USERNAME_TAKEN_ERROR);

  // Only this account's row; id, password, role and email are never sent.
  const { data, error } = await supabase.from('profiles').update(payload).eq('id', profileId).select('*').single();
  if (error) throw profileSaveError(error);
  await refreshStoredSession(data);
  return data;
}

// A veterinarian's own profile, Background in Veterinary Medicine included
// (same rules as the web's updateVeterinarianProfile). Username, email and
// license number never change here.
export async function updateVeterinarianProfile(profileId, values) {
  if (!profileId) throw new Error('Profile is unavailable.');
  const text = (value) => String(value ?? '').trim();
  const years = text(values.years_experience);
  const payload = {
    full_name: text(values.full_name),
    phone: text(values.phone),
    address: text(values.address),
    specialization: text(values.specialization),
    education: text(values.education) || null,
    years_experience: years === '' ? null : Number(years),
    certifications_training: text(values.certifications_training) || null,
    previous_practice: text(values.previous_practice) || null,
    professional_interests: text(values.professional_interests) || null,
    biography: text(values.biography) || null,
    updated_at: new Date().toISOString(),
  };

  if (payload.full_name.split(/\s+/).filter(Boolean).length < 2) throw new Error('First name and last name are both required.');
  if (!payload.phone) throw new Error('Contact number is required.');
  if (!isValidPhMobile(payload.phone)) throw new Error(PH_MOBILE_FORMAT_ERROR);
  if (!payload.address) throw new Error('Address is required.');
  if (!payload.specialization) throw new Error('Specialization is required.');
  if (payload.years_experience !== null && (!Number.isInteger(payload.years_experience) || payload.years_experience < 0)) {
    throw new Error('Years of experience must be a whole number, 0 or more.');
  }

  const { data, error } = await supabase.from('profiles').update(payload).eq('id', profileId).select('*').single();
  if (isDuplicatePhoneError(error)) throw new Error(CONTACT_TAKEN_ERROR);
  if (error) throw new Error(`Unable to update profile: ${error.message}`);
  await refreshStoredSession(data);
  return data;
}

// Only the photo (null removes it), so a new photo never depends on the
// rest of the profile passing validation.
export async function updateProfileAvatar(profileId, avatarUrl) {
  if (!profileId) throw new Error('Profile is unavailable.');
  const { data, error } = await supabase
    .from('profiles')
    .update({ avatar_url: avatarUrl || null, updated_at: new Date().toISOString() })
    .eq('id', profileId)
    .select('*')
    .single();
  if (error) throw new Error(`Unable to update profile photo: ${error.message}`);
  await refreshStoredSession(data);
  return data;
}

async function verifyCurrentPassword(profileId, currentPassword) {
  const { data, error } = await supabase.from('profiles').select('id,email,password').eq('id', profileId).single();
  if (error || !data) throw new Error('Unable to verify your account.');
  if (String(data.password || '') !== String(currentPassword || '')) throw new Error('Current password is incorrect.');
  return data;
}

// Email change: the `profile-email-change` Edge Function sends the code to the
// CURRENT registered email, checks it, and only then saves the new email (and
// a new username, when one is passed). The code never reaches the app.
async function callEmailChange(body) {
  const { data, error } = await supabase.functions.invoke('profile-email-change', { body });
  if (error) {
    let message = '';
    try {
      const details = await error.context?.json();
      message = details?.error || '';
    } catch {}
    // The function isn't deployed: not the user's connection.
    if (!message && error.context?.status === 404) message = 'Email change is not available right now. Please try again later.';
    throw new Error(message || 'Unable to reach the server. Check your connection and try again.');
  }
  if (!data?.success) throw new Error(data?.error || 'Something went wrong. Please try again.');
  return data;
}

// Returns { challengeId } for confirmEmailChange.
export async function requestEmailChange(profileId, newEmail, username) {
  if (!profileId) throw new Error('Your login session is incomplete. Please log in again.');
  return callEmailChange({ action: 'request', profileId, newEmail, ...(username ? { username } : {}) });
}

export async function confirmEmailChange(challengeId, code) {
  const { profile } = await callEmailChange({ action: 'verify', challengeId, code: String(code || '').trim() });
  await refreshStoredSession(profile);
  return profile;
}

// Best effort: ends the pending code when the user cancels.
export function cancelEmailChange(challengeId) {
  if (!challengeId) return;
  callEmailChange({ action: 'cancel', challengeId }).catch(() => {});
}

export async function requestPasswordChangeOtp(profileId, currentPassword) {
  if (!currentPassword) throw new Error('Enter your current password.');
  const profile = await verifyCurrentPassword(profileId, currentPassword);
  return createAndSendOtp(profile.email, 'change_password', { profileId });
}

export async function confirmPasswordChangeOtp(profileId, code, newPassword) {
  const password = String(newPassword || '');
  if (password.length < 8 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/\d/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
    throw new Error('New password must contain uppercase, lowercase, number, and special character.');
  }
  const pending = await verifyProfileOtp('change_password', String(code || '').trim());
  if (pending.profileId !== profileId) throw new Error('The password-change request is invalid. Please request a new code.');
  const { data: profile, error } = await supabase.from('profiles').update({ password, updated_at: new Date().toISOString() }).eq('id', profileId).select('*').single();
  if (error) throw new Error(`Unable to change password: ${error.message}`);
  await refreshStoredSession(profile);
  return { success: true, profile };
}

export async function uploadProfileAvatar(profileId, uri) {
  if (!profileId || !uri) return null;
  const { body, contentType, ext } = await readImageForUpload(uri);
  const path = `${profileId}/avatar-${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from('profile-avatars').upload(path, body, { upsert: true, contentType });
  if (error) {
    console.warn('Profile photo upload failed:', error.message);
    throw new Error('Unable to upload your profile photo. Please try again with a JPG, PNG or WEBP image.');
  }
  return supabase.storage.from('profile-avatars').getPublicUrl(path).data.publicUrl;
}

export function subscribeProfile(profileId, callback) {
  if (!profileId || typeof callback !== 'function') return () => {};
  const channel = supabase
    .channel(`mobile-profile-${profileId}-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${profileId}` }, async (payload) => {
      if (payload.new) {
        await refreshStoredSession(payload.new);
        callback(payload.new);
      }
    })
    .subscribe();

  return () => { void supabase.removeChannel(channel); };
}
