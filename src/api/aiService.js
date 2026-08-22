import {
  GROQ_API_KEY,
  GROQ_ENDPOINT,
  GROQ_MODEL,
  isGroqConfigured,
} from "../config/aiConfig";

const SYSTEM_PROMPT = `You are PawCruz Quick Assist, the AI assistant for Cruz Veterinary Clinic.
Give concise, pet-owner-friendly general guidance. Do not claim to diagnose a pet.
For urgent symptoms, advise the owner to contact or visit a veterinarian promptly.
When useful, remind the user that PawCruz Quick Assist does not replace a veterinary consultation.
Use plain text only. Do not use Markdown asterisks, bold markers, or bullet characters made with asterisks.`;



function cleanAiText(value) {
  return String(value || "")
    .replace(/\*/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
function normalizeHistory(history = []) {
  return history
    .filter((item) => item && item.text)
    .slice(-12)
    .map((item) => ({
      role: item.role === "assistant" ? "assistant" : "user",
      content: cleanAiText(item.text),
    }));
}

export async function askPawCruzAI(message, history = []) {
  const question = String(message || "").trim();
  if (!question) throw new Error("Enter a message first.");

  if (!isGroqConfigured()) {
    throw new Error(
      "Groq API key is not configured. Set EXPO_PUBLIC_GROQ_API_KEY in the mobile .env file and restart Expo."
    );
  }

  let response;
  try {
    response = await fetch(GROQ_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        temperature: 0.35,
        max_tokens: 500,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          ...normalizeHistory(history),
          { role: "user", content: question },
        ],
      }),
    });
  } catch (error) {
    throw new Error(
      "Unable to connect to PawCruz AI. Check your internet connection and try again."
    );
  }

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    // handled below
  }

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error("The Groq API key is invalid or missing.");
    }
    if (response.status === 403) {
      throw new Error("The Groq API request is not authorized.");
    }
    if (response.status === 429) {
      throw new Error("PawCruz AI is receiving too many requests. Please try again shortly.");
    }
    throw new Error(
      payload?.error?.message ||
        `PawCruz AI request failed (${response.status}).`
    );
  }

  const content =
    payload?.choices?.[0]?.message?.content ||
    payload?.choices?.[0]?.text ||
    "";

  if (!String(content).trim()) {
    throw new Error("PawCruz AI returned an empty response.");
  }

  return cleanAiText(content);
}


export async function analyzePetHealthRecords(petName, records = []) {
  const safeName = String(petName || "this pet").trim() || "this pet";
  if (!Array.isArray(records) || records.length === 0) {
    throw new Error("No finalized medical records are available for AI health analysis.");
  }

  const summary = records.slice(0, 8).map((record, index) => {
    const parts = [
      `Record ${index + 1}`,
      record.consultation_date ? `Date: ${record.consultation_date}` : null,
      record.chief_complaint ? `Chief complaint: ${record.chief_complaint}` : null,
      record.diagnosis ? `Diagnosis: ${record.diagnosis}` : null,
      (record.treatment || record.treatment_plan) ? `Treatment: ${record.treatment || record.treatment_plan}` : null,
      record.medication ? `Medication: ${record.medication}` : null,
      record.laboratory_result ? `Laboratory result: ${record.laboratory_result}` : null,
      record.vaccination ? `Vaccination: ${record.vaccination}` : null,
      record.veterinarian_notes ? `Veterinarian notes: ${record.veterinarian_notes}` : null,
    ].filter(Boolean);
    return parts.join("\n");
  }).join("\n\n");

  const prompt = `Review the finalized veterinary medical records below for ${safeName}.
Provide a concise owner-friendly health analysis with these sections:
1. Health Summary
2. Important Patterns or Changes
3. Follow-up Reminders
4. Questions to Ask the Veterinarian

Do not diagnose new diseases, do not contradict the veterinarian's recorded diagnosis,
and clearly state that this AI analysis is informational and does not replace a veterinary consultation.

${summary}`;

  return askPawCruzAI(prompt, []);
}

// --- Animal Patient Profile: pet-level AI Predictive Health + per-consultation
// AI Health Insight. Ported from the PawCruz web app's
// generatePredictiveHealthAnalysis / generateConsultationHealthInsight
// (final-vet/src/services/medicalRecordService.js), which share the same
// strict-no-fabrication prompt rules and section headings so the ported
// parseAiReport / parseConsultationInsight (src/utils/predictiveHealthParsing.js)
// work identically on mobile.

