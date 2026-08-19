import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json" },
});

const EXPO_PUSH_ENDPOINT = "https://exp.host/--/api/v2/push/send";
const CHUNK_SIZE = 100;

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ success: false, error: "Method not allowed." }, 405);

  try {
    const body = await req.json();
    const record = body?.record;
    if (!record) return json({ success: false, error: "Missing notification record." }, 400);

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceKey) return json({ success: false, error: "Supabase server configuration is missing." }, 500);
    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    let tokenQuery = admin.from("push_tokens").select("id, expo_push_token, profile_id");
    tokenQuery = record.recipient_id
      ? tokenQuery.eq("profile_id", record.recipient_id)
      : tokenQuery;
    const { data: tokenRows, error: tokenError } = await tokenQuery;
    if (tokenError) return json({ success: false, error: "Unable to load push tokens: " + tokenError.message }, 500);
    if (!tokenRows?.length) return json({ success: true, sent: 0 });

    const data = {
      type: record.notification_type ?? null,
      relatedModule: record.related_module ?? null,
      relatedRecord: record.related_record ?? null,
      notificationId: record.id ?? null,
    };

    const messages = tokenRows.map((row) => ({
      to: row.expo_push_token,
      title: record.title || "PawCruz",
      body: record.message || "",
      sound: "default",
      data,
    }));

    const staleTokens: string[] = [];
    let sent = 0;

    for (const batch of chunk(messages, CHUNK_SIZE)) {
      const response = await fetch(EXPO_PUSH_ENDPOINT, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Accept-Encoding": "gzip, deflate",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(batch),
      });
      const result = await response.json().catch(() => null);
      const tickets = Array.isArray(result?.data) ? result.data : [];
      tickets.forEach((ticket: { status: string; details?: { error?: string } }, index: number) => {
        if (ticket.status === "ok") {
          sent += 1;
        } else if (ticket.details?.error === "DeviceNotRegistered") {
          staleTokens.push(batch[index].to);
        }
      });
    }

    if (staleTokens.length) {
      await admin.from("push_tokens").delete().in("expo_push_token", staleTokens);
    }

    return json({ success: true, sent, pruned: staleTokens.length });
  } catch (error) {
    return json({ success: false, error: error instanceof Error ? error.message : "Unexpected server error." }, 500);
  }
});
