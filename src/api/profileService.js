import * as SecureStore from 'expo-secure-store';
import { supabase } from '../config/supabaseClient';
import { createAndSendOtp, verifyProfileOtp } from './authService';

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
    const next = {
      ...stored,
      user: { ...(stored.user || {}), id: profile.id, email: profile.email },
      profile: { ...(stored.profile || {}), ...safeProfile(profile) },
    };
    await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(next));
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
  if (!/^[a-z0-9_.-]{3,30}$/.test(payload.username)) throw new Error('Username must contain 3–30 letters, numbers, dots, dashes, or underscores.');
  const { data: duplicate, error: duplicateError } = await supabase
    .from('profiles').select('id').eq('username', payload.username).neq('id', profileId).limit(1);
  if (duplicateError) throw new Error(`Unable to validate profile: ${duplicateError.message}`);
  if (duplicate?.length) throw new Error('The username is already used by another account.');

  const { data, error } = await supabase.from('profiles').update(payload).eq('id', profileId).select('*').single();
  if (error) throw new Error(`Unable to update profile: ${error.message}`);
  await refreshStoredSession(data);
  return data;
}

async function verifyCurrentPassword(profileId, currentPassword) {
  const { data, error } = await supabase.from('profiles').select('id,email,password').eq('id', profileId).single();
  if (error || !data) throw new Error('Unable to verify your account.');
  if (String(data.password || '') !== String(currentPassword || '')) throw new Error('Current password is incorrect.');
  return data;
}

export async function requestEmailChangeOtp(profileId, currentPassword, newEmail) {
  const email = String(newEmail || '').trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error('Enter a valid new email address.');
  if (!currentPassword) throw new Error('Enter your current password to verify the email change.');
  await verifyCurrentPassword(profileId, currentPassword);
  const { data: duplicate, error } = await supabase.from('profiles').select('id').eq('email', email).neq('id', profileId).limit(1);
  if (error) throw new Error(`Unable to validate the email address: ${error.message}`);
  if (duplicate?.length) throw new Error('The email address is already used by another account.');
  return createAndSendOtp(email, 'change_email', { profileId, newEmail: email });
}

export async function confirmEmailChangeOtp(profileId, code) {
  const pending = await verifyProfileOtp('change_email', String(code || '').trim());
  if (pending.profileId !== profileId || !pending.newEmail) throw new Error('The email-change request is invalid. Please request a new code.');
  const { data: profile, error } = await supabase.from('profiles').update({ email: pending.newEmail, email_verified_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', profileId).select('*').single();
  if (error) throw new Error(`Unable to change email: ${error.message}`);
  await refreshStoredSession(profile);
  return { success: true, profile };
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

function extensionFromUri(uri) {
  const clean = String(uri || '').split('?')[0];
  const match = clean.match(/\.([a-zA-Z0-9]+)$/);
  return (match?.[1] || 'jpg').toLowerCase();
}

export async function uploadProfileAvatar(profileId, uri) {
  if (!profileId || !uri) return null;
  const response = await fetch(uri);
  const blob = await response.blob();
  if (blob.size > 5 * 1024 * 1024) throw new Error('Profile image must be 5 MB or smaller.');
  const ext = extensionFromUri(uri);
  const path = `${profileId}/avatar-${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from('profile-avatars').upload(path, blob, {
    upsert: true,
    contentType: blob.type || `image/${ext === 'jpg' ? 'jpeg' : ext}`,
  });
  if (error) throw new Error(`Unable to upload profile image: ${error.message}`);
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
