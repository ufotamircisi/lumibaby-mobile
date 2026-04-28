// utils/permissions.ts — tek kaynak, tüm özellik izinleri buradan
// Her yer buradan import eder; başka dosyada premium/limit kontrolü yazılmaz.

import AsyncStorage from '@react-native-async-storage/async-storage';

// ── SES PREMİUM KONTROLÜ ──────────────────────────────────────────────────────

const PREMIUM_SOUNDS = ['anne_sesi_ninni', 'anne_sesi_pispis'] as const;

/** Yeni string-ID sistemi için: 'anne_sesi_ninni' veya 'anne_sesi_pispis' → true */
export function isSoundPremium(soundId: string): boolean {
  return (PREMIUM_SOUNDS as readonly string[]).includes(soundId);
}

/** Geriye dönük uyumluluk — mevcut ses nesneleri numeric id 998/999 kullanıyor */
const PREMIUM_AUDIO_IDS = [998, 999] as const;
export function isItemPremium(item: { id: string | number }): boolean {
  const n = typeof item.id === 'string' ? parseInt(item.id, 10) : item.id;
  return (PREMIUM_AUDIO_IDS as readonly number[]).includes(n);
}

// ── GÖRÜNTÜLEME İZİNLERİ ──────────────────────────────────────────────────────

/** Detaylı skor raporu: trial veya premium kullanıcı → true */
export function canViewDetailedReport(canAccessPremium: boolean): boolean {
  return canAccessPremium;
}

/** Manuel uyku takibi (Bebek Uyudu/Uyandı) → her zaman ücretsiz */
export function canManualTrack(): true {
  return true;
}

// ── SHARED HELPERS ────────────────────────────────────────────────────────────

function todayStr(): string {
  return new Date().toISOString().split('T')[0];
}

// ── DEDEKTÖR GÜNLÜK LIMIT ─────────────────────────────────────────────────────
// Kapsam: Ağlama dedektörü + Kolik dedektörü (tek havuz)
// Ücretsiz: 1 hak/gün (60 dk) + 1 reklam hakkı (60 dk) = max 120 dk
// Gece 00:00'da sıfırlanır. Premium kullanıcıda kontrol çalışmaz.

const DK = {
  DATE:    'perm_detector_date',
  FREE:    'perm_detector_free_used',
  AD:      'perm_detector_ad_used',
  SESSION: 'perm_detector_session_start',
} as const;

export const DETECTOR_SESSION_MS = 60 * 60 * 1000; // 60 dakika

export interface DetectorState {
  freeUsed: boolean;
  adUsed: boolean;
  sessionStart: number | null;
}

/** Eski analiz.tsx kodu bu tipi kullanıyor */
export type DetectorStartResult = 'ok' | 'need_ad' | 'exhausted';

async function resetDetectorIfNewDay(): Promise<void> {
  const stored = await AsyncStorage.getItem(DK.DATE);
  if (stored === todayStr()) return;
  await AsyncStorage.multiSet([
    [DK.DATE, todayStr()],
    [DK.FREE, 'false'],
    [DK.AD,   'false'],
  ]);
  await AsyncStorage.removeItem(DK.SESSION);
}

/** Dedektör durumunu AsyncStorage'dan yükler (gün sıfırlamasını da yapar). */
export async function loadDetectorState(): Promise<DetectorState> {
  await resetDetectorIfNewDay();
  const results = await AsyncStorage.multiGet([DK.FREE, DK.AD, DK.SESSION]);
  const sessionRaw = results[2][1];
  return {
    freeUsed:     results[0][1] === 'true',
    adUsed:       results[1][1] === 'true',
    sessionStart: sessionRaw ? parseInt(sessionRaw, 10) : null,
  };
}

/** Aktif oturumda kalan süreyi saniye olarak döner (oturum yoksa 0). */
export function detectorKalanSaniye(state: Pick<DetectorState, 'sessionStart'>): number {
  if (!state.sessionStart) return 0;
  const remaining = DETECTOR_SESSION_MS - (Date.now() - state.sessionStart);
  return Math.max(0, Math.ceil(remaining / 1000));
}

export function isDetectorSessionActive(state: Pick<DetectorState, 'sessionStart'>): boolean {
  return detectorKalanSaniye(state) > 0;
}

// ── YENİ SPEC API ─────────────────────────────────────────────────────────────

/**
 * Dedektör başlatılabilir mi?
 * - 'allowed'  → başlat (premium, aktif oturum, veya ücretsiz hak var)
 * - 'need_ad'  → ücretsiz hak bitti, reklam izleyerek 2. hak kazanılabilir
 * - 'denied'   → iki hak da tükendi, bugün kullanılamaz
 */
