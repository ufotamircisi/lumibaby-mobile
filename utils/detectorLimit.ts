import AsyncStorage from '@react-native-async-storage/async-storage';

const KEYS = {
  DATE:    'detector_daily_date',
  FREE:    'detector_free_used',
  AD:      'detector_ad_used',
  SESSION: 'detector_session_start',
} as const;

export const DETECTOR_SESSION_MS = 60 * 60 * 1000; // 60 dakika

export interface DetectorState {
  freeUsed: boolean;
  adUsed: boolean;
  sessionStart: number | null;
}

export type DetectorStartResult = 'ok' | 'need_ad' | 'exhausted';

function todayStr(): string {
  return new Date().toISOString().split('T')[0];
}

async function resetIfNewDay(): Promise<void> {
  const stored = await AsyncStorage.getItem(KEYS.DATE);
  if (stored === todayStr()) return;
  await AsyncStorage.multiSet([
    [KEYS.DATE, todayStr()],
    [KEYS.FREE, 'false'],
    [KEYS.AD,   'false'],
  ]);
  await AsyncStorage.removeItem(KEYS.SESSION);
}

export async function loadDetectorState(): Promise<DetectorState> {
  await resetIfNewDay();
  const results = await AsyncStorage.multiGet([KEYS.FREE, KEYS.AD, KEYS.SESSION]);
  const sessionRaw = results[2][1];
  return {
    freeUsed:     results[0][1] === 'true',
    adUsed:       results[1][1] === 'true',
    sessionStart: sessionRaw ? parseInt(sessionRaw, 10) : null,
  };
}

export function detectorKalanSaniye(state: DetectorState): number {
  if (!state.sessionStart) return 0;
  const remaining = DETECTOR_SESSION_MS - (Date.now() - state.sessionStart);
  return Math.max(0, Math.ceil(remaining / 1000));
}

export function isDetectorSessionActive(state: DetectorState): boolean {
  return detectorKalanSaniye(state) > 0;
}

export async function detectorTryStart(
  state: DetectorState,
): Promise<{ result: DetectorStartResult; state: DetectorState }> {
  await resetIfNewDay();

  // Aktif oturum varsa devam et
  if (isDetectorSessionActive(state)) {
    return { result: 'ok', state };
  }

  // Ücretsiz hak kullan
  if (!state.freeUsed) {
    const sessionStart = Date.now();
    await AsyncStorage.multiSet([
      [KEYS.FREE,    'true'],
      [KEYS.SESSION, String(sessionStart)],
    ]);
    return { result: 'ok', state: { ...state, freeUsed: true, sessionStart } };
  }

  // Reklam hakkı mevcut
  if (!state.adUsed) {
    return { result: 'need_ad', state };
  }

  // Her iki hak da tükendi
  return { result: 'exhausted', state };
}

export async function detectorStartAdSession(
  state: DetectorState,
): Promise<DetectorState> {
  const sessionStart = Date.now();
  await AsyncStorage.multiSet([
    [KEYS.AD,      'true'],
    [KEYS.SESSION, String(sessionStart)],
  ]);
  return { ...state, adUsed: true, sessionStart };
}

export async function detectorEndSession(): Promise<void> {
  await AsyncStorage.removeItem(KEYS.SESSION);
}
