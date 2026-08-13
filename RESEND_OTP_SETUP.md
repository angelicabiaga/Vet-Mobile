# PawCruz Resend OTP Setup

The mobile app now uses the Supabase Edge Function \`send-otp-email\` for login, forgot password, change password, and change email.

The Resend API key is deliberately not stored in the Expo app. Configure it only as a Supabase secret.

## 1. Run the database migration

Open Supabase SQL Editor and run:

\`supabase/migrations/20260813_resend_otp_challenges.sql\`

## 2. Configure server secrets

From the project folder, run:

\`\`\`bash
npx supabase secrets set RESEND_API_KEY="YOUR_RESEND_API_KEY"
npx supabase secrets set RESEND_FROM_EMAIL="PawCruz <noreply@pawcruz.business>"
npx supabase secrets set OTP_HASH_SECRET="replace-with-a-long-random-secret"
\`\`\`

## 3. Deploy the function

\`\`\`bash
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase functions deploy send-otp-email --no-verify-jwt
\`\`\`

Your \`.env\` should contain only the public Expo values:

\`\`\`env
EXPO_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=YOUR_PUBLIC_ANON_KEY
\`\`\`

Never add \`RESEND_API_KEY\` to an \`EXPO_PUBLIC_*\` variable or mobile JavaScript file.
