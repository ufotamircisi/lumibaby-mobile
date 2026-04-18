// services/cryDetectionEngine.ts
// Profesyonel 4 katmanlı bebek ağlama tespiti (dB tabanlı)
//
// TODO: YAMNet TFLite entegrasyonu hazır (services/cryDetectionEngine.yamnet.ts.bak)
//       react-native-fast-tflite NitroModules gerektiriyor — yeni EAS Build alınınca aktifleştirilecek.
//       Model: assets/models/yamnet.tflite (BABY_CRY_INDEX=20, CRYING_INDEX=19, WHIMPER_INDEX=21)

import AsyncStorage from '@react-native-async-storage/async-storage';

// ── SABITLER ─────────────────────────────────────────────────────────────────
export const WINDOW_SIZE_MS    = 500;
export const DETECTION_WINDOWS = 6;
export const COOLDOWN_MS       = 8000;
export const MIN_CRY_WINDOWS   = 3;

export const CONFIDENCE_THRESHOLD = {
  high:     60,
  balanced: 72,
  strict:   85,
} as const;

export type SensitivityLevel = 'high' | 'balanced' | 'strict';

export interface CryDetectionCallbacks {
  onDetected:        (confidence: number) => void;
  onSilenceDetected: () => void;
}

const PATTERN_STORAGE_KEY = 'lumibaby_cry_patterns';
const MAX_PATTERNS        = 20;

// ── YARDIMCI ─────────────────────────────────────────────────────────────────
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const len = Math.min(a.length, b.length);
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < len; i++) {
    dot   += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

function normalizeDbSequence(seq: number[]): number[] {
  const min = Math.min(...seq);
  const max = Math.max(...seq);
  const range = max - min;
  if (range === 0) return seq.map(() => 0);
  return seq.map(v => (v - min) / range);
}

// ── AĞLAMA TESPİT MOTORU ──────────────────────────────────────────────────────
export class CryDetectionEngine {
  private windows:     number[] = [];
  private ambient:     number   = -50;
  private patterns:    number[][] = [];
  private lastTrigger: number   = 0;

  public  lastConfidence: number = 0;

  private isListening:  boolean = false;
  private loopTimeout:  ReturnType<typeof setTimeout> | null = null;

  // ── KALİBRASYON ────────────────────────────────────────────────────────────
  calibrate(samples: number[]): void {
    if (samples.length === 0) return;
    const sorted = [...samples].sort((a, b) => a - b);
    this.ambient = sorted[Math.floor(sorted.length * 0.5)];
    this.windows = [];
    this.lastConfidence = 0;
  }

  // ── ANA ANALİZ ─────────────────────────────────────────────────────────────
  analyze(db: number, _mode: 'aglama' | 'kolik'): number {
    if (Date.now() - this.lastTrigger < COOLDOWN_MS) {
      this.lastConfidence = 0;
      return 0;
    }
    this.windows.push(db);
    if (this.windows.length > DETECTION_WINDOWS) this.windows.shift();
    if (this.windows.length < DETECTION_WINDOWS) { this.lastConfidence = 0; return 0; }
    const score = this._computeConfidence(this.windows);
    this.lastConfidence = score;
    return score;
  }

  triggerDetected(): void {
    this.lastTrigger = Date.now();
    this.windows     = [];
  }

  isCoolingDown(): boolean {
    return Date.now() - this.lastTrigger < COOLDOWN_MS;
  }

  cooldownRemaining(): number {
    return Math.max(0, COOLDOWN_MS - (Date.now() - this.lastTrigger));
  }

  reset(): void {
    this.windows        = [];
    this.lastTrigger    = 0;
    this.lastConfidence = 0;
  }

  // ── startListening / stopListening (YAMNet API uyumluluğu için stub) ────────
  // Gerçek döngü analiz.tsx'teki pollIntervalRef tarafından yönetilir.
  async startListening(
    _sensitivity: SensitivityLevel,
    _callbacks:   CryDetectionCallbacks,
  ): Promise<void> {
    this.isListening = true;
  }

  stopListening(): void {
    this.isListening = false;
    if (this.loopTimeout) { clearTimeout(this.loopTimeout); this.loopTimeout = null; }
  }

  // Model preload — YAMNet ile uyumlu stub
  async loadModel(): Promise<void> {}

  // ── PATTERN ÖĞRENME ────────────────────────────────────────────────────────
  async saveCurrentPattern(): Promise<void> {
    if (this.windows.length < DETECTION_WINDOWS) return;
    const normalized = normalizeDbSequence([...this.windows]);
    this.patterns    = [normalized, ...this.patterns].slice(0, MAX_PATTERNS);
    try { await AsyncStorage.setItem(PATTERN_STORAGE_KEY, JSON.stringify(this.patterns)); } catch {}
  }

  async loadPatterns(): Promise<void> {
    try {
      const raw = await AsyncStorage.getItem(PATTERN_STORAGE_KEY);
      if (raw) this.patterns = JSON.parse(raw);
    } catch {}
  }

  // ── SKORING ─────────────────────────────────────────────────────────────────
  private _computeConfidence(win: number[]): number {
    const YUKSEK_ESIK = this.ambient + 20;
    let score = 0;

    // Katman 1: Genlik
    const highCount = win.filter(v => v >= YUKSEK_ESIK).length;
    if (highCount >= MIN_CRY_WINDOWS) score += 25;
    let rising = 0;
    for (let i = 1; i < win.length; i++) { if (win[i] > win[i - 1]) rising++; }
    if (rising >= 3) score += 10;
    if (highCount === 1) score -= 25;

    // Katman 2: Varyans
    const mean     = win.reduce((a, b) => a + b, 0) / win.length;
    const variance = win.reduce((acc, v) => acc + (v - mean) ** 2, 0) / win.length;
    if (variance >= 4 && variance <= 30) score += 25;
    if (variance < 2) score -= 25;
    if (variance < 4) score -= 15;

    // Katman 3: Ritim
    if (highCount >= 3 && highCount <= 5) score += 20;
    if (highCount === 6) score -= 15;
    let transitions = 0;
    for (let i = 1; i < win.length; i++) {
      const prev = win[i - 1] >= YUKSEK_ESIK;
      const curr = win[i]     >= YUKSEK_ESIK;
      if (prev !== curr) transitions++;
    }
    if (transitions >= 1 && transitions <= 4) score += 15;
    if (transitions === 0 && variance < 8) score -= 20;

    // Katman 4: Öğrenilmiş örüntü benzerliği
    if (this.patterns.length > 0) {
      const normalized = normalizeDbSequence([...win]);
      let maxSim = 0;
      for (const p of this.patterns) {
        const sim = cosineSimilarity(normalized, p);
        if (sim > maxSim) maxSim = sim;
      }
      score += Math.round(maxSim * 15);
    }

    return Math.max(0, Math.min(100, score));
  }
}
