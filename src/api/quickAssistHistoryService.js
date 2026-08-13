import * as SecureStore from "expo-secure-store";

function userKey(userId) {
  return String(userId || "guest").replace(/[^a-zA-Z0-9_-]/g, "_");
}

function indexKey(userId) {
  return `pawcruz_quick_assist_history_index_${userKey(userId)}`;
}

function messageKey(userId, messageId) {
  return `pawcruz_quick_assist_history_${userKey(userId)}_${String(messageId).replace(/[^a-zA-Z0-9_-]/g, "_")}`;
}

async function readIndex(userId) {
  try {
    const raw = await SecureStore.getItemAsync(indexKey(userId));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeIndex(userId, ids) {
  await SecureStore.setItemAsync(indexKey(userId), JSON.stringify(ids));
}

export async function loadQuickAssistHistory(userId) {
  const ids = await readIndex(userId);
  if (!ids.length) return [];

  const rows = [];
  for (const id of ids) {
    try {
      const raw = await SecureStore.getItemAsync(messageKey(userId, id));
      if (!raw) continue;
      const item = JSON.parse(raw);
      if (item?.id && item?.text && (item.role === "user" || item.role === "assistant")) {
        rows.push(item);
      }
    } catch {
      // Ignore one damaged history item instead of losing the whole chat.
    }
  }
  return rows;
}

export async function appendQuickAssistHistory(userId, message) {
  if (!userId || !message?.id || !message?.text) return;

  const id = String(message.id);
  const currentIds = await readIndex(userId);

  await SecureStore.setItemAsync(
    messageKey(userId, id),
    JSON.stringify({
      id,
      role: message.role === "assistant" ? "assistant" : "user",
      text: String(message.text),
      time: String(message.time || ""),
      createdAt: message.createdAt || new Date().toISOString(),
    })
  );

  if (!currentIds.includes(id)) {
    await writeIndex(userId, [...currentIds, id]);
  }
}
