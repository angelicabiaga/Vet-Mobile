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
