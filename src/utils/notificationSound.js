import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';

let cachedPlayer = null;
let audioModeConfigured = false;

async function ensureAudioMode() {
  if (audioModeConfigured) return;
  audioModeConfigured = true;
  try {
    await setAudioModeAsync({ playsInSilentMode: true });
  } catch (error) {
    console.warn('Unable to configure audio mode:', error?.message || error);
  }
}

function ensurePlayer() {
  if (!cachedPlayer) {
    cachedPlayer = createAudioPlayer(
      require('../screens/assets/notification/notification_sound.mp3')
    );
  }
  return cachedPlayer;
}

export async function playNotificationSound() {
  try {
    await ensureAudioMode();
    const player = ensurePlayer();
    player.seekTo(0);
    player.play();
  } catch (error) {
    console.warn('Unable to play notification sound:', error?.message || error);
  }
}
