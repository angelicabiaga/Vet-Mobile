// PawCruz: change a profile's email (and optionally its username) behind an
// OTP sent to the CURRENT registered email.
//
// The code is generated, stored (hashed) and checked here, and the profile is
// only updated here, with the service role, after a correct code. The app
// never sees the code, so the check can't be skipped from the client.
//
// Separate from send-otp-email so the web app's shared OTP function is untouched.
//
// Actions:
//   request { profileId, newEmail, username? } -> { challengeId, expiresMinutes }
//   verify  { challengeId, code }              -> { profile }
//   cancel  { challengeId }                    -> {}
//
// Every error is a plain sentence for the user; no error codes.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json" },
});
const fail = (error: string, status = 400) => json({ success: false, error }, status);

const EXPIRY_MINUTES = 10;
const RESEND_COOLDOWN_SECONDS = 60;
const MAX_REQUESTS_PER_HOUR = 5;
const MAX_ATTEMPTS = 5;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const USERNAME_PATTERN = /^[a-z0-9_.-]{3,30}$/;

const sha256 = async (value: string) => {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(hash)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
};
// Exact, case-insensitive match: % and _ can't act as wildcards.
const exactIlike = (value: string) => value.replace(/[\\%_]/g, "\\$&");
const clean = (value: unknown) => String(value ?? "").trim().toLowerCase();

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return fail("Something went wrong. Please try again.", 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) return fail("Email change is unavailable right now. Please try again later.", 500);
  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const secret = Deno.env.get("OTP_HASH_SECRET") || serviceKey;

  // Another account already uses this value (case-insensitive)?
  const takenBy = async (column: "email" | "username", value: string, profileId: string) => {
    const { data, error } = await admin.from("profiles").select("id")
      .ilike(column, exactIlike(value)).neq("id", profileId).limit(1);
    if (error) throw new Error("lookup");
    return Boolean(data?.length);
  };

  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "");

    if (action === "request") {
      const profileId = String(body.profileId || "");
      const newEmail = clean(body.newEmail);
      const username = body.username == null ? null : clean(body.username);
      if (!profileId) return fail("Your login session is incomplete. Please log in again.");
      if (!newEmail) return fail("Email address is required.");
      if (!EMAIL_PATTERN.test(newEmail)) return fail("Enter a valid email address.");

      const { data: profile } = await admin.from("profiles").select("id,email,username,full_name").eq("id", profileId).maybeSingle();
      if (!profile) return fail("Your account could not be found. Please log in again.");
      const currentEmail = clean(profile.email);
      if (!EMAIL_PATTERN.test(currentEmail)) return fail("Your account has no valid registered email to send the code to. Contact the clinic.");
      if (newEmail === currentEmail) return fail("This is already your email address.");
      if (await takenBy("email", newEmail, profileId)) return fail("Email address is already registered.");
      if (username !== null) {
        if (!username) return fail("Username is required.");
        if (!USERNAME_PATTERN.test(username)) return fail("Username must contain 3–30 letters, numbers, dots, dashes, or underscores.");
        if (await takenBy("username", username, profileId)) return fail("Username is already taken.");
      }

      // Rate limits, per account.
      const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const { data: recent } = await admin.from("profile_email_change_challenges")
        .select("created_at").eq("profile_id", profileId).gte("created_at", hourAgo)
        .order("created_at", { ascending: false });
      if (recent?.length && Date.now() - new Date(recent[0].created_at).getTime() < RESEND_COOLDOWN_SECONDS * 1000) {
        return fail(`Please wait ${RESEND_COOLDOWN_SECONDS} seconds before requesting another code.`, 429);
      }
      if ((recent?.length || 0) >= MAX_REQUESTS_PER_HOUR) {
        return fail("Too many verification requests. Please try again in an hour.", 429);
      }

      const resendKey = Deno.env.get("RESEND_API_KEY");
      const from = Deno.env.get("RESEND_FROM_EMAIL") || "PawCruz <noreply@pawcruz.business>";
      if (!resendKey) return fail("Email change is unavailable right now. Please try again later.", 500);

      const challengeId = crypto.randomUUID();
      const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1000000).padStart(6, "0");
      const codeHash = await sha256(`${challengeId}:${code}:${secret}`);

      // Only the newest code works.
      await admin.from("profile_email_change_challenges").update({ consumed_at: new Date().toISOString() })
        .eq("profile_id", profileId).is("consumed_at", null);
      const { error: insertError } = await admin.from("profile_email_change_challenges").insert({
        id: challengeId,
        profile_id: profileId,
        sent_to: currentEmail,
        new_email: newEmail,
        new_username: username,
        code_hash: codeHash,
        expires_at: new Date(Date.now() + EXPIRY_MINUTES * 60 * 1000).toISOString(),
      });
      if (insertError) return fail("Unable to send the verification code. Please try again.", 500);

      const html = '<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:28px;color:#173f5c">' +
        "<h2>PawCruz Change Email</h2>" +
        `<p>Someone asked to change the email on your PawCruz account to <b>${newEmail}</b>. Use this code to confirm:</p>` +
        '<div style="font-size:34px;font-weight:800;letter-spacing:8px;padding:18px;background:#eef7fb;border-radius:12px;text-align:center">' +
        code + `</div><p>This code expires in ${EXPIRY_MINUTES} minutes. If you did not request this, ignore this email and your email will stay the same.</p></div>`;
      const sent = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from, to: [currentEmail], subject: "PawCruz Change Email OTP", html }),
      });
      if (!sent.ok) {
        await admin.from("profile_email_change_challenges").delete().eq("id", challengeId);
        return fail("Unable to send the verification code. Please try again.", 502);
      }
      return json({ success: true, challengeId, expiresMinutes: EXPIRY_MINUTES });
    }

    if (action === "verify") {
      const challengeId = String(body.challengeId || "");
      const code = String(body.code || "").trim();
      if (!/^\d{6}$/.test(code)) return fail("Enter the 6-digit verification code.");
      const { data: challenge } = await admin.from("profile_email_change_challenges").select("*").eq("id", challengeId).maybeSingle();
      if (!challenge || challenge.consumed_at) return fail("This verification request has ended. Please request a new code.");
      if (new Date(challenge.expires_at).getTime() <= Date.now()) return fail("Verification code has expired. Please request a new code.");
      if (challenge.attempts >= MAX_ATTEMPTS) return fail("Too many incorrect attempts. Please request a new code.", 429);

      if (await sha256(`${challengeId}:${code}:${secret}`) !== challenge.code_hash) {
        await admin.from("profile_email_change_challenges").update({ attempts: challenge.attempts + 1 }).eq("id", challengeId);
        return fail("Invalid verification code.");
      }
      // Consume first, and only if still unused, so one code can't be used twice.
      const { data: claimed } = await admin.from("profile_email_change_challenges")
        .update({ consumed_at: new Date().toISOString() }).eq("id", challengeId).is("consumed_at", null).select("id");
      if (!claimed?.length) return fail("This verification request has ended. Please request a new code.");

      // Re-check: another account may have taken them while the code was pending.
      if (await takenBy("email", challenge.new_email, challenge.profile_id)) return fail("Email address is already registered.");
      if (challenge.new_username && await takenBy("username", challenge.new_username, challenge.profile_id)) return fail("Username is already taken.");

      const changes: Record<string, unknown> = { email: challenge.new_email, updated_at: new Date().toISOString() };
      if (challenge.new_username) changes.username = challenge.new_username;
      const { data: profile, error: updateError } = await admin.from("profiles")
        .update(changes).eq("id", challenge.profile_id).select("*").single();
      if (updateError || !profile) return fail("Unable to update your email address. Please try again.", 500);
      const { password: _password, ...safe } = profile;
      return json({ success: true, profile: safe });
    }

    if (action === "cancel") {
      const challengeId = String(body.challengeId || "");
      if (challengeId) {
        await admin.from("profile_email_change_challenges").update({ consumed_at: new Date().toISOString() })
          .eq("id", challengeId).is("consumed_at", null);
      }
      return json({ success: true });
    }

    return fail("Something went wrong. Please try again.");
  } catch {
    return fail("Something went wrong. Please try again.", 500);
  }
});
