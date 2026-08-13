export const GROQ_API_KEY = process.env.EXPO_PUBLIC_GROQ_API_KEY || "";

export const GROQ_MODEL = "openai/gpt-oss-20b";

export const GROQ_ENDPOINT =
  "https://api.groq.com/openai/v1/chat/completions";

export function isGroqConfigured() {
  return Boolean(String(GROQ_API_KEY || "").trim());
}
