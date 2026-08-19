import * as SecureStore from "expo-secure-store";
import { supabase } from "../config/supabaseClient";
import { isValidPhMobile, PH_MOBILE_FORMAT_ERROR } from "../utils/contactValidation";

const SESSION_KEY = "pawcruz_session";
const OTP_KEY = "pawcruz_pending_otp";
const RESET_KEY = "pawcruz_password_reset";
const TRUSTED_DEVICE_KEY = "pawcruz_trusted_login_devices";
export const OTP_EXPIRY_MINUTES = 10;
export const OTP_RESEND_SECONDS = 60;
export const OTP_MAX_ATTEMPTS = 5;
export const TRUSTED_DEVICE_DAYS = 30;

const normalizeIdentifier = (value) => String(value || "").trim().toLowerCase();

function publicProfile(profile) {
  if (!profile) return null;
  const { password, ...safeProfile } = profile;
  return safeProfile;
}

function generateOtp() {
  const bytes = new Uint32Array(1);
  globalThis.crypto?.getRandomValues?.(bytes);
  const number = bytes[0] || Math.floor(Math.random() * 1000000);
  return String(number % 1000000).padStart(6, "0");
}

async function readJson(key) {
  try {
    const value = await SecureStore.getItemAsync(key);
    return value ? JSON.parse(value) : null;
  } catch {
    await SecureStore.deleteItemAsync(key).catch(() => {});
    return null;
  }
}

const writeJson = (key, value) => SecureStore.setItemAsync(key, JSON.stringify(value));

async function saveSession(profile) {
  const session = {
    user: { id: profile.id, email: profile.email },
    profile: publicProfile(profile),
    createdAt: new Date().toISOString(),
  };
  await writeJson(SESSION_KEY, session);
  return session;
}

async function isLoginTrustedOnDevice(profile) {
  const trustedAccounts = await readJson(TRUSTED_DEVICE_KEY) || {};
  const account = trustedAccounts[String(profile?.id || '')];
  if (!account) return false;
  const matchesEmail = normalizeIdentifier(account.email) === normalizeIdentifier(profile.email);
  const isValid = Number(account.expiresAt || 0) > Date.now();
  if (matchesEmail && isValid) return true;
  delete trustedAccounts[String(profile?.id || '')];
  await writeJson(TRUSTED_DEVICE_KEY, trustedAccounts);
  return false;
}

async function rememberLoginOnDevice(profile) {
  const trustedAccounts = await readJson(TRUSTED_DEVICE_KEY) || {};
  trustedAccounts[String(profile.id)] = {
    email: normalizeIdentifier(profile.email),
    verifiedAt: Date.now(),
    expiresAt: Date.now() + (TRUSTED_DEVICE_DAYS * 24 * 60 * 60 * 1000),
  };
  await writeJson(TRUSTED_DEVICE_KEY, trustedAccounts);
}

async function writeActivity(profile, action, description) {
  try {
    await supabase.from("activity_logs").insert({
      user_id: profile?.id || null,
      role: profile?.role || null,
      action,
      module: "Authentication",
      description,
      device_browser: "PawCruz Mobile",
    });
  } catch {}
}

