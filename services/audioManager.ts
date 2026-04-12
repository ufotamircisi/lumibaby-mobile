// services/audioManager.ts
// Global singleton — one active audio across all tabs
import { Audio } from 'expo-av';

export type AudioTab = 'ninniler' | 'kolik' | 'hikayeler';
export type PlayOptions = { loop?: boolean; onFinish?: () => void };
type Listener = (id: number | null, tab: AudioTab | null) => void;

let activeSound: Audio.Sound | null = null;
let activeId: number | null = null;
let activeTab: AudioTab | null = null;
let activeOnFinish: (() => void) | null = null;
const listeners: Set<Listener> = new Set();

function notify(): void {
  listeners.forEach((l) => l(activeId, activeTab));
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function getState(): { id: number | null; tab: AudioTab | null } {
  return { id: activeId, tab: activeTab };
}

export async function stop(): Promise<void> {
  activeOnFinish = null;           // suppress callback on manual stop
  const sound = activeSound;
  activeSound = null;
  activeId    = null;
  activeTab   = null;
  notify();
  if (sound) {
    try { await sound.stopAsync(); await sound.unloadAsync(); } catch {}
  }
}

export async function play(
  file: any,
  id: number,
  tab: AudioTab,
  options?: PlayOptions,
): Promise<void> {
  // Stop previous sound without firing its onFinish
  const prev = activeSound;
  activeOnFinish = null;
  activeSound    = null;
  activeId       = null;
  activeTab      = null;
  if (prev) {
    try { await prev.stopAsync(); await prev.unloadAsync(); } catch {}
  }

  if (!file) return;

  try {
    await Audio.setAudioModeAsync({
      allowsRecordingIOS:     false,
      playsInSilentModeIOS:   true,
      staysActiveInBackground: true,
    });
    const { sound } = await Audio.Sound.createAsync(file, {
      shouldPlay: true,
      isLooping:  options?.loop ?? false,
    });

    activeSound   = sound;
    activeId      = id;
    activeTab     = tab;
    activeOnFinish = options?.onFinish ?? null;
    notify();

    // Wire onFinish for non-looping sounds
    if (!options?.loop) {
      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish && activeSound === sound) {
          const cb = activeOnFinish;
          activeOnFinish = null;
          activeSound    = null;
          activeId       = null;
          activeTab      = null;
          notify();
          if (cb) cb();
        }
      });
    }
  } catch (e) {
    console.log('AudioManager error:', e);
  }
}
