// utils/permissions.ts — tek kaynak, tüm özellik erişim kararları buradan
// Bu 4 fonksiyon DIŞINDA hiçbir yerde premium kontrolü yazma.

import type { DetectorState } from './detectorLimit';

// Anne sesi ninni (id:999) ve anne sesi pışpış (id:998)
const PREMIUM_AUDIO_IDS = [998, 999] as const;

/**
 * Ses öğesi premium mu? index.tsx, kolik.tsx, analiz.tsx sesListesi için.
 * item.id === 998 veya 999 → true
 */
export function isItemPremium(item: { id: string | number }): boolean {
  const n = typeof item.id === 'string' ? parseInt(item.id, 10) : item.id;
  return (PREMIUM_AUDIO_IDS as readonly number[]).includes(n);
}

/**
 * Dedektör başlatılabilir mi?
 * - Premium kullanıcı → her zaman true
 * - Ücretsiz kullanıcı → henüz tüketilmemiş hak varsa true
 *   (freeUsed=false → ücretsiz hak var; adUsed=false → reklam hakkı var)
 */
export function canStartDetector(
  isPremium: boolean,
  dailyStats: Pick<DetectorState, 'freeUsed' | 'adUsed'>,
): boolean {
  if (isPremium) return true;
  return !dailyStats.freeUsed || !dailyStats.adUsed;
}

/**
 * Detaylı skor raporu görüntülenebilir mi?
 * Trial veya premium → true; free → false (basit rapor herkese açık)
 */
export function canViewDetailedReport(canAccessPremium: boolean): boolean {
  return canAccessPremium;
}

/**
 * Manuel uyku takibi (Bebek Uyudu / Uyandı, kayıt) — her zaman ücretsiz.
 */
export function canManualTrack(): true {
  return true;
}
