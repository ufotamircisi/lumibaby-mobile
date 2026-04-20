// services/audioManager.ts
// Global singleton — uygulama genelinde tek aktif ses (tüm sekmeler)
//
// KURAL: Hiçbir sekme dosyası doğrudan Audio.Sound oluşturmaz.
//   play()  → mevcut sesi durdurur, yenisini başlatır
//   stop()  → aktif sesi durdurur ve unload eder
//   subscribe() → aktif ses değişince UI'yı günceller
//
// DOĞRU:   audioManager.play(file, id, 'ninniler', { loop: true })
// YANLIŞ:  const { sound } = await Audio.Sound.createAsync(...)
import { Audio } from 'expo-av';

export type AudioTab = 'ninniler' | 'kolik' | 'hikayeler' | 'analiz' | 'sesim';
export type PlayOptions = { loop?: boolean; onFinish?: () => void };
type Listener = (id: number | null, tab: AudioTab | null) => void;

let activeSound: Audio.Sound | null = null;
let activeId: number | null = null;
let activeTab: AudioTab | null = null;
let activeOnFinish: (() => void) | null = null;
const listeners: Set<Listener> = new Set();

// Monotonically increasing token — every play() and stop() increments it.
// After each await, the caller checks its token against the current value;
// if they differ a newer call won the race and the current call bails out.
let playGeneration = 0;

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

export async function setActiveVolume(volume: number): Promise<void> {
  if (activeSound) {
    try { await activeSound.setVolumeAsync(volume); } catch {}
  }
}

export async function stop(): Promise<void> {
  playGeneration++;                // cancel any in-flight play()
  activeOnFinish = null;
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
  // Claim this generation — any concurrent play() with an older token will bail.
  const generation = ++playGeneration;

  const prev = activeSound;
  activeOnFinish = null;
  activeSound    = null;
  activeId       = null;
  activeTab      = null;

  if (prev) {
    try { await prev.stopAsync(); await prev.unloadAsync(); } catch {}
  }

  // A newer call arrived while we were stopping the previous sound.
  if (generation !== playGeneration) return;

  if (!file) return;

  try {
    await Audio.setAudioModeAsync({
      allowsRecordingIOS:      false,
      playsInSilentModeIOS:    true,
      staysActiveInBackground: true,
    });

    if (generation !== playGeneration) return;

    const { sound } = await Audio.Sound.createAsync(file, {
      shouldPlay: true,
      isLooping:  options?.loop ?? false,
    });

    // A newer call arrived while createAsync was running — discard this sound.
    if (generation !== playGeneration) {
      try { await sound.stopAsync(); await sound.unloadAsync(); } catch {}
      return;
    }

    activeSound    = sound;
    activeId       = id;
    activeTab      = tab;
    activeOnFinish = options?.onFinish ?? null;
    notify();

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