function cleanAiResponse(text) {
  if (!text) return "";
  return String(text)
    .normalize("NFKC")
    .replace(/\u00A0/g, " ")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\*\*/g, "")
    .replace(/\*/g, "")
    .replace(/#{1,6}\s*/g, "")
    .replace(/^\s*[-•]\s+/gm, "")
    .replace(/\t/g, " ")
    .replace(/[ ]{2,}/g, " ")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function safe(value, fallback = "Not recorded") {
  if (value === null || value === undefined || String(value).trim() === "") return fallback;
  return String(value).trim();
}

function formatMedicalRecordForAi(record, label = "Medical Record") {
  return `
${label}

Consultation Date: ${safe(record.consultation_date)}

Chief Complaint: ${safe(record.chief_complaint)}

Symptoms: ${safe(record.symptoms)}

Vital Signs: ${safe(record.vital_signs)}

Weight: ${record.weight !== null && record.weight !== undefined ? `${record.weight} kg` : "Not recorded"}

Temperature: ${record.temperature !== null && record.temperature !== undefined ? `${record.temperature} °C` : "Not recorded"}

Diagnosis: ${safe(record.diagnosis)}

Treatment: ${safe(record.treatment)}

Treatment Plan: ${safe(record.treatment_plan)}

Medication: ${safe(record.medication)}

Dosage: ${safe(record.dosage)}

Frequency: ${safe(record.frequency)}

Duration: ${safe(record.duration)}

Laboratory Request: ${safe(record.laboratory_request)}

Laboratory Result: ${safe(record.laboratory_result)}

Vaccination: ${safe(record.vaccination)}

Follow-up Date: ${safe(record.follow_up_date)}

Veterinarian Notes: ${safe(record.veterinarian_notes)}

Record Status: ${safe(record.record_status)}
`;
}

function petInformationBlock(pet = {}) {
  return `
PET INFORMATION

Pet Name: ${safe(pet.pet_name || pet.name)}

Species: ${safe(pet.species)}

Breed: ${safe(pet.breed)}

Sex: ${safe(pet.sex || pet.gender)}

Date of Birth: ${safe(pet.date_of_birth || pet.birth_date)}
`;
}

async function callGroqChat({ systemPrompt, prompt, maxTokens, notConfiguredError, emptyResponseError }) {
  if (!isGroqConfigured()) throw new Error(notConfiguredError);

  let response;
  try {
    response = await fetch(GROQ_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${GROQ_API_KEY}` },
      body: JSON.stringify({
        model: GROQ_MODEL,
        temperature: 0.15,
        max_tokens: maxTokens,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: prompt },
        ],
      }),
    });
  } catch (networkError) {
    throw new Error("Could not reach the AI health analysis service. Check your internet connection and try again.");
  }

  if (!response.ok) {
    if (response.status === 401) throw new Error("The Groq API key is invalid or missing.");
    if (response.status === 403) throw new Error("The AI request is not authorized.");
    if (response.status === 404) throw new Error("The configured AI model is unavailable.");
    if (response.status === 429) throw new Error("The AI health service has reached its request limit. Please wait and try again.");
    throw new Error("Unable to generate the AI health analysis right now.");
  }

  const data = await response.json();
  const text = data?.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error(emptyResponseError);
  return cleanAiResponse(text);
}

// Pet-level analysis across the pet's complete finalized consultation
// history (latest first). Adapted from the web's per-record version to be
// per-pet, since the mobile AI Predictive Health tab is scoped to a whole
// Animal Patient rather than one consultation.
export async function generatePredictiveHealthAnalysisForPet(pet, records = []) {
  if (!records.length) {
    throw new Error("No finalized medical records are available for predictive health analysis.");
  }

  const capped = records.slice(0, 15);
  const historyText = capped
    .map((record, index) => formatMedicalRecordForAi(record, `CONSULTATION ${index + 1} of ${capped.length} (most recent first)`))
    .join("\n");

  const prompt = `
You are the AI Predictive Health Analysis assistant for PawCruz Veterinary Clinic.

Analyze ONLY the medical information supplied below for this one pet's complete finalized consultation history, ordered from most recent to oldest.

Your job is to identify medically relevant patterns across these records and provide decision-support information.

This is NOT an independent diagnosis system.

STRICT RULES

Use only the supplied medical record data.

Do not invent symptoms, diagnoses, laboratory values, medications, diseases, causes, probabilities, percentages, or medical history.

Do not state that a pet definitely has or will develop a disease unless a veterinarian's record already states that diagnosis.

Do not replace the veterinarian's diagnosis.

Do not recommend changing or stopping prescribed medication.

Do not prescribe new medication or dosage.

If the available information is insufficient, clearly say that more clinical information may be needed.

Distinguish information directly recorded by the veterinarian from AI-observed patterns.

Compare consultations with each other and identify recurring complaints, diagnoses, medications, laboratory findings, weight changes, temperature changes, or follow-up patterns only when the supplied records support them.

If only one consultation is available, explain that the analysis is based only on that single consultation and therefore cannot establish a long-term health trend.

Do not use markdown.

Do not use asterisks.

Do not use hashtags.

Do not use markdown tables.

Use professional but understandable language.

${petInformationBlock(pet)}

CONSULTATION HISTORY (MOST RECENT FIRST, ${capped.length} FINALIZED CONSULTATION${capped.length === 1 ? "" : "S"})

${historyText}

Write the analysis using exactly these section headings:

CLINICAL RECORD SUMMARY

Summarize the important information documented across this pet's consultation history. Focus on the complaint, symptoms, veterinarian diagnosis, treatment, medication, laboratory findings, vital signs, and follow-up information that are actually present.

OBSERVED HEALTH PATTERNS

Compare the consultations with each other. Identify recurring or changing health information only if supported by the records. If historical information is insufficient, clearly state that no reliable long-term pattern can yet be identified.

POTENTIAL HEALTH RISKS TO MONITOR

Identify possible areas that may deserve monitoring based on the recorded symptoms, diagnosis, laboratory results, repeated conditions, or changes across consultations. Use cautious wording such as may, could, warrants monitoring, or should be reviewed. Do not present a possible risk as a confirmed diagnosis.

FOLLOW-UP CONSIDERATIONS

Identify relevant follow-up considerations based on the veterinarian's treatment plans, follow-up dates, laboratory requests, medication, and history. Do not create a new treatment plan.

SUGGESTED CLINICAL ACTIONS

Provide 3 to 5 practical decision-support actions. These actions may include reviewing a repeated symptom, checking requested laboratory results, monitoring documented changes, following the veterinarian's scheduled follow-up, or comparing the next consultation with previous findings. Do not prescribe treatment.

Finish with this exact statement:

AI predictive health analysis is based only on available PawCruz medical records and is intended to support, not replace, the veterinarian's diagnosis, treatment decisions, or clinical judgment.
`;

  return callGroqChat({
    systemPrompt:
      "You are a veterinary clinical decision-support assistant. Analyze only the supplied pet medical records, identify documented patterns carefully, never fabricate medical information, and never replace a veterinarian's clinical judgment. Do not use markdown or asterisks.",
    prompt,
    maxTokens: 1500,
    notConfiguredError: "Groq API key is not configured. Set EXPO_PUBLIC_GROQ_API_KEY in the mobile .env file and restart Expo.",
    emptyResponseError: "The AI predictive health analysis returned an empty response.",
  });
}

// Per-consultation AI Health Insight shown inside each Medical History card.
// Ported ~verbatim from the web (same prompt, same section headings) so
// parseConsultationInsight works unchanged. Nothing here is persisted.
export async function generateConsultationHealthInsight(record, previousRecords = []) {
  if (!record?.id) {
    throw new Error("A finalized consultation is required for an AI health insight.");
  }

  const consultationText = formatMedicalRecordForAi(record, "THIS CONSULTATION");
  const historyText = previousRecords.length
    ? previousRecords.map((previous, index) => formatMedicalRecordForAi(previous, `PREVIOUS FINALIZED CONSULTATION ${index + 1}`)).join("\n")
    : "No previous finalized consultations are available for this pet.";

  const prompt = `
You are the AI Predictive Health Analysis assistant for PawCruz Veterinary Clinic.

Analyze ONLY the information supplied below for this ONE consultation. Previous finalized consultations are supplied only for the comparison section -- everything else must describe this consultation alone. Long-term or recurring pattern analysis across the pet's full history is handled separately and is not your job here.

This is NOT an independent diagnosis system.

STRICT RULES

Use only the supplied medical record data and the pet's basic profile (age/date of birth, breed, weight).

Do not invent symptoms, diagnoses, laboratory values, medications, diseases, causes, probabilities, percentages, or medical history that are not present in what is supplied.

Do not state that a pet definitely has or will develop a disease unless the veterinarian's record already states that diagnosis.

Do not replace the veterinarian's diagnosis.

Do not recommend changing or stopping prescribed medication.

Do not prescribe new medication or dosage.

If the available information is insufficient for a section, clearly say so instead of guessing.

When comparing with previous consultations, reference only information present in the supplied previous records. If none were supplied, say there are no previous finalized consultations to compare.

Do not use markdown.

Do not use asterisks.

Do not use hashtags.

Do not use markdown tables.

Use professional but understandable language.

${petInformationBlock(record.pet)}

${consultationText}

PREVIOUS FINALIZED CONSULTATIONS

${historyText}

Write the analysis using exactly these section headings:

CONSULTATION RISK LEVEL

State exactly one word on its own line: Low, Moderate, or High. Base this only on the severity and combination of findings recorded in this consultation.

RECORDED HEALTH FINDINGS

List the symptoms, vital signs, diagnosis, and laboratory results actually documented in this consultation.

POTENTIAL HEALTH RISKS TO MONITOR

Identify possible risks suggested by this consultation's own findings. Use cautious wording such as may, could, warrants monitoring. Do not present a possible risk as a confirmed diagnosis.

WARNING SIGNS

List specific signs the pet owner or clinic staff should watch for that would indicate this condition is worsening, based only on what was recorded in this consultation.

RECOMMENDED MONITORING AND FOLLOW-UP

Provide practical, decision-support monitoring and follow-up steps based on this consultation's treatment plan, medication, and follow-up date. Do not create a new treatment plan.

COMPARISON WITH PREVIOUS CONSULTATIONS

If previous finalized consultations were supplied, compare this visit's findings with them and note anything recurring or new. If none were supplied, state plainly that there are no previous finalized consultations to compare.

Finish with this exact statement:

This AI health insight is based only on this consultation's recorded information and is intended to support, not replace, the veterinarian's diagnosis, treatment decisions, or clinical judgment.
`;

  return callGroqChat({
    systemPrompt:
      "You are a veterinary clinical decision-support assistant. Analyze only the supplied single consultation record, never fabricate medical information, and never replace a veterinarian's clinical judgment. Do not use markdown or asterisks.",
    prompt,
    maxTokens: 900,
    notConfiguredError: "Groq API key is not configured. Set EXPO_PUBLIC_GROQ_API_KEY in the mobile .env file and restart Expo.",
    emptyResponseError: "The AI health insight returned an empty response.",
  });
}

export async function analyzeVeterinaryHealthRecords(petName, records = []) {
  const safeName = String(petName || "this patient").trim() || "this patient";
  if (!Array.isArray(records) || records.length === 0) {
    throw new Error("No medical records are available for predictive health analysis.");
  }

  const summary = records.slice(0, 12).map((record, index) => [
    `Record ${index + 1}`,
    record.consultation_date ? `Date: ${record.consultation_date}` : null,
    record.chief_complaint ? `Chief complaint: ${record.chief_complaint}` : null,
    record.symptoms ? `Symptoms: ${record.symptoms}` : null,
    record.weight != null ? `Weight: ${record.weight} kg` : null,
    record.temperature != null ? `Temperature: ${record.temperature} C` : null,
    record.diagnosis ? `Diagnosis: ${record.diagnosis}` : null,
    (record.treatment || record.treatment_plan) ? `Treatment: ${record.treatment || record.treatment_plan}` : null,
    record.medication ? `Medication: ${record.medication}` : null,
    record.laboratory_result ? `Laboratory result: ${record.laboratory_result}` : null,
    record.vaccination ? `Vaccination: ${record.vaccination}` : null,
    record.follow_up_date ? `Follow-up: ${record.follow_up_date}` : null,
    record.veterinarian_notes ? `Veterinarian notes: ${record.veterinarian_notes}` : null,
  ].filter(Boolean).join("\n")).join("\n\n");

  const prompt = `Act as a veterinary clinical decision-support assistant. Review the longitudinal records for ${safeName} and provide:
1. Clinical Summary
2. Trends and Changes Over Time
3. Predictive Risk Signals to Monitor
4. Follow-up and Test Considerations
5. Missing Data or Questions for the Next Visit

Base every observation only on the supplied records. Do not create a new diagnosis, certainty, or treatment order. Clearly distinguish recorded facts from possible risk signals and state that veterinarian judgment is required.

${summary}`;

  return askPawCruzAI(prompt, []);
}
