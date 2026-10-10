import { supabase } from "../config/supabaseClient";
import { createNotification } from "./notificationService";

const FALLBACK_CODES = new Set(["PGRST200", "PGRST201", "PGRST204", "PGRST205", "42P01", "42703"]);

// Plain words only: users never see database error codes. Messages the
// database validation writes for people ("Message not sent: ...") pass through.
function readableError(prefix, error) {
  const message = String(error?.message || "");
  if (/^Message not sent:/i.test(message)) return new Error(message);
  if (error?.code) console.warn(`${prefix}:`, error.code, message);
  return new Error(`${prefix}. Please try again.`);
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

async function rpcArray(functionName, args, message) {
  const { data, error } = await supabase.rpc(functionName, args);
  if (error) throw readableError(message, error);
  return asArray(data);
}

export async function getMessageContacts(profile) {
  if (!profile?.id) throw new Error("Your login session is incomplete.");
  const { data, error } = await supabase
    .from("profiles")
    .select("id,full_name,username,email,role,account_status,avatar_url")
    .neq("id", profile.id)
    .order("full_name");
  if (!error) {
    // An empty status counts as active (same rule as login and the database triggers).
    return (data || []).filter((item) => String(item.account_status ?? "active").trim().toLowerCase() === "active");
  }
  return rpcArray("pawcruz_get_message_contacts", { p_profile_id: profile.id }, "Unable to load messaging contacts");
}

export async function createConversation(profile, participantIds, subject) {
  if (!profile?.id) throw new Error("Your login session is incomplete.");
  const ids = [...new Set((participantIds || []).filter(Boolean))].filter((id) => id !== profile.id);
  if (!ids.length) throw new Error("Choose at least one recipient.");

  // Reuse the existing chat with exactly these people instead of starting a duplicate.
  const wanted = [profile.id, ...ids].sort().join("|");
  const existing = (await getConversations(profile).catch(() => []))
    .find((row) => [...new Set((row.participants || []).map((p) => p.id))].sort().join("|") === wanted);
  if (existing) return existing;

  const { data: conversation, error: conversationError } = await supabase
    .from("conversations")
    .insert({ created_by: profile.id, subject: subject?.trim() || "New conversation" })
    .select("*")
    .single();

  if (!conversationError && conversation) {
    const participantRows = [profile.id, ...ids].map((id) => ({
      conversation_id: conversation.id,
      profile_id: id,
      last_read_at: id === profile.id ? new Date().toISOString() : null,
    }));
    const { error: participantError } = await supabase.from("conversation_participants").insert(participantRows);
    if (!participantError) return conversation;
    await supabase.from("conversations").delete().eq("id", conversation.id);
  }

  const { data, error } = await supabase.rpc("pawcruz_create_conversation", {
    p_created_by: profile.id,
    p_participant_ids: ids,
    p_subject: subject?.trim() || "New conversation",
  });
  if (error) throw readableError("Unable to create conversation", error);
  return data;
}

async function getConversationsNormally(profile) {
  const { data: links, error: linksError } = await supabase
    .from("conversation_participants")
    .select("conversation_id,last_read_at")
    .eq("profile_id", profile.id);
  if (linksError) return { data: null, error: linksError };
  const conversationIds = [...new Set((links || []).map((row) => row.conversation_id))];
  if (!conversationIds.length) return { data: [], error: null };

  const [conversationResult, participantResult, messageResult] = await Promise.all([
    supabase.from("conversations").select("id,subject,created_by,last_message_at,created_at").in("id", conversationIds),
    supabase.from("conversation_participants").select("conversation_id,profile_id").in("conversation_id", conversationIds),
    supabase.from("messages").select("id,conversation_id,sender_id,body,attachment_url,attachment_name,created_at").in("conversation_id", conversationIds).order("created_at", { ascending: false }),
  ]);
  const firstError = conversationResult.error || participantResult.error || messageResult.error;
  if (firstError) return { data: null, error: firstError };

  const profileIds = [...new Set((participantResult.data || []).map((row) => row.profile_id))];
  let profiles = [];
  if (profileIds.length) {
    const result = await supabase.from("profiles").select("id,full_name,username,email,role,avatar_url").in("id", profileIds);
    if (result.error) return { data: null, error: result.error };
    profiles = result.data || [];
  }

  const profileMap = new Map(profiles.map((item) => [item.id, item]));
  const conversationMap = new Map((conversationResult.data || []).map((item) => [item.id, item]));
  const linkMap = new Map((links || []).map((item) => [item.conversation_id, item]));

  const rows = conversationIds.map((conversationId) => {
    const conversation = conversationMap.get(conversationId);
    if (!conversation) return null;
    const participants = (participantResult.data || [])
      .filter((item) => item.conversation_id === conversationId)
      .map((item) => profileMap.get(item.profile_id)).filter(Boolean);
    const conversationMessages = (messageResult.data || []).filter((item) => item.conversation_id === conversationId);
    const latest = conversationMessages[0] || null;
    const link = linkMap.get(conversationId);
    const unread = conversationMessages.filter((message) =>
      message.sender_id !== profile.id && (!link?.last_read_at || new Date(message.created_at) > new Date(link.last_read_at))
    ).length;
    return { ...conversation, participants, latest, unread };
  }).filter(Boolean).sort((a, b) => new Date(b.last_message_at || b.created_at) - new Date(a.last_message_at || a.created_at));
  return { data: rows, error: null };
}

const activityTime = (row) => new Date(row?.latest?.created_at || row?.last_message_at || row?.created_at || 0).getTime();

// One row per set of people: older duplicate threads with the same
// participants fold into the most recently active one. `conversationIds`
// keeps every thread so their messages still show together.
function mergeDuplicateConversations(rows) {
  const groups = new Map();
  for (const row of rows || []) {
    const ids = (row.participants || []).map((p) => p?.id).filter(Boolean);
    const key = ids.length ? [...new Set(ids)].sort().join("|") : `id:${row.id}`;
    const group = groups.get(key);
    if (!group) { groups.set(key, [row]); continue; }
    group.push(row);
  }
  return [...groups.values()].map((group) => {
    // Threads with messages win over empty duplicates, then the most recent.
    const sorted = [...group].sort((a, b) => (Boolean(b.latest) - Boolean(a.latest)) || (activityTime(b) - activityTime(a)));
    const primary = sorted[0];
    return {
      ...primary,
      conversationIds: sorted.map((row) => row.id),
      unread: sorted.reduce((total, row) => total + (Number(row.unread) || 0), 0),
    };
  }).sort((a, b) => activityTime(b) - activityTime(a));
}

const asIdList = (value) => [...new Set((Array.isArray(value) ? value : [value]).filter(Boolean))];

export async function getConversations(profile) {
  if (!profile?.id) throw new Error("Your login session is incomplete.");
  const normalResult = await getConversationsNormally(profile);
  if (!normalResult.error) return mergeDuplicateConversations(normalResult.data);
  return mergeDuplicateConversations(await rpcArray("pawcruz_get_conversations", { p_profile_id: profile.id }, "Unable to load conversations"));
}

// Accepts one conversation id or a list (a merged row's `conversationIds`).
export async function getMessages(conversationIds) {
  const ids = asIdList(conversationIds);
  if (!ids.length) return [];
  const { data, error } = await supabase
    .from("messages")
    .select("id,conversation_id,sender_id,body,attachment_url,attachment_name,created_at")
    .in("conversation_id", ids).order("created_at", { ascending: true });
  if (!error) {
    const senderIds = [...new Set((data || []).map((item) => item.sender_id))];
    let profiles = [];
    if (senderIds.length) {
      const result = await supabase.from("profiles").select("id,full_name,role,avatar_url").in("id", senderIds);
      if (!result.error) profiles = result.data || [];
    }
    const profileMap = new Map(profiles.map((item) => [item.id, item]));
    return (data || []).map((item) => ({ ...item, sender: profileMap.get(item.sender_id) || null }));
  }
  const lists = await Promise.all(ids.map((id) =>
    rpcArray("pawcruz_get_messages", { p_conversation_id: id }, "Unable to load messages")));
  return lists.flat().sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
}

export async function markConversationRead(conversationIds, profileId) {
  const ids = asIdList(conversationIds);
  if (!ids.length || !profileId) return;
  const { error } = await supabase.from("conversation_participants")
    .update({ last_read_at: new Date().toISOString() })
    .in("conversation_id", ids).eq("profile_id", profileId);
  if (!error) return;
  await Promise.all(ids.map((id) =>
    supabase.rpc("pawcruz_mark_conversation_read", { p_conversation_id: id, p_profile_id: profileId })));
}

export async function uploadMessageAttachment(file, profileId) {
  if (!file) return null;
  if (!profileId) throw new Error("Your login session is incomplete.");
  const originalName = file.name || "attachment";
  const safeName = originalName.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${profileId}/${Date.now()}-${safeName}`;
  const response = await fetch(file.uri);
  const arrayBuffer = await response.arrayBuffer();
  const { error } = await supabase.storage.from("message-attachments").upload(path, arrayBuffer, {
    contentType: file.mimeType || "application/octet-stream", cacheControl: "3600", upsert: false,
  });
  if (error) throw readableError("Unable to upload attachment", error);
  const { data } = supabase.storage.from("message-attachments").getPublicUrl(path);
  return { path, url: data.publicUrl, name: originalName };
}

async function notifyOtherParticipants(conversationId, sender, body) {
  const { data: participantRows } = await supabase
    .from("conversation_participants")
    .select("profile_id")
    .eq("conversation_id", conversationId)
    .neq("profile_id", sender.id);
  const recipients = (participantRows || []).map((row) => row.profile_id).filter(Boolean);
  if (!recipients.length) return;
  const senderName = sender.full_name || sender.username || "PawCruz";
  const preview = (body || "").trim().slice(0, 140) || "Sent an attachment";
  await Promise.all(recipients.map((recipientId) => createNotification({
    recipientId,
    type: "Message",
    title: `New message from ${senderName}`,
    message: preview,
    relatedModule: "Messages",
    relatedRecord: conversationId,
    createdBy: sender.id,
  })));
}

export const MESSAGE_MAX_LENGTH = 2000;
export const ATTACHMENT_MAX_BYTES = 25 * 1024 * 1024;

// Returns why a message can't be sent, or null when it is valid. Runs before
// anything is uploaded or stored, so an invalid message leaves no trace.
export function validateMessage(body, file) {
  const text = typeof body === "string" ? body.trim() : "";
  if (body != null && typeof body !== "string") return "Message must be text.";
  if (!text && !file) return "Type a message or attach a file.";
  if (text.length > MESSAGE_MAX_LENGTH) return `Message is too long (${text.length}/${MESSAGE_MAX_LENGTH} characters).`;
  if (file) {
    if (!file.uri) return "The attached file could not be read.";
    if (file.size != null && file.size > ATTACHMENT_MAX_BYTES) return "Attachment is larger than 25 MB.";
    if (file.size === 0) return "The attached file is empty.";
  }
  return null;
}

export async function sendMessage(conversationId, profile, body, file) {
  if (!conversationId) throw new Error("Select a conversation first.");
  if (!profile?.id) throw new Error("Your login session is incomplete.");
  const invalid = validateMessage(body, file);
  if (invalid) throw new Error(`Message not sent: ${invalid}`);

  // The sender must belong to the conversation. A failed lookup (e.g. RLS)
  // falls through to the insert/RPC, which enforce access themselves.
  const { data: membership, error: membershipError } = await supabase
    .from("conversation_participants")
    .select("profile_id")
    .eq("conversation_id", conversationId)
    .eq("profile_id", profile.id)
    .maybeSingle();
  if (!membershipError && !membership) throw new Error("Message not sent: you are not part of this conversation.");

  let attachment = null;
  if (file) attachment = await uploadMessageAttachment(file, profile.id);
  const payload = {
    conversation_id: conversationId, sender_id: profile.id, body: body?.trim() || null,
    attachment_url: attachment?.url || null, attachment_name: attachment?.name || null,
  };
  const { data, error } = await supabase.from("messages").insert(payload).select("*").single();
  // Rejected by the database validation (SUPABASE_MESSAGES_VALIDATION.sql): no retry.
  if (error && (error.code === "23514" || error.code === "42501")) throw new Error(error.message);
  if (!error) {
    await markConversationRead(conversationId, profile.id);
    notifyOtherParticipants(conversationId, profile, payload.body).catch(() => {});
    return data;
  }
  const { data: rpcData, error: rpcError } = await supabase.rpc("pawcruz_send_message", {
    p_conversation_id: conversationId, p_sender_id: profile.id, p_body: payload.body,
    p_attachment_url: payload.attachment_url, p_attachment_name: payload.attachment_name,
  });
  if (rpcError) throw readableError("Unable to send message", rpcError);  notifyOtherParticipants(conversationId, profile, payload.body).catch(() => {});
  return rpcData;
}

export function subscribeToMessages(conversationIds, onChange) {
  const ids = asIdList(conversationIds);
  if (!ids.length) return null;
  const filter = ids.length === 1 ? `conversation_id=eq.${ids[0]}` : `conversation_id=in.(${ids.join(",")})`;
  return supabase
    .channel(`pawcruz-mobile-messages-${ids[0]}-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "messages", filter },
      onChange
    )
    .subscribe((status) => {
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        console.warn("Message Realtime status:", status);
      }
    });
}

export function subscribeToMessagingOverview(profileId, onChange) {
  if (!profileId) return null;

  return supabase
    .channel(`pawcruz-mobile-message-overview-${profileId}-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "messages" },
      onChange
    )
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "conversation_participants",
        filter: `profile_id=eq.${profileId}`,
      },
      onChange
    )
    .subscribe((status) => {
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        console.warn("Messaging overview Realtime status:", status);
      }
    });
}
