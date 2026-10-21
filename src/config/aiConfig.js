// PawCruz AI calls go through the Supabase Edge Function `ai-chat`, which
// holds the Groq API key as a server secret. The key is never in the app.
const SUPABASE_URL = String(process.env.EXPO_PUBLIC_SUPABASE_URL || "").replace(/\/+$/, "");
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || "";

export const GROQ_MODEL = "openai/gpt-oss-20b";

export const GROQ_ENDPOINT = `${SUPABASE_URL}/functions/v1/ai-chat`;

// Headers for the ai-chat function (the public anon key, not the Groq key).
export function aiRequestHeaders() {
  return {
    "Content-Type": "application/json",
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
  };
}

export function isGroqConfigured() {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}