export async function canStartDetector(isPremium: boolean): Promise<'allowed' | 'need_ad' | 'denied'> {
  if (isPremium) return 'allowed';
  const state = await loadDetectorState();
  if (isDetectorSessionActive(state)) return 'allowed';
  if (!state.freeUsed) return 'allowed';
  if (!state.adUsed)   return 'need_ad';
  return 'denied';
}

/**
 * Dedektör oturumu başlat — uygun hakkı (önce ücretsiz, sonra reklam)
 * tüketir ve sessionStart timestamp'ini kaydeder.
 * Çağırmadan önce canStartDetector ile kontrol et.
 */
export async function markDetectorSessionStart(): Promise<void> {
  await resetDetectorIfNewDay();
  const state = await loadDetectorState();
  const updates: [string, string][] = [[DK.SESSION, String(Date.now())]];
  if (!state.freeUsed) {
    updates.push([DK.FREE, 'true']);
  } else if (!state.adUsed) {
    updates.push([DK.AD, 'true']);
  }
  await AsyncStorage.multiSet(updates);
}

/** Dedektör oturumunu kapat (timestamp sil). Hak tüketilmiş olarak kalır. */
export async function markDetectorSessionEnd(): Promise<void> {
  await AsyncStorage.removeItem(DK.SESSION);
}

// ── LEGACY COMPAT (analiz.tsx DL.* pattern'ı kullanıyor) ─────────────────────

/** @deprecated markDetectorSessionStart kullan */
export async function detectorTryStart(
  state: DetectorState,
): Promise<{ result: DetectorStartResult; state: DetectorState }> {
  await resetDetectorIfNewDay();

  if (isDetectorSessionActive(state)) {
    return { result: 'ok', state };
  }
  if (!state.freeUsed) {
    const sessionStart = Date.now();
    await AsyncStorage.multiSet([
      [DK.FREE,    'true'],
      [DK.SESSION, String(sessionStart)],
    ]);
    return { result: 'ok', state: { ...state, freeUsed: true, sessionStart } };
  }
  if (!state.adUsed) return { result: 'need_ad', state };
  return { result: 'exhausted', state };
}

/** @deprecated markDetectorSessionStart kullan */
export async function detectorStartAdSession(state: DetectorState): Promise<DetectorState> {
  const sessionStart = Date.now();
  await AsyncStorage.multiSet([
    [DK.AD,      'true'],
    [DK.SESSION, String(sessionStart)],
  ]);
  return { ...state, adUsed: true, sessionStart };
}

/** @deprecated markDetectorSessionEnd kullan */
export async function detectorEndSession(): Promise<void> {
  await AsyncStorage.removeItem(DK.SESSION);
}

// ── ANALİZ GÜNLÜK LIMIT ───────────────────────────────────────────────────────
// "Neden Ağlıyor Olabilir?" ekranı
// Ücretsiz: 1 hak/gün + 1 reklam hakkı = max 2 analiz/gün

const AK = {
  DATE: 'perm_analysis_date',
  FREE: 'perm_analysis_free_used',
  AD:   'perm_analysis_ad_used',
} as const;

async function resetAnalysisIfNewDay(): Promise<void> {
  const stored = await AsyncStorage.getItem(AK.DATE);
  if (stored === todayStr()) return;
  await AsyncStorage.multiSet([
    [AK.DATE, todayStr()],
    [AK.FREE, 'false'],
    [AK.AD,   'false'],
  ]);
}

/**
 * Ağlama analizi yapılabilir mi?
 * - 'allowed'  → kullanılabilir
 * - 'need_ad'  → ücretsiz hak bitti, reklam izle
 * - 'denied'   → günlük limit doldu
 */
export async function canUseAnalysis(isPremium: boolean): Promise<'allowed' | 'need_ad' | 'denied'> {
  if (isPremium) return 'allowed';
  await resetAnalysisIfNewDay();
  const results = await AsyncStorage.multiGet([AK.FREE, AK.AD]);
  const freeUsed = results[0][1] === 'true';
  const adUsed   = results[1][1] === 'true';
  if (!freeUsed) return 'allowed';
  if (!adUsed)   return 'need_ad';
  return 'denied';
}

/** Analiz kullanıldı olarak işaretle — çağırmadan önce canUseAnalysis kontrol et. */
export async function markAnalysisUsed(): Promise<void> {
  await resetAnalysisIfNewDay();
  const results = await AsyncStorage.multiGet([AK.FREE, AK.AD]);
  const freeUsed = results[0][1] === 'true';
  const key = !freeUsed ? AK.FREE : AK.AD;
  await AsyncStorage.setItem(key, 'true');
}

/**
 * Her uygulama açılışında çağrılır.
 * Gün değişmişse dedektör ve analiz limitlerini sıfırlar.
 */
export async function resetDailyIfNeeded(): Promise<void> {
  await Promise.all([resetDetectorIfNewDay(), resetAnalysisIfNewDay()]);
}
