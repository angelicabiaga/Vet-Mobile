import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json" },
});
const labels: Record<string, string> = {
  register: "Registration",
  login: "Login",
  forgot_password: "Password Reset",
  change_password: "Change Password",
  change_email: "Change Email",
};
const sha256 = async (value: string) => {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ success: false, error: "Method not allowed." }, 405);
  try {
    const body = await req.json();
    const action = String(body.action || "send");
    const email = String(body.email || "").trim().toLowerCase();
    const purpose = String(body.purpose || "login").trim();
    if (!/^\S+@\S+\.\S+$/.test(email)) return json({ success: false, error: "A valid email is required." }, 400);
    if (!labels[purpose]) return json({ success: false, error: "Invalid OTP purpose." }, 400);

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceKey) return json({ success: false, error: "Supabase server configuration is missing." }, 500);
    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    if (action === "send") {
      const resendKey = Deno.env.get("RESEND_API_KEY");
      const from = Deno.env.get("RESEND_FROM_EMAIL") || "PawCruz <noreply@pawcruz.business>";
      if (!resendKey) return json({ success: false, error: "RESEND_API_KEY is not configured." }, 500);

      let payload = body.payload && typeof body.payload === "object" ? body.payload : {};
      if (payload.resendOf) {
        const { data: previous } = await admin.from("auth_otp_challenges").select("payload").eq("id", payload.resendOf).maybeSingle();
        if (previous?.payload) payload = previous.payload;
      }
      const { data: latest } = await admin.from("auth_otp_challenges")
        .select("created_at").eq("email", email).eq("purpose", purpose)
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (latest && Date.now() - new Date(latest.created_at).getTime() < 60_000) {
        return json({ success: false, error: "Please wait 60 seconds before requesting another code." }, 429);
      }
      const challengeId = crypto.randomUUID();
      const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1000000).padStart(6, "0");
      const secret = Deno.env.get("OTP_HASH_SECRET") || serviceKey;
      const codeHash = await sha256(challengeId + ":" + code + ":" + secret);
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

      await admin.from("auth_otp_challenges").update({ consumed_at: new Date().toISOString() })
        .eq("email", email).eq("purpose", purpose).is("consumed_at", null);
      const { error: insertError } = await admin.from("auth_otp_challenges").insert({
        id: challengeId, email, purpose, code_hash: codeHash, payload, expires_at: expiresAt,
      });
      if (insertError) return json({ success: false, error: "Unable to create OTP: " + insertError.message }, 500);

      const label = labels[purpose];
      const html = '<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:28px;color:#173f5c">' +
        "<h2>PawCruz " + label + "</h2><p>Use this verification code:</p>" +
        '<div style="font-size:34px;font-weight:800;letter-spacing:8px;padding:18px;background:#eef7fb;border-radius:12px;text-align:center">' +
        code + "</div><p>This code expires in 10 minutes. If you did not request this, you can ignore this email.</p></div>";
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: "Bearer " + resendKey, "Content-Type": "application/json" },
        body: JSON.stringify({ from, to: [email], subject: "PawCruz " + label + " OTP", html }),
      });
      if (!response.ok) {
        const details = await response.json().catch(() => ({}));
        await admin.from("auth_otp_challenges").delete().eq("id", challengeId);
        return json({ success: false, error: details?.message || "Resend could not send the email." }, response.status);
      }
      return json({ success: true, challengeId, expiresMinutes: 10 });
    }

    if (action === "verify") {
      const challengeId = String(body.challengeId || "");
      const code = String(body.code || "").trim();
      if (!/^\d{6}$/.test(code)) return json({ success: false, error: "Enter a valid 6-digit code." }, 400);
      const { data: challenge, error } = await admin.from("auth_otp_challenges").select("*").eq("id", challengeId).maybeSingle();
      if (error || !challenge || challenge.email !== email || challenge.purpose !== purpose) {
        return json({ success: false, error: "The verification request is invalid." }, 400);
      }
      if (challenge.consumed_at) return json({ success: false, error: "This code has already been used." }, 400);
      if (new Date(challenge.expires_at).getTime() <= Date.now()) return json({ success: false, error: "This code has expired. Request a new one." }, 400);
      if (challenge.attempts >= 5) return json({ success: false, error: "Too many attempts. Request a new code." }, 429);

      const secret = Deno.env.get("OTP_HASH_SECRET") || serviceKey;
      const submittedHash = await sha256(challengeId + ":" + code + ":" + secret);
      if (submittedHash !== challenge.code_hash) {
        await admin.from("auth_otp_challenges").update({ attempts: challenge.attempts + 1 }).eq("id", challengeId);
        return json({ success: false, error: "Invalid verification code." }, 400);
      }
      await admin.from("auth_otp_challenges").update({ consumed_at: new Date().toISOString() }).eq("id", challengeId);
      return json({ success: true, payload: challenge.payload || {} });
    }
    return json({ success: false, error: "Invalid action." }, 400);
  } catch (error) {
    return json({ success: false, error: error instanceof Error ? error.message : "Unexpected server error." }, 500);
  }
});
