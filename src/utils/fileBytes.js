import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';

// Reads a picked file (image picker / document picker) as raw bytes.
// On Android/iOS the file is read with expo-file-system: fetch() on local
// file:// URIs can fail when the cache path contains encoded characters
// (e.g. Expo Go's "%2540anonymous" folders) and then returns the text
// "File not found" instead of the file. Web keeps using fetch (blob: URLs).

const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const LOOKUP = (() => {
  const table = new Uint8Array(256);
  for (let i = 0; i < BASE64.length; i += 1) table[BASE64.charCodeAt(i)] = i;
  return table;
})();

function base64ToArrayBuffer(base64) {
  const clean = String(base64 || '').replace(/[^A-Za-z0-9+/]/g, '');
  const length = Math.floor((clean.length * 3) / 4);
  const bytes = new Uint8Array(length);
  let p = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const a = LOOKUP[clean.charCodeAt(i)];
    const b = LOOKUP[clean.charCodeAt(i + 1)];
    const c = LOOKUP[clean.charCodeAt(i + 2)];
    const d = LOOKUP[clean.charCodeAt(i + 3)];
    if (p < length) bytes[p++] = (a << 2) | (b >> 4);
    if (p < length) bytes[p++] = ((b & 15) << 4) | (c >> 2);
    if (p < length) bytes[p++] = ((c & 3) << 6) | d;
  }
  return bytes.buffer;
}

export async function readFileBytes(uri) {
  const value = String(uri || '');
  if (!value) throw new Error('No file was selected.');
  if (Platform.OS !== 'web' && /^(file|content):/i.test(value)) {
    const base64 = await FileSystem.readAsStringAsync(value, { encoding: FileSystem.EncodingType.Base64 });
    return base64ToArrayBuffer(base64);
  }
  const response = await fetch(value);
  if (!response.ok) throw new Error('Unable to read the selected file.');
  return response.arrayBuffer();
}

// The image type from the file's first bytes, or '' when it isn't a
// JPEG/PNG/WEBP image (e.g. an error page saved as ".jpg").
export function imageTypeFromBytes(buffer) {
  const b = new Uint8Array(buffer || new ArrayBuffer(0)).subarray(0, 12);
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46
    && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'image/webp';
  return '';
}
