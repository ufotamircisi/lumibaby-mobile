// Android foreground service bildirimi — iOS'ta no-op
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

const CHANNEL_ID  = 'lumibaby-service';
const FG_NOTIF_ID = 'lumibaby-fg-service';

async function ensureChannel() {
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: 'LumiBaby Servis',
    importance: Notifications.AndroidImportance.LOW,
    enableVibrate: false,
    enableLights: false,
    showBadge: false,
  });
}

export async function showFgNotification(type: 'audio' | 'detector', lang: string) {
  if (Platform.OS !== 'android') return;
  try {
    await ensureChannel();
    // Önceki bildirimi kaldır — aynı kimlikle yenisi gelince Android replace eder,
    // ama dismiss + reschedule daha güvenli
    await Notifications.dismissNotificationAsync(FG_NOTIF_ID).catch(() => {});
    const body = type === 'audio'
      ? (lang === 'en' ? '🎵 Music playing — timer active' : '🎵 LumiBaby çalıyor — zamanlayıcı aktif')
      : (lang === 'en' ? '🎙️ LumiBaby listening — detector active' : '🎙️ LumiBaby dinliyor — dedektör aktif');
    await Notifications.scheduleNotificationAsync({
      identifier: FG_NOTIF_ID,
      content: {
        title: 'Minik Uyku – LumiBaby',
        body,
        data: { fgType: type },
        sound: false,
        sticky: true,
      } as Notifications.NotificationContentInput & { sticky: boolean },
      trigger: null,
    });
  } catch (e) {
    console.warn('[FgService] Bildirim gösterilemedi:', e);
  }
}

export async function dismissFgNotification() {
  if (Platform.OS !== 'android') return;
  try {
    await Notifications.dismissNotificationAsync(FG_NOTIF_ID);
  } catch {}
}
