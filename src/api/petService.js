import { supabase } from "../config/supabaseClient";

const MONTH_NAMES = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December"
];

const PET_FIELDS = "id,owner_id,pet_name,species,breed,sex,date_of_birth,weight,color,microchip_number,allergies,existing_conditions,notes,photo_url,is_archived,created_at,updated_at";

function toUiPet(row) {
  if (!row) return null;
  const birth = row.date_of_birth ? new Date(`${row.date_of_birth}T00:00:00`) : null;
  return {
    id: row.id,
    referenceCode: `PET-${String(row.id || "").slice(0, 8).toUpperCase()}`,
    name: row.pet_name || "",
    breed: row.breed || "",
    species: row.species || "",
    birthMonth: birth && !Number.isNaN(birth.getTime()) ? MONTH_NAMES[birth.getMonth()] : "",
    birthDay: birth && !Number.isNaN(birth.getTime()) ? String(birth.getDate()) : "",
    birthYear: birth && !Number.isNaN(birth.getTime()) ? String(birth.getFullYear()) : "",
    weight: row.weight == null ? "" : String(row.weight),
    sex: row.sex || "Unknown",
    color: row.color || "",
    specialMarkings: row.notes || "",
    profileImageUri: row.photo_url || "",
    profileImageKey: "petBadge",
    medicalHistory: [],
    vaccinations: [],
    visits: [],
    microchipNumber: row.microchip_number || "",
    allergies: row.allergies || "",
    existingConditions: row.existing_conditions || "",
    notes: row.notes || "",
    isArchived: Boolean(row.is_archived),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toDateOfBirth(pet) {
  if (!pet?.birthYear || !pet?.birthMonth || !pet?.birthDay) return null;
  const month = MONTH_NAMES.indexOf(pet.birthMonth);
  if (month < 0) return null;
  const yyyy = String(pet.birthYear).padStart(4, "0");
  const mm = String(month + 1).padStart(2, "0");
  const dd = String(pet.birthDay).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export async function getOwnerPets(ownerId, { includeArchived = false } = {}) {
  if (!ownerId) return [];
  let query = supabase
    .from("pets")
    .select(PET_FIELDS)
    .eq("owner_id", ownerId)
    .order("pet_name", { ascending: true });

  if (!includeArchived) query = query.eq("is_archived", false);

  const { data, error } = await query;
  if (error) throw new Error(error.message || "Unable to load your pets.");
  return (data || []).map(toUiPet);
}

export async function getOwnerPet(petId, ownerId) {
  if (!petId) return null;
  let query = supabase.from("pets").select(PET_FIELDS).eq("id", petId);
  if (ownerId) query = query.eq("owner_id", ownerId);
  const { data, error } = await query.maybeSingle();
  if (error) throw new Error(error.message || "Unable to load pet profile.");
  return toUiPet(data);
}

async function uploadPhotoIfNeeded(uri, ownerId) {
  if (!uri || /^https?:\/\//i.test(uri)) return uri || null;
  if (!ownerId) return null;

  const response = await fetch(uri);
  const blob = await response.blob();
  const extMatch = String(uri).match(/\.([a-zA-Z0-9]+)(?:\?|$)/);
  const ext = extMatch?.[1] || "jpg";
  const path = `${ownerId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

  const { error } = await supabase.storage
    .from("pet-photos")
    .upload(path, blob, { upsert: false, contentType: blob.type || `image/${ext}` });

  if (error) throw new Error(error.message || "Unable to upload pet photo.");
  return supabase.storage.from("pet-photos").getPublicUrl(path).data.publicUrl;
}

async function writePetActivity(ownerId, action, description) {
  if (!ownerId) return;
  try {
    await supabase.from("activity_logs").insert({
      user_id: ownerId,
      role: "pet_owner",
      action,
      module: "Pet Management",
      description,
    });
  } catch (error) {
    console.warn("Pet activity log was not saved:", error?.message || error);
  }
}

export async function saveOwnerPet(pet, ownerId) {
  if (!ownerId) throw new Error("Your login session is incomplete.");
  const name = String(pet?.name || "").trim();
  const species = String(pet?.species || "").trim();
  if (!name || !species) throw new Error("Pet name and species are required.");

  const photoUrl = await uploadPhotoIfNeeded(pet?.profileImageUri, ownerId);

  const row = {
    owner_id: ownerId,
    pet_name: name,
    species,
    breed: String(pet?.breed || "").trim() || null,
    sex: pet?.sex || "Unknown",
    date_of_birth: toDateOfBirth(pet),
    weight: pet?.weight ? Number(String(pet.weight).replace(/[^0-9.]/g, "")) : null,
    color: String(pet?.color || "").trim() || null,
    microchip_number: String(pet?.microchipNumber || "").trim() || null,
    allergies: String(pet?.allergies || "").trim() || null,
    existing_conditions: String(pet?.existingConditions || "").trim() || null,
    notes: String(pet?.notes || pet?.specialMarkings || "").trim() || null,
    photo_url: photoUrl,
  };

  let result;
  if (pet?.id && !String(pet.id).startsWith("pet-")) {
    result = await supabase
      .from("pets")
      .update(row)
      .eq("id", pet.id)
      .eq("owner_id", ownerId)
      .select(PET_FIELDS)
      .single();
  } else {
    result = await supabase.from("pets").insert(row).select(PET_FIELDS).single();
  }

  if (result.error) {
    if (result.error.code === "23505") throw new Error("That microchip number is already registered.");
    throw new Error(result.error.message || "Unable to save pet.");
  }

  const saved = toUiPet(result.data);
  await writePetActivity(
    ownerId,
    pet?.id && !String(pet.id).startsWith("pet-") ? "Pet profile updated" : "Pet profile created",
    `${saved.name || "Pet"} profile ${pet?.id && !String(pet.id).startsWith("pet-") ? "updated" : "created"} from the mobile app.`
  );
  return saved;
}

export function subscribeToOwnerPets(ownerId, onChange) {
  if (!ownerId) return null;
  return supabase
    .channel(`pawcruz-mobile-owner-pets-${ownerId}-${Date.now()}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "pets", filter: `owner_id=eq.${ownerId}` },
      onChange
    )
    .subscribe();
}

export async function loadPetOwnerDashboard(ownerId) {
  if (!ownerId) {
    return { pets: [], appointments: [], medicalRecords: [], queues: [], activityLogs: [] };
  }

  async function safeDashboardQuery(label, query) {
    try {
      const { data, error } = await query;
      if (error) {
        console.warn(`Dashboard ${label} query skipped:`, error.code, error.message);
        return [];
      }
      return data || [];
    } catch (error) {
      console.warn(`Dashboard ${label} query failed:`, error?.message || error);
      return [];
    }
  }

  const [pets, appointments, medicalRecords, queues, activityLogs] = await Promise.all([
    safeDashboardQuery(
      "pets",
      supabase
        .from("pets")
        .select("id,pet_name,species,breed,photo_url,is_archived,created_at")
        .eq("owner_id", ownerId)
        .eq("is_archived", false)
        .order("created_at", { ascending: false })
    ),
    safeDashboardQuery(
      "appointments",
      supabase
        .from("appointments")
        .select("id,pet_id,appointment_date,start_time,status,visit_reason,created_at")
        .eq("owner_id", ownerId)
        .order("appointment_date", { ascending: false })
        .limit(100)
    ),
    safeDashboardQuery(
      "medical records",
      supabase
        .from("medical_records")
        .select("id,pet_id,consultation_date,diagnosis,record_status,created_at")
        .eq("owner_id", ownerId)
        .eq("record_status", "Finalized")
        .order("consultation_date", { ascending: false })
        .limit(100)
    ),
    safeDashboardQuery(
      "queue",
      supabase
        .from("queue_entries")
        .select("id,queue_number,status,pet_id,created_at")
        .eq("owner_id", ownerId)
        .order("created_at", { ascending: false })
        .limit(50)
    ),
    safeDashboardQuery(
      "activity",
      supabase
        .from("activity_logs")
        .select("id,user_id,action,module,description,created_at")
        .eq("user_id", ownerId)
        .order("created_at", { ascending: false })
        .limit(8)
    ),
  ]);

  return { pets, appointments, medicalRecords, queues, activityLogs };
}

export function subscribeToPetOwnerDashboard(ownerId, onChange) {
  if (!ownerId) return [];

  const ownerTables = ["pets", "appointments", "medical_records", "queue_entries"];
  const channels = ownerTables.map((table) =>
    supabase
      .channel(`pawcruz-mobile-dashboard-${table}-${ownerId}-${Date.now()}-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table,
          filter: `owner_id=eq.${ownerId}`,
        },
        onChange
      )
      .subscribe()
  );

  channels.push(
    supabase
      .channel(`pawcruz-mobile-dashboard-activity-${ownerId}-${Date.now()}-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "activity_logs",
          filter: `user_id=eq.${ownerId}`,
        },
        onChange
      )
      .subscribe()
  );

  return channels;
}

export function unsubscribeChannels(channels = []) {
  channels.forEach((channel) => {
    if (channel) supabase.removeChannel(channel);
  });
}
