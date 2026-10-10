import { supabase } from "../config/supabaseClient";
import { GROQ_API_KEY, GROQ_ENDPOINT, GROQ_MODEL, isGroqConfigured } from "../config/aiConfig";

// PawCruz Pet Care Assistant (Quick Assist). Ported from the web app's
// chatbotService.js + ChatBot.jsx so both give the same answers: Groq replies
// as JSON with an urgency and a suggested next step, common clinic questions
// are answered locally, and built-in guidance answers when the AI can't be
// reached.

const URGENCIES = ["emergency", "same_day", "routine", "unknown"];
const ACTIONS = ["emergency_vet", "contact_clinic", "book_appointment", "none"];

export const SUGGESTED_PROMPTS = [
  "My dog has no appetite. What should I check?",
  "What are your clinic hours?",
  "How do I book an appointment?",
  "What warning signs need urgent veterinary care?",
];

const SYSTEM_PROMPT = `You are the PawCruz Pet Care Assistant for Cruz Veterinary Clinic (PawCruz), chatting with a pet owner in the PawCruz app.

Clinic facts:
- Open every day, 9:00 AM to 7:00 PM.
- Owners book a General Consultation from the Book Appointment page (choose the pet, date, an available time, then the veterinarian).
- My Queue shows their queue number on the visit day; Animal Patients shows each pet's records and vaccinations.

How to answer (in this order):
1. ANSWER FIRST. Every understandable pet question gets a direct, useful answer in the first sentence or two: what the sign usually means and the common possible causes. Never reply with only questions.
2. Give safe, practical home-care guidance the owner can do now (water, rest, bland diet, monitoring, keeping the pet calm, etc.).
3. Name the warning signs that mean the pet should see a vet, and say how soon.
4. Only then, if something important is still unknown, ask at most one or two short follow-up questions. Never ask for anything the conversation or the pet details below already tell you.

Use the conversation:
- Read the whole conversation. The same pet name always means the same pet. Remember every symptom the owner already mentioned (for example vomiting earlier and wet stool now) and consider them together.
- Facts the owner gave (species, age, "Hoshi is a dog") stay true for the rest of the chat. Do not ask them again.
- If the owner has now reported both vomiting and loose/watery stool (in any messages), say that explicitly ("since Hoshi is also vomiting...") and advise contacting a veterinarian promptly, the same day; puppies, kittens and small pets dehydrate quickly.
- If the owner's registered pets are listed below and the owner names one, use that pet's details instead of asking. If no pet or species is known, still answer for dogs and cats in general and ask which animal it is.

Language:
- Understand simple English, Tagalog, Taglish, informal grammar and spelling mistakes (e.g. "poop wet" = loose stool / possible diarrhea, "vomit hair" = likely hairballs, "ayaw kumain" = not eating, "nagsusuka" = vomiting, "nagtatae" = diarrhea, "di makahinga" = trouble breathing).
- Reply in the same language style the owner used (English, or natural Taglish if they wrote in Tagalog/Taglish).

Safety:
- You are not a veterinarian and cannot examine the pet. Say "may" / "possible", never a definite diagnosis.
- Never give medicine names with doses, and never suggest human medicines (paracetamol, ibuprofen, aspirin and similar are dangerous for pets).
- Emergencies (trouble breathing, collapse, seizures, suspected poisoning, heavy bleeding, bloated or hard belly, straining to urinate with nothing coming out, heat stroke, hit by a vehicle, repeated vomiting together with diarrhea, signs of dehydration, cannot keep water down): say clearly to go to a veterinarian or emergency clinic now, then give brief first steps.
- In an emergency, do not describe first-aid procedures (Heimlich, CPR, giving oxygen, inducing vomiting) and do not mention 911; tell them to go to the nearest veterinary or emergency clinic now.
- Do not treat ordinary questions (feeding, grooming, mild itching, one-time vomiting) as emergencies.
- Do not give exact food amounts without knowing the pet's weight; say to follow the food label for their weight.
- Never ask for the pet's name, and never ask something that does not change your advice.
- Only answer about pets, pet care and the clinic. For anything else, politely say you can only help with pet care and PawCruz.

Style: friendly and plain, about 80 to 150 words, short paragraphs, "- " for lists. Plain text only: no markdown, no asterisks, no headings.

Respond with ONLY a JSON object, no other text:
{"reply": "<your message to the owner>", "urgency": "emergency" | "same_day" | "routine" | "unknown", "suggestedAction": "emergency_vet" | "contact_clinic" | "book_appointment" | "none"}
urgency: emergency = needs a vet right now; same_day = should be seen or call the clinic today; routine = can wait for a normal appointment; unknown = not a health question.
suggestedAction: emergency_vet for emergencies, contact_clinic when they should call the clinic, book_appointment when a normal visit makes sense, none otherwise.`;

