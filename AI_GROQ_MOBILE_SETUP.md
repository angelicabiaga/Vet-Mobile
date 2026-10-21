# PawCruz Mobile AI / Groq Setup

The Groq API key is no longer in the mobile app or in `.env`. All AI requests go
through the Supabase Edge Function `ai-chat`, which holds the key as the
Supabase secret `GROQ_API_KEY`. The app only needs the public Supabase URL and
anon key.

Files:
- `.env` — local only (gitignored). Holds `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`.
- `.env.example` — safe template for `.env`.
- `backend/supabase/functions/ai-chat/index.ts` — server-side proxy that adds the Groq key and forwards to Groq.
- `src/config/aiConfig.js` — points the app at the `ai-chat` function.
- `src/api/aiService.js`, `src/api/chatbotService.js` — AI request logic; no API key in the app.

To change the Groq key, set the Supabase secret (no app rebuild needed):
`npx supabase secrets set GROQ_API_KEY=gsk_... --workdir backend --project-ref <ref>`

After changing `.env`, restart Expo with cache clearing:
`npx expo start -c`