async function sendOtpEmail(email, code, purpose) {
  const { data, error } = await supabase.functions.invoke("send-otp-email", {
    body: { email, code, purpose, expiresMinutes: OTP_EXPIRY_MINUTES },
  });
  if (error) {
    let message = error.message || "Unable to send OTP email.";
    try {
      const details = await error.context?.json();
      message = details?.error || details?.message || message;
    } catch {}
    throw new Error(message);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

export async function getStoredSession() {
  return readJson(SESSION_KEY);
}

export async function logoutUser() {
  await SecureStore.deleteItemAsync(SESSION_KEY);
}

export async function createAndSendOtp(email, purpose, payload = {}) {
  const cleanEmail = normalizeIdentifier(email);
  if (!/^\S+@\S+\.\S+$/.test(cleanEmail)) throw new Error("A valid email address is required.");
  const code = generateOtp();
  await sendOtpEmail(cleanEmail, code, purpose);
  await writeJson(OTP_KEY, {
    email: cleanEmail,
    purpose,
    code,
    payload,
    attempts: 0,
    createdAt: Date.now(),
    resendAvailableAt: Date.now() + OTP_RESEND_SECONDS * 1000,
    expiresAt: Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000,
  });
  return { email: cleanEmail, purpose, expiresMinutes: OTP_EXPIRY_MINUTES };
}

export async function getPendingOtp() {
  const pending = await readJson(OTP_KEY);
  if (!pending) return null;
  if (Date.now() > Number(pending.expiresAt || 0)) {
    await SecureStore.deleteItemAsync(OTP_KEY);
    return null;
  }
  return { ...pending, code: undefined };
}

async function verifyOtpCode(purpose, code) {
  const pending = await readJson(OTP_KEY);
  if (!pending || pending.purpose !== purpose) throw new Error("No active OTP request was found. Please request a new code.");
  if (Date.now() > Number(pending.expiresAt || 0)) {
    await SecureStore.deleteItemAsync(OTP_KEY);
    throw new Error("This OTP has expired. Please resend a new code.");
  }
  if (Number(pending.attempts || 0) >= OTP_MAX_ATTEMPTS) {
    await SecureStore.deleteItemAsync(OTP_KEY);
    throw new Error("Too many incorrect attempts. Please request a new OTP.");
  }
  if (String(code || "").trim() !== String(pending.code || "")) {
    const attempts = Number(pending.attempts || 0) + 1;
    await writeJson(OTP_KEY, { ...pending, attempts });
    const remaining = OTP_MAX_ATTEMPTS - attempts;
    if (remaining <= 0) {
      await SecureStore.deleteItemAsync(OTP_KEY);
      throw new Error("Too many incorrect attempts. Please request a new OTP.");
    }
    throw new Error(`Invalid OTP code. ${remaining} attempt${remaining === 1 ? "" : "s"} remaining.`);
  }
  return pending;
}

export async function verifyProfileOtp(purpose, code) {
  const pending = await verifyOtpCode(purpose, code);
  await SecureStore.deleteItemAsync(OTP_KEY);
  return pending.payload || {};
}

export async function resendAuthOtp(purpose) {
  const pending = await readJson(OTP_KEY);
  if (!pending || pending.purpose !== purpose) throw new Error("No OTP request is available to resend.");
  const waitMs = Number(pending.resendAvailableAt || 0) - Date.now();
  if (waitMs > 0) throw new Error(`Please wait ${Math.ceil(waitMs / 1000)} seconds before resending.`);
  return createAndSendOtp(pending.email, pending.purpose, pending.payload || {});
}

export async function attemptLogin({ username, password }) {
  const normalized = normalizeIdentifier(username);
  const enteredPassword = String(password || "");
  if (!normalized || !enteredPassword) throw new Error("Enter your username/email and password.");
  const field = normalized.includes("@") ? "email" : "username";
  const { data: profile, error } = await supabase.from("profiles").select("*").eq(field, normalized).limit(1).maybeSingle();
  if (error) throw new Error("Unable to validate your account.");
  if (!profile || String(profile.password) !== enteredPassword) {
    await writeActivity(profile, "Failed login", `Failed login attempt for ${normalized}.`);
    throw new Error("Invalid username/email or password.");
  }
  if (profile.account_status !== "active") throw new Error("Your account is inactive. Contact the administrator.");
  if (await isLoginTrustedOnDevice(profile)) {
    const now = new Date().toISOString();
    await supabase.from("profiles").update({ last_login_at: now }).eq("id", profile.id);
    const updatedProfile = { ...profile, last_login_at: now };
    const session = await saveSession(updatedProfile);
    await writeActivity(updatedProfile, "Login", `${profile.full_name || profile.username} logged in on a trusted device.`);
    return { requiresOtp: false, user: session.profile, session };
  }
  await createAndSendOtp(profile.email, "login", { profileId: profile.id });
  return { requiresOtp: true, email: profile.email, purpose: "login" };
}

export async function verifyLoginOtp(email, otp, { rememberDevice = false } = {}) {
  const pending = await verifyOtpCode("login", otp);
  const { data: profile, error } = await supabase.from("profiles").select("*").eq("id", pending.payload?.profileId).single();
  if (error || !profile || normalizeIdentifier(profile.email) !== normalizeIdentifier(email)) throw new Error("Unable to complete login.");
  const now = new Date().toISOString();
  await supabase.from("profiles").update({ last_login_at: now }).eq("id", profile.id);
  await SecureStore.deleteItemAsync(OTP_KEY);
  const updatedProfile = { ...profile, last_login_at: now };
  if (rememberDevice) await rememberLoginOnDevice(updatedProfile);
  const session = await saveSession(updatedProfile);
  await writeActivity(updatedProfile, "Login", `${profile.full_name || profile.username} logged in.`);
  return { user: session.profile, session };
}

export async function resendLoginOtp() {
  return resendAuthOtp("login");
}

export async function registerUser(values) {
  const username = normalizeIdentifier(values.username);
  const email = normalizeIdentifier(values.email);
  const password = String(values.password || "");
  const phone = String(values.contact ?? values.phone ?? "").trim();
  const fullName = [values.firstName, values.middleName, values.lastName].filter(Boolean).join(" ").trim();
  if (!String(values.firstName || "").trim() || !String(values.lastName || "").trim()) throw new Error("First name and last name are required.");
  if (fullName.length < 2) throw new Error("Please enter your complete name.");
  if (!/^[a-z0-9_.-]{3,30}$/.test(username)) throw new Error("Username must be 3–30 characters and may use letters, numbers, dots, dashes, or underscores.");
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error("Please enter a valid email address.");
  if (!password) throw new Error("Password is required.");
  if (!isValidPhMobile(phone)) throw new Error(PH_MOBILE_FORMAT_ERROR);
  const { data: existing, error } = await supabase.from("profiles").select("id").or(`username.eq.${username},email.eq.${email}`).limit(1);
  if (error) throw new Error("Unable to check the account details.");
  if (existing?.length) throw new Error("That username or email is already registered.");
  await createAndSendOtp(email, "register", { fullName, username, email, password, phone, role: values.role || "pet_owner" });
  return { requiresOtp: true, email, purpose: "register" };
}

export async function completeRegistrationOtp(code) {
  const pending = await verifyOtpCode("register", code);
  const values = pending.payload || {};
  const { data: profile, error } = await supabase.from("profiles").insert({
    full_name: values.fullName,
    username: values.username,
    email: values.email,
    password: values.password,
    phone: values.phone || null,
    role: values.role || "pet_owner",
    account_status: "active",
  }).select("*").single();
  if (error) throw new Error("Registration failed. Check your Supabase policies and required columns.");
  await SecureStore.deleteItemAsync(OTP_KEY);
  await writeActivity(profile, "Account creation", `Pet-owner account created for ${values.username}.`);
  return { success: true, user: publicProfile(profile) };
}

export async function requestPasswordReset(identifier) {
  const normalized = normalizeIdentifier(identifier);
  if (!normalized) throw new Error("Enter your email address or username.");
  const field = normalized.includes("@") ? "email" : "username";
  const { data: profile, error } = await supabase.from("profiles").select("id,email").eq(field, normalized).maybeSingle();
  if (error || !profile) throw new Error("Account not found.");
  await createAndSendOtp(profile.email, "forgot_password", { profileId: profile.id });
  return { requiresOtp: true, email: profile.email, purpose: "forgot_password" };
}

export async function verifyPasswordResetOtp(code) {
  const pending = await verifyOtpCode("forgot_password", code);
  await writeJson(RESET_KEY, { profileId: pending.payload?.profileId, expiresAt: Date.now() + 15 * 60 * 1000 });
  await SecureStore.deleteItemAsync(OTP_KEY);
  return true;
}

export async function completePasswordReset(newPassword) {
  const password = String(newPassword || "");
  if (password.length < 8 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/\d/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
    throw new Error("Password must contain at least 8 characters, uppercase, lowercase, number, and special character.");
  }
  const reset = await readJson(RESET_KEY);
  if (!reset?.profileId || Date.now() > Number(reset.expiresAt || 0)) {
    await SecureStore.deleteItemAsync(RESET_KEY);
    throw new Error("Password reset verification expired. Request a new OTP.");
  }
  const { error } = await supabase.from("profiles").update({ password, updated_at: new Date().toISOString() }).eq("id", reset.profileId);
  if (error) throw new Error(`Unable to update password: ${error.message}`);
  await SecureStore.deleteItemAsync(RESET_KEY);
  return true;
}

export const confirmPasswordReset = completePasswordReset;

export async function unlockAccount() {
  throw new Error("Account unlock isn't set up yet on the Supabase backend.");
}

export async function sendUnlockEmail() {
  throw new Error("Account unlock isn't set up yet on the Supabase backend.");
}
