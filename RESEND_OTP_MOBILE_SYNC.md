# PawCruz Mobile OTP Sync

This mobile app uses the same Supabase project and `send-otp-email` Edge Function as the PawCruz web app.

## Enabled mobile flows

- Login OTP
- Registration OTP (the account is created only after verification)
- Forgot-password OTP and password update
- Resend OTP with a 60-second UI cooldown
- OTP expires after 10 minutes
- OTP is invalidated after five incorrect attempts
- OTP before changing a pet owner's email or password

## Security

Do not add `RESEND_API_KEY` to `.env`, `EXPO_PUBLIC_*`, JavaScript, or JSX files. The Resend key must remain in the Supabase Edge Function secrets. The mobile app contains only the public Supabase URL and anonymous key.

The backend function required by both apps is:

`supabase/functions/send-otp-email/index.ts`

If the web OTP already sends email successfully, no separate Resend deployment is needed for mobile because both apps use the same Supabase project.

The mobile request body matches web exactly:

\`{ email, code, purpose, expiresMinutes }\`

Supported purpose values are \`register\`, \`login\`, \`forgot_password\`, \`change_password\`, and \`change_email\`.