function createError(message, code) {
  const error = new Error(message);
  error.code = code;
  return error;
}

// Common clinic questions answered right away, without the AI (web getLocalReply).
export function getLocalReply(message) {
  const text = String(message || "").toLowerCase();

  const asksAboutClinicHours =
    text.includes("clinic hours") ||
    text.includes("opening hours") ||
    text.includes("closing hours") ||
    /what time.+(open|close)/.test(text) ||
    /when (is|are).+(open|closed)/.test(text) ||
    /\b(?:are you|is the clinic|is pawcruz) open\b/.test(text) ||
    /\bopen on (?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/.test(text);
  if (asksAboutClinicHours) {
    return {
      reply: "Cruz Veterinary Clinic is open Monday through Sunday, from 9:00 AM to 7:00 PM. You can book a visit any day that works for you.",
      urgency: "routine",
      suggestedAction: "book_appointment",
    };
  }

  if (
    text.includes("book an appointment") ||
    text.includes("book appointment") ||
    text.includes("make an appointment") ||
    text.includes("schedule an appointment") ||
    text.includes("schedule a visit") ||
    /\b(?:can i |could i )?(?:get|book|make|schedule) (?:an? )?appointment\b/.test(text)
  ) {
    return {
      reply: "You can schedule a General Consultation from the Book Appointment page. Choose your registered pet, appointment date, an available time, and then a veterinarian who is free at that time.",
      urgency: "routine",
      suggestedAction: "book_appointment",
    };
  }

  if (
    text.includes("what should i bring") ||
    text.includes("what do i bring") ||
    /bring.+(appointment|visit)/.test(text) ||
    /prepare.+(appointment|visit)/.test(text) ||
    text.includes("first visit")
  ) {
    return {
      reply: "Please bring any previous medical or vaccination records, a list of current medicines, and your pet's usual leash or carrier. It also helps to note any recent changes in behavior or appetite.",
      urgency: "routine",
      suggestedAction: "none",
    };
  }

  if (
    text.includes("medical record") ||
    text.includes("health record") ||
    text.includes("visit history") ||
    text.includes("vaccination record") ||
    text.includes("past visit") ||
    text.includes("previous visit")
  ) {
    return {
      reply: "Open Animal Patients from the menu and select your pet to review its available visit history, diagnoses, treatments, and vaccination information.",
      urgency: "routine",
      suggestedAction: "none",
    };
  }

  if (
    text.includes("my queue") ||
    text.includes("clinic queue") ||
    text.includes("queue position") ||
    text.includes("waiting list") ||
    /\bhow many (?:people|pets|patients) are ahead of me\b/.test(text) ||
    /\bwhere am i in (?:the )?queue\b/.test(text)
  ) {
    return {
      reply: "You can check your current position and queue updates from My Queue in the menu.",
      urgency: "routine",
      suggestedAction: "none",
    };
  }

  return null;
}

const EMERGENCY_PATTERN = /(?:cannot|can't|cant|difficulty|trouble|hard|not|struggling to).*(?:breathe|breathing)|di makahinga|hindi makahinga|nahihirapan(?:g)? huminga|seizure|kombulsyon|nangingisay|collapsed|collapse|unconscious|walang malay|poison|toxin|nalason|lason|severe bleeding|bleeding (?:a lot|heavily)|duguan|bloated (?:abdomen|belly|stomach)|hit by a (?:car|vehicle)|nasagasaan|heat ?stroke|can't keep water down|cannot keep water down|(?:vomit|suka)[\s\S]*(?:diarrh|tae|loose stool|wet (?:poop|stool))[\s\S]*(?:again|repeated|many times|paulit|ilang beses)/;

// Built-in guidance: used without an API key or when the AI is unreachable,
// and as a safety net so emergency wording is never under-triaged. Like the
// AI, it answers first and only then asks what it still needs.
function getOfflineReply(message) {
  const text = message.toLowerCase();

  if (EMERGENCY_PATTERN.test(text)) {
    return {
      reply: "This may be an emergency. Please take your pet to the nearest veterinary or emergency clinic now. Keep your pet calm and comfortable, do not give food or human medicine, and bring any suspected poison or its packaging with you.",
      urgency: "emergency",
      suggestedAction: "emergency_vet",
    };
  }

  if (/(?:no|lost|loss of|poor|decreased).*(?:appetite)|(?:not|won't|will not|doesn't|does not).*(?:eat|eating)|ayaw (?:na )?(?:kumain|kain)|hindi kumakain/.test(text)) {
    return {
      reply: "Not wanting to eat can come from stress, a food change, an upset stomach, dental pain, or an illness that needs a vet. Offer fresh water and their usual food in small amounts, and do not force-feed or give human medicine. See a vet within a day if it lasts more than 24 hours (12 hours for puppies, kittens or small pets), or sooner if there is vomiting, diarrhea, weakness or pain. Is your pet still drinking water?",
      urgency: "same_day",
      suggestedAction: "contact_clinic",
    };
  }

  if (/(?:human medicine|paracetamol|acetaminophen|ibuprofen|aspirin|medicine dose|dosage|gamot)/.test(text)) {
    return {
      reply: "Please do not give human medicine or guess a dose. Some common medicines are toxic to pets, and the safe treatment depends on species, weight, age, and health history. A veterinarian can recommend what is safe for your pet.",
      urgency: "same_day",
      suggestedAction: "contact_clinic",
    };
  }

  if (/(?:vomit|throw(?:ing)? up|suka)[^.]*(?:hair|fur|balahibo)|hair ?ball/.test(text)) {
    return {
      reply: "Vomiting hair is usually a hairball, which is common in cats, especially long-haired ones. Brushing your cat often, keeping them well hydrated, and a hairball-control diet can help. See a vet if your cat vomits often, keeps retching without bringing anything up, stops eating, is constipated, or seems weak, because that can mean a blockage. How often has this been happening?",
      urgency: "routine",
      suggestedAction: "book_appointment",
    };
  }

  const loose = /(?:diarrh|loose (?:stool|poop)|(?:wet|watery|soft|basa|malabnaw) (?:poop|stool|tae|dumi)|(?:poop|stool|tae|dumi)\s+(?:is |are )?(?:wet|watery|soft|basa|malabnaw)|nagtatae|pagtatae)/.test(text);
  const vomit = /(?:vomit|throw(?:ing)? up|suka|nagsusuka)/.test(text);
  if (loose || vomit) {
    const what = loose && vomit ? "Vomiting together with loose stool" : loose ? "Watery or loose stool may mean diarrhea, which" : "Vomiting";
    return {
      reply: `${what} can happen with a sudden food change, eating something unusual, intestinal parasites, an infection, or another digestive problem. Keep fresh water available, offer small bland meals, and watch closely. Go to a vet today if it keeps happening, if there is blood, weakness, refusal to drink or signs of dehydration, or if vomiting and diarrhea happen together. Is your pet still eating and drinking normally?`,
      urgency: "same_day",
      suggestedAction: "contact_clinic",
    };
  }

  if (/(?:itch|itchy|scratch|skin rash|hot spot|kati|kamot)/.test(text)) {
    return {
      reply: "Scratching is often caused by fleas or ticks, allergies (food or environment), dry skin, or a skin infection. Check the fur for fleas, redness, wounds or hair loss, keep up with flea and tick prevention, and stop excessive licking if you can do so safely. Book a vet visit if it lasts more than a few days, spreads, bleeds, or affects sleep or appetite. Do you see fleas or any red spots?",
      urgency: "routine",
      suggestedAction: "book_appointment",
    };
  }

  if (/(?:feed|food|diet|pakain|pagkain)/.test(text)) {
    return {
      reply: "Feed a complete pet food made for your pet's species and age, in the amount on the label for their weight, split into regular meals, with fresh water always available. If your pet has an upset stomach, small bland meals for a day or two are gentler. Avoid chocolate, onions, garlic, grapes or raisins, xylitol, cooked bones and very fatty or salty food. Which pet is it for, and how old are they?",
      urgency: "routine",
      suggestedAction: "none",
    };
  }

  return {
    reply: "I can give general pet-care guidance. Tell me what is happening with your pet (for example the main symptom and when it started), and I will explain what it may mean and what you can do. A veterinarian should examine anything urgent, severe or persistent.",
    urgency: "unknown",
    suggestedAction: "none",
  };
}

function ageText(dateOfBirth) {
  if (!dateOfBirth) return "";
  const born = new Date(`${dateOfBirth}T00:00:00`);
  if (Number.isNaN(born.getTime())) return "";
  const months = Math.max(0, Math.floor((Date.now() - born.getTime()) / (30.44 * 24 * 3600 * 1000)));
  return months >= 24 ? `${Math.floor(months / 12)} years` : `${months} months`;
}

// The owner's own registered pets (only theirs: filtered by owner_id), so the
// assistant can recognise "Hoshi" and skip questions it already knows the
// answer to. The pet the owner named gets its recent finalized visits too.
async function getPetContext(ownerId, focusPetId) {
  if (!ownerId) return "";
  try {
    const { data: pets } = await supabase
      .from("pets")
      .select("id, pet_name, species, breed, sex, date_of_birth, weight, allergies, existing_conditions, is_archived")
      .eq("owner_id", ownerId)
      .limit(30);
    const active = (pets || []).filter((pet) => !pet.is_archived);
    if (!active.length) return "";

    const describe = (pet) => [
      pet.species && `species: ${pet.species}`,
      pet.breed && `breed: ${pet.breed}`,
      pet.sex && pet.sex !== "Unknown" && `sex: ${pet.sex}`,
      ageText(pet.date_of_birth) && `age: about ${ageText(pet.date_of_birth)}`,
      pet.weight && `weight: ${pet.weight} kg`,
      pet.allergies && `allergies: ${pet.allergies}`,
      pet.existing_conditions && `existing conditions: ${pet.existing_conditions}`,
    ].filter(Boolean).join(", ");

    const lines = ["The owner's registered pets (use these details; do not ask for them again):"];
    active.forEach((pet) => lines.push(`- ${pet.pet_name || "Unnamed pet"}: ${describe(pet) || "no details recorded"}`));

    const focus = active.find((pet) => String(pet.id) === String(focusPetId || ""));
    if (focus) {
      const { data: records } = await supabase
        .from("medical_records")
        .select("consultation_date, chief_complaint, diagnosis, treatment")
        .eq("pet_id", focus.id)
        .eq("owner_id", ownerId)
        .eq("record_status", "Finalized")
        .order("consultation_date", { ascending: false })
        .limit(3);
      const visits = (records || [])
        .map((r) => [r.consultation_date, r.chief_complaint && `complaint: ${r.chief_complaint}`, r.diagnosis && `diagnosis: ${r.diagnosis}`, r.treatment && `treatment: ${r.treatment}`].filter(Boolean).join("; "))
        .filter(Boolean);
      lines.push(`The owner is asking about ${focus.pet_name}.`);
      if (visits.length) lines.push(`${focus.pet_name}'s recent clinic visits (newest first):`, ...visits.map((v) => `- ${v}`));
    }
    return lines.join("\n");
  } catch {
    return "";
  }
}

// Symptoms the owner has already reported in this chat, worked out from their
// own messages so the assistant can't "forget" them and ask again.
const SYMPTOM_PATTERNS = [
  ["vomiting", /(?:vomit|throw(?:ing)? up|threw up|suka|nagsusuka)/],
  ["loose or watery stool (possible diarrhea)", /(?:diarrh|loose (?:stool|poop)|(?:wet|watery|soft|basa|malabnaw) (?:poop|stool|tae|dumi)|(?:poop|stool|tae|dumi)\s+(?:is |are )?(?:wet|watery|soft|basa|malabnaw)|nagtatae|pagtatae)/],
  ["not eating / poor appetite", /(?:no|lost|loss of|poor|decreased)\s+appetite|(?:not|won't|will not|doesn't|does not)\s+(?:eat|eating)|ayaw (?:na )?(?:kumain|kain)|hindi kumakain/],
  ["itching or scratching", /(?:itch|scratch|kati|kamot)/],
  ["coughing or sneezing", /(?:cough|sneez|ubo|bahing)/],
  ["low energy / weakness", /(?:lethargic|lethargy|weak|tired|matamlay|nanghihina)/],
  ["blood in vomit or stool", /(?:blood|bloody|dugo)/],
];

function reportedSymptoms(history) {
  const said = history.filter((m) => m.role === "user").map((m) => m.content.toLowerCase()).join(" \n ");
  return SYMPTOM_PATTERNS.filter(([, pattern]) => pattern.test(said)).map(([label]) => label);
}

// Plain text for the chat bubble: no markdown symbols the model may add.
function cleanReply(text) {
  return String(text || "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/(^|\s)\*(\S.*?)\*(?=\s|$)/g, "$1$2")
    .replace(/^#{1,6}\s*/gm, "")
    .replace(/^\s*[*•]\s+/gm, "- ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// The model answers with a JSON object; fall back to its plain text if not.
function parseModelOutput(content) {
  const raw = String(content || "").trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start !== -1 && end > start) {
    try {
      const parsed = JSON.parse(raw.slice(start, end + 1));
      if (parsed && typeof parsed.reply === "string" && parsed.reply.trim()) {
        return {
          reply: cleanReply(parsed.reply),
          urgency: URGENCIES.includes(parsed.urgency) ? parsed.urgency : "unknown",
          suggestedAction: ACTIONS.includes(parsed.suggestedAction) ? parsed.suggestedAction : "none",
        };
      }
    } catch {
      // Not valid JSON: use the text as it is.
    }
  }
  return raw ? { reply: cleanReply(raw), urgency: "unknown", suggestedAction: "none" } : null;
}

async function callGroq(messages, jsonMode) {
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
        messages,
        temperature: 0.3,
        max_tokens: 1200,
        ...(jsonMode ? { response_format: { type: "json_object" } } : {}),
      }),
    });
  } catch {
    throw createError("Could not reach the pet care assistant. Check your internet connection and try again.", "NETWORK_ERROR");
  }

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw createError("The pet care assistant isn't set up correctly (AI key). Please tell the clinic.", "PROVIDER_AUTH");
    }
    if (response.status === 429) {
      throw createError("The pet care assistant is busy right now. Please wait a moment and try again.", "RATE_LIMITED");
    }
    // e.g. the model couldn't produce valid JSON: the caller retries as text.
    if (response.status === 400) throw createError("bad request", "BAD_REQUEST");
    throw createError("The pet care assistant is temporarily unavailable. Please try again later.", "PROVIDER_UNAVAILABLE");
  }

  const data = await response.json();
  return data?.choices?.[0]?.message?.content || "";
}

