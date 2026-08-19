import { Audio } from 'expo-av';

let cachedSound = null;
let loadingPromise = null;
let audioModeConfigured = false;

async function ensureAudioMode() {
  if (audioModeConfigured) return;
  audioModeConfigured = true;
  try {
    await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
  } catch (error) {
    console.warn('Unable to configure audio mode:', error?.message || error);
  }
}

async function ensureSoundLoaded() {
  if (cachedSound) return cachedSound;
  if (!loadingPromise) {
    loadingPromise = Audio.Sound.createAsync(
      require('../screens/assets/notification/notification_sound.mp3')
    ).then(({ sound }) => {
      cachedSound = sound;
      return sound;
    });
  }
  return loadingPromise;
}

export async function playNotificationSound() {
  try {
    await ensureAudioMode();
    const sound = await ensureSoundLoaded();
    await sound.setPositionAsync(0);
    await sound.playAsync();
  } catch (error) {
    console.warn('Unable to play notification sound:', error?.message || error);
  }
}
