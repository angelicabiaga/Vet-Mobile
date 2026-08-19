import { supabase } from "../config/supabaseClient";
import { validateImageBlob } from "../utils/imageValidation";

const VERIFICATION_FIELDS = "id,veterinarian_id,status,id_front_path,id_back_path,face_scan_path,prc_name_on_card,prc_license_number,prc_registration_date,prc_expiration_date,consent_given_at,submitted_at,reviewed_by,reviewed_at,rejection_reason,created_at,updated_at";

export async function getVerification(veterinarianId) {
  if (!veterinarianId) return null;
  const { data, error } = await supabase
    .from("veterinarian_verifications")
    .select(VERIFICATION_FIELDS)
    .eq("veterinarian_id", veterinarianId)
    .maybeSingle();
  if (error) throw new Error(error.message || "Unable to load verification status.");
  return data;
}

export function subscribeToVerification(veterinarianId, callback) {
  if (!veterinarianId || typeof callback !== "function") return () => {};
  const channel = supabase
    .channel(`vet-verification-${veterinarianId}-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "veterinarian_verifications", filter: `veterinarian_id=eq.${veterinarianId}` },
      (payload) => callback(payload.new)
    )
    .subscribe();
  return () => { void supabase.removeChannel(channel); };
}

async function uploadVerificationImage(veterinarianId, uri, label) {
  const response = await fetch(uri);
  const blob = await response.blob();
  const validationError = validateImageBlob(blob, uri);
  if (validationError) throw new Error(validationError);
  const clean = String(uri).split("?")[0];
  const extMatch = clean.match(/\.([a-zA-Z0-9]+)$/);
  const ext = (extMatch?.[1] || "jpg").toLowerCase();
  const path = `${veterinarianId}/${label}-${Date.now()}.${ext}`;
  const { error } = await supabase.storage
    .from("veterinarian-verifications")
    .upload(path, blob, { upsert: true, contentType: blob.type || `image/${ext === "jpg" ? "jpeg" : ext}` });
  if (error) throw new Error(error.message || `Unable to upload ${label}.`);
  return path;
}

// Uploads the PRC ID (front/back) and a live face photo, then moves the
// veterinarian's existing verification row to Pending Review. The vet never
// sets prc_name_on_card / prc_license_number / prc_*_date themselves — those
// are filled in by staff during manual review of the uploaded images, and
// license_number on profiles is only set once that review approves them.
export async function submitVerification(veterinarianId, { idFrontUri, idBackUri, faceScanUri }) {
  if (!veterinarianId) throw new Error("Your login session is incomplete.");
  if (!idFrontUri || !idBackUri || !faceScanUri) {
    throw new Error("Upload the front and back of your PRC ID and a live face photo to continue.");
  }

  const [idFrontPath, idBackPath, faceScanPath] = await Promise.all([
    uploadVerificationImage(veterinarianId, idFrontUri, "id-front"),
    uploadVerificationImage(veterinarianId, idBackUri, "id-back"),
    uploadVerificationImage(veterinarianId, faceScanUri, "face-scan"),
  ]);

  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from("veterinarian_verifications")
    .update({
      id_front_path: idFrontPath,
      id_back_path: idBackPath,
      face_scan_path: faceScanPath,
      status: "Pending Review",
      consent_given_at: nowIso,
      submitted_at: nowIso,
      rejection_reason: null,
      updated_at: nowIso,
    })
    .eq("veterinarian_id", veterinarianId)
    .select(VERIFICATION_FIELDS)
    .single();

  if (error) throw new Error(error.message || "Unable to submit your verification.");
  return data;
}

// The verification bucket is private, so images are only reachable through a
// short-lived signed URL rather than a permanent public link.
export async function getVerificationSignedUrl(path, expiresInSeconds = 600) {
  if (!path) return null;
  const { data, error } = await supabase.storage
    .from("veterinarian-verifications")
    .createSignedUrl(path, expiresInSeconds);
  if (error) throw new Error(error.message || "Unable to load the uploaded image.");
  return data?.signedUrl || null;
}

// Administrator review queue: every veterinarian_verifications row joined
// with the matching profile so the reviewer can see who submitted it.
export async function listVerificationsForAdmin({ status } = {}) {
  let query = supabase
    .from("veterinarian_verifications")
    .select(VERIFICATION_FIELDS)
    .order("submitted_at", { ascending: false, nullsFirst: false });
  if (status) query = query.eq("status", status);

  const { data: rows, error } = await query;
  if (error) throw new Error(error.message || "Unable to load verification submissions.");

  const veterinarianIds = [...new Set((rows || []).map((row) => row.veterinarian_id).filter(Boolean))];
  if (!veterinarianIds.length) return [];

  const { data: profiles, error: profilesError } = await supabase
    .from("profiles")
    .select("id,full_name,username,email,license_number")
    .in("id", veterinarianIds);
  if (profilesError) throw new Error(profilesError.message || "Unable to load veterinarian profiles.");

  const profileMap = new Map((profiles || []).map((profile) => [profile.id, profile]));
  return (rows || []).map((row) => ({ ...row, veterinarian: profileMap.get(row.veterinarian_id) || null }));
}

// Approve: the administrator has read the PRC ID/face scan and manually
// transcribed the license details, so this is the only place the license
// number is ever written — the veterinarian side never sets it directly.
export async function approveVerification(veterinarianId, { reviewerId, prcNameOnCard, prcLicenseNumber, prcRegistrationDate, prcExpirationDate }) {
  if (!veterinarianId) throw new Error("A veterinarian is required.");
  const licenseNumber = String(prcLicenseNumber || "").trim();
  if (!licenseNumber) throw new Error("Enter the license number exactly as printed on the PRC ID before approving.");

  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from("veterinarian_verifications")
    .update({
      status: "Verified",
      prc_name_on_card: String(prcNameOnCard || "").trim() || null,
      prc_license_number: licenseNumber,
      prc_registration_date: prcRegistrationDate || null,
      prc_expiration_date: prcExpirationDate || null,
      rejection_reason: null,
      reviewed_by: reviewerId || null,
      reviewed_at: nowIso,
      updated_at: nowIso,
    })
    .eq("veterinarian_id", veterinarianId)
    .select(VERIFICATION_FIELDS)
    .single();
  if (error) throw new Error(error.message || "Unable to approve this verification.");

  const { error: profileError } = await supabase
    .from("profiles")
    .update({ license_number: licenseNumber, updated_at: nowIso })
    .eq("id", veterinarianId);
  if (profileError) throw new Error(profileError.message || "Verification was approved, but the license number could not be saved to the profile.");

  return data;
}

// Return for resubmission: status goes back to Unverified so the mobile
// profile shows the reason and lets the veterinarian upload a new PRC ID.
export async function rejectVerification(veterinarianId, { reviewerId, rejectionReason }) {
  if (!veterinarianId) throw new Error("A veterinarian is required.");
  const reason = String(rejectionReason || "").trim();
  if (!reason) throw new Error("Enter a reason so the veterinarian knows what to fix.");

  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from("veterinarian_verifications")
    .update({
      status: "Unverified",
      rejection_reason: reason,
      reviewed_by: reviewerId || null,
      reviewed_at: nowIso,
      updated_at: nowIso,
    })
    .eq("veterinarian_id", veterinarianId)
    .select(VERIFICATION_FIELDS)
    .single();
  if (error) throw new Error(error.message || "Unable to return this verification for resubmission.");
  return data;
}
