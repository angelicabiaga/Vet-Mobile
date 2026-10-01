// Drop-in replacement for expo-secure-store that also works on web.
// Native: uses SecureStore. Web: falls back to localStorage (SecureStore has no web support).
import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

const isWeb = Platform.OS === "web";

// The login session is per browser tab (sessionStorage), so logging in as another
// account in a second tab can never replace this tab's user. It still survives a refresh.
const TAB_SCOPED_KEYS = new Set(["pawcruz_session"]);

const webStorage = (key) => {
  try {
    if (typeof window === "undefined") return null;
    return TAB_SCOPED_KEYS.has(key) ? window.sessionStorage : window.localStorage;
  } catch {
    return null;
  }
};

export const getItemAsync = async (key, options) => {
  if (!isWeb) return SecureStore.getItemAsync(key, options);
  return webStorage(key)?.getItem(key) ?? null;
};

export const setItemAsync = async (key, value, options) => {
  if (!isWeb) return SecureStore.setItemAsync(key, value, options);
  webStorage(key)?.setItem(key, value);
};

export const deleteItemAsync = async (key, options) => {
  if (!isWeb) return SecureStore.deleteItemAsync(key, options);
  webStorage(key)?.removeItem(key);
};
