import AsyncStorage from '@react-native-async-storage/async-storage';
import * as BackgroundFetch from 'expo-background-fetch';
import * as TaskManager from 'expo-task-manager';

export const BACKGROUND_AUDIO_TASK = 'lumibaby-bg-audio';

const TIMER_KEYS = ['timer_end_ninniler', 'timer_end_kolik', 'timer_end_hikayeler'];

// Modül yüklenince tanımla — defineTask en üst seviyede çağrılmalı
TaskManager.defineTask(BACKGROUND_AUDIO_TASK, async () => {
  try {
    const now = Date.now();
    let expired = false;
    for (const key of TIMER_KEYS) {
      const stored = await AsyncStorage.getItem(key);
      if (stored && now >= Number(stored)) {
        await AsyncStorage.removeItem(key);
        expired = true;
      }
    }
    if (expired) {
      // Uygulama açıldığında AppState 'active' handler bu flag'i okuyacak
      await AsyncStorage.setItem('timer_expired_bg', '1');
    }
    return BackgroundFetch.BackgroundFetchResult.NewData;
  } catch {
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

export async function registerBgAudioTask() {
  try {
    const registered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_AUDIO_TASK);
    if (!registered) {
      await BackgroundFetch.registerTaskAsync(BACKGROUND_AUDIO_TASK, {
        minimumInterval: 60,       // iOS'ta minimum ~15 dk olabilir, Android WorkManager bunu dener
        stopOnTerminate: false,
        startOnBoot: true,
      });
    }
  } catch (e) {
    console.warn('[BgTask] Kayıt başarısız:', e);
  }
}