// messages: [{ role: "user" | "assistant", content }], oldest first.
// Returns { reply, urgency, suggestedAction }.
export async function askPetAssistant({ messages, petId = null, ownerId = null }) {
  const history = (Array.isArray(messages) ? messages : [])
    .filter((message) => ["user", "assistant"].includes(message?.role) && String(message.content || "").trim())
    .map((message) => ({ role: message.role, content: String(message.content).slice(0, 2000) }))
    .slice(-16);
  const latestUserMessage = history.filter((message) => message.role === "user").map((message) => message.content).pop();

  if (!latestUserMessage) {
    throw createError("Please enter a question for the pet care assistant.", "INVALID_REQUEST");
  }

  const offline = getOfflineReply(latestUserMessage);
  if (!isGroqConfigured()) return offline;

  // Emergencies always get the safe built-in instructions (go to a vet now),
  // never model-written first-aid steps.
  if (offline.urgency === "emergency") return offline;

  const petContext = await getPetContext(ownerId, petId);
  const symptoms = reportedSymptoms(history);
  const memory = symptoms.length
    ? `Symptoms the owner has already reported in this chat: ${symptoms.join(", ")}. Take all of them into account together in your answer, and do not ask whether they are present.`
    : "";
  const prompt = [
    { role: "system", content: SYSTEM_PROMPT },
    ...(petContext ? [{ role: "system", content: petContext }] : []),
    ...(memory ? [{ role: "system", content: memory }] : []),
    ...history,
  ];

  let content;
  try {
    content = await callGroq(prompt, true);
  } catch (error) {
    if (error.code === "BAD_REQUEST") {
      // Retry once without JSON mode; the reply is then used as plain text.
      try {
        content = await callGroq(prompt, false);
      } catch {
        return offline;
      }
    } else if (["NETWORK_ERROR", "PROVIDER_UNAVAILABLE", "PROVIDER_AUTH"].includes(error.code)) {
      // Owners still get the built-in guidance.
      return offline;
    } else {
      throw error;
    }
  }

  const result = parseModelOutput(content);
  if (!result) return offline;

  // Vomiting and diarrhea reported together (in this chat) need a vet the same day.
  const conversation = history.filter((m) => m.role === "user").map((m) => m.content.toLowerCase()).join(" ");
  const vomiting = /(?:vomit|throw(?:ing)? up|suka)/.test(conversation);
  const diarrhea = /(?:diarrh|loose (?:stool|poop)|(?:wet|watery|soft|basa|malabnaw) (?:poop|stool|tae|dumi)|(?:poop|stool|tae|dumi)\s+(?:is |are )?(?:wet|watery|soft|basa|malabnaw)|nagtatae|pagtatae)/.test(conversation);
  if (vomiting && diarrhea && !["emergency", "same_day"].includes(result.urgency)) {
    result.urgency = "same_day";
    result.suggestedAction = "contact_clinic";
  }

  return result;
}
