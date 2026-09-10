import { supabase } from "../config/supabaseClient";
import { isValidPrcLicense, INVALID_PRC_LICENSE_MESSAGE } from "../utils/prcValidation";

const VERIFICATION_FIELDS = "id,veterinarian_id,status,prc_license_number,submitted_at,reviewed_by,reviewed_at,rejection_reason,created_at,updated_at";

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

// Vet-facing: no photos, no OCR -- the veterinarian types their own PRC
// license number. Always lands in Pending Review; nothing is saved to the
// veterinarian's profile or marked verified until an administrator
// approves it (PRC has no public verification API to check it against
// automatically).
export async function submitVerification(veterinarianId, licenseNumber) {
  if (!veterinarianId) throw new Error("Your login session is incomplete.");
  const value = String(licenseNumber || "").trim().toUpperCase();
  if (!isValidPrcLicense(value)) throw new Error(INVALID_PRC_LICENSE_MESSAGE);

  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from("veterinarian_verifications")
    .upsert({
      veterinarian_id: veterinarianId,
      status: "Pending Review",
      prc_license_number: value,
      submitted_at: nowIso,
      reviewed_by: null,
      reviewed_at: null,
      rejection_reason: null,
      updated_at: nowIso,
    }, { onConflict: "veterinarian_id" })
    .select(VERIFICATION_FIELDS)
    .single();

  if (error) throw new Error(error.message || "Unable to submit your verification.");
  return data;
}
