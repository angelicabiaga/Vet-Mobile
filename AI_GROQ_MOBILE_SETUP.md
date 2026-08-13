# PawCruz Mobile AI / Groq Setup

The web project stores its Groq key in:
`REACT_APP_GROQ_API_KEY`

The Expo mobile project now mirrors that organization using:
`EXPO_PUBLIC_GROQ_API_KEY`

Files:
- `.env` — contains the configured mobile Groq key copied from the supplied web project.
- `.env.example` — safe template without the real key.
- `src/config/aiConfig.js` — endpoint/model/environment configuration.
- `src/api/aiService.js` — Groq API request logic and PawCruz assistant prompt.
- `PetOwnerQuickAssist.js` — UI only calls `askPawCruzAI`; it does not contain a hard-coded API key.

After changing `.env`, restart Expo with cache clearing:
`npx expo start -c`
