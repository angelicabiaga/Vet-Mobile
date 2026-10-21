// PawCruz: server-side proxy for Groq chat completions.
//
// The Groq API key lives only here, as the Supabase secret GROQ_API_KEY, so it
// is never bundled into the mobile app or pushed to GitHub. The app sends the
// same body it used to send to Groq; this function adds the key, keeps the
// request within safe limits, and passes Groq's reply (and status) back.
//
// Set the key once with:
//   npx supabase secrets set GROQ_API_KEY=gsk_... --workdir backend --project-ref <ref>

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json" },
});
const fail = (message: string, status: number) => json({ error: { message } }, status);

const GROQ_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";
const ALLOWED_MODELS = ["openai/gpt-oss-20b"];
const DEFAULT_MODEL = ALLOWED_MODELS[0];
const MAX_TOKENS = 2000;
const MAX_MESSAGES = 40;
const MAX_TOTAL_CHARS = 120_000;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return fail("Only POST requests are allowed.", 405);

  const apiKey = Deno.env.get("GROQ_API_KEY");
  if (!apiKey) return fail("PawCruz AI is not set up yet. Please try again later.", 503);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return fail("The request could not be read.", 400);
  }

  const messages = Array.isArray(body?.messages) ? body.messages : [];
  const valid = messages.length > 0 && messages.length <= MAX_MESSAGES && messages.every((message) =>
    message && typeof message === "object"
    && ["system", "user", "assistant"].includes((message as { role?: string }).role || "")
    && typeof (message as { content?: unknown }).content === "string");
  if (!valid) return fail("The request has no valid messages.", 400);
  const totalChars = messages.reduce((sum, message) => sum + String((message as { content: string }).content).length, 0);
  if (totalChars > MAX_TOTAL_CHARS) return fail("The request is too long.", 413);

  const model = ALLOWED_MODELS.includes(String(body.model)) ? String(body.model) : DEFAULT_MODEL;
  const temperature = Math.min(Math.max(Number(body.temperature ?? 0.3) || 0, 0), 1);
  const maxTokens = Math.min(Math.max(Math.round(Number(body.max_tokens ?? 800)) || 800, 1), MAX_TOKENS);
  const responseFormat = (body.response_format as { type?: string })?.type === "json_object"
    ? { response_format: { type: "json_object" } }
    : {};

  let upstream: Response;
  try {
    upstream = await fetch(GROQ_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, messages, temperature, max_tokens: maxTokens, ...responseFormat }),
    });
  } catch {
    return fail("PawCruz AI could not be reached. Please try again later.", 502);
  }

  const text = await upstream.text();
  if (!upstream.ok) console.warn("Groq request failed:", upstream.status, text.slice(0, 300));
  return new Response(text, {
    status: upstream.status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
