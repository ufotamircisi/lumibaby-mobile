// services/cryDetectionEngine.ts
// Profesyonel 4 katmanlı bebek ağlama tespiti
// Hem Ağlama hem Kolik dedektörü tarafından kullanılır

import AsyncStorage from '@react-native-async-storage/async-storage';

// ── SABITLER ─────────────────────────────────────────────────────────────────
export const WINDOW_SIZE_MS    = 500;
export const DETECTION_WINDOWS = 6;    // 3 saniyelik analiz penceresi
export const COOLDOWN_MS       = 8000; // tetiklemeden sonra bekleme süresi
export const MIN_CRY_WINDOWS   = 3;    // 6 pencereden en az 3'ü yüksek olmalı

export const CONFIDENCE_THRESHOLD = {
  high:     60,  // Yüksek Hassasiyet — daha az kaçırır, daha fazla yanlış pozitif
  balanced: 72,  // Dengeli — önerilen
  strict:   85,  // Yalnızca Belirgin — güvenli algılama
} as const;

export type SensitivityLevel = 'high' | 'balanced' | 'strict';

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
  private windows:     number[] = [];   // son DETECTION_WINDOWS adet dB ölçümü
  private ambient:     number   = -50;  // kalibrasyon sırasında ölçülen arka plan sesi
  private patterns:    number[][] = []; // öğrenilmiş ağlama örüntüleri (normalize edilmiş)
  private lastTrigger: number   = 0;    // son tetikleyici zamanı (ms)

  // Confidence skoru — dışarıdan okunabilir
  public  lastConfidence: number = 0;

  // ── KALİBRASYON ────────────────────────────────────────────────────────────
  calibrate(samples: number[]): void {
    if (samples.length === 0) return;
    const sorted  = [...samples].sort((a, b) => a - b);
    const mid     = sorted[Math.floor(sorted.length * 0.5)];  // medyan
    this.ambient  = mid;
    this.windows  = [];
    this.lastConfidence = 0;
  }

  // ── ANA ANALİZ FONKSİYONU ──────────────────────────────────────────────────
  // Dönen değer: confidence skoru (0-100)
  // mode: hangi dedektörde kullanıldığı ('aglama' | 'kolik') — şimdilik aynı mantık
  analyze(db: number, _mode: 'aglama' | 'kolik'): number {
    // Cooldown kontrolü
    if (Date.now() - this.lastTrigger < COOLDOWN_MS) {
      this.lastConfidence = 0;
      return 0;
    }

    // Pencereye ekle
    this.windows.push(db);
    if (this.windows.length > DETECTION_WINDOWS) {
      this.windows.shift();
    }

    // Yeterli pencere yok
    if (this.windows.length < DETECTION_WINDOWS) {
      this.lastConfidence = 0;
      return 0;
    }

    const score = this._computeConfidence(this.windows);
    this.lastConfidence = score;
    return score;
  }

  // Tetikleyici bildir (cooldown başlat)
  triggerDetected(): void {
    this.lastTrigger = Date.now();
    this.windows     = [];
  }

  // Cooldown bitti mi?
  isCoolingDown(): boolean {
    return Date.now() - this.lastTrigger < COOLDOWN_MS;
  }

  // Kalan cooldown ms
  cooldownRemaining(): number {
    const remaining = COOLDOWN_MS - (Date.now() - this.lastTrigger);
    return Math.max(0, remaining);
  }

  reset(): void {
    this.windows        = [];
    this.lastTrigger    = 0;
    this.lastConfidence = 0;
  }

  // ── PATTERN ÖĞRENME ────────────────────────────────────────────────────────
  // Mevcut pencereyi öğrenilmiş örüntülere ekle (bebek sakinleştiğinde çağrılır)
  async saveCurrentPattern(): Promise<void> {
    if (this.windows.length < DETECTION_WINDOWS) return;
    const normalized = normalizeDbSequence([...this.windows]);
    this.patterns    = [normalized, ...this.patterns].slice(0, MAX_PATTERNS);
    try {
      await AsyncStorage.setItem(PATTERN_STORAGE_KEY, JSON.stringify(this.patterns));
    } catch {}
  }

  async loadPatterns(): Promise<void> {
    try {
      const raw = await AsyncStorage.getItem(PATTERN_STORAGE_KEY);
      if (raw) this.patterns = JSON.parse(raw);
    } catch {}
  }

  // ── SKORING ─────────────────────────────────────────────────────────────────
  private _computeConfidence(win: number[]): number {
    const YUKSEK_ESIK = this.ambient + 20; // ortam + 20 dB = ağlama eşiği
    let score = 0;

    // ── KATMAN 1: Genlik (Amplitude) ─────────────────────────────────────────
    const highCount = win.filter(v => v >= YUKSEK_ESIK).length;
    if (highCount >= MIN_CRY_WINDOWS) {
      score += 25; // yeterli süre yüksek
    }
    // Sürekli yükselen trend
    let rising = 0;
    for (let i = 1; i < win.length; i++) { if (win[i] > win[i - 1]) rising++; }
    if (rising >= 3) score += 10;
    // Tek tepe (spike) filtresi — yalnız bir pencere yüksek: muhtemelen gürültü
    if (highCount === 1) score -= 25;

    // ── KATMAN 2: Frekans yaklaşımı (dB varyansı) ──────────────────────────
    const mean     = win.reduce((a, b) => a + b, 0) / win.length;
    const variance = win.reduce((acc, v) => acc + (v - mean) ** 2, 0) / win.length;
    // Orta varyans: bebek ağlaması (4-30 dB²) — aralığı genişlet
    if (variance >= 4 && variance <= 30) score += 25;
    // Çok düşük varyans: düz fan / ambient sesi — false positive filtresi
    if (variance < 2) score -= 25;
    // Çok düzgün: monoton arka plan sesi
    if (variance < 4) score -= 15;

    // ── KATMAN 3: Ritim analizi ───────────────────────────────────────────────
    // 3-5/6 yüksek pencere varsa iyi ritim
    if (highCount >= 3 && highCount <= 5) score += 20;
    // Tüm 6 pencere yüksek: TV/hoparlör üzerinden ses normal olabilir, hafif ceza
    if (highCount === 6) score -= 15;
    // Periyodik geçişler: yüksek-düşük-yüksek benzeri patern
    let transitions = 0;
    for (let i = 1; i < win.length; i++) {
      const prev = win[i - 1] >= YUKSEK_ESIK;
      const curr = win[i]     >= YUKSEK_ESIK;
      if (prev !== curr) transitions++;
    }
    if (transitions >= 1 && transitions <= 4) score += 15; // doğal ritim
    // Horlama filtresi: çok yavaş varyasyon + sabit ses
    if (transitions === 0 && variance < 8) score -= 20;

    // ── KATMAN 4: Öğrenilmiş örüntü benzerliği ────────────────────────────────
    if (this.patterns.length > 0) {
      const normalized = normalizeDbSequence([...win]);
      let maxSim = 0;
      for (const p of this.patterns) {
        const sim = cosineSimilarity(normalized, p);
        if (sim > maxSim) maxSim = sim;
      }
      // Cosine similarity 0-1 arası, 0-15 puan
      score += Math.round(maxSim * 15);
    }

    return Math.max(0, Math.min(100, score));
  }
}
