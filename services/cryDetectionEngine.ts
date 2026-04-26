// services/cryDetectionEngine.ts
// YAMNet TFLite bebek ağlama tespiti
// Model: assets/models/yamnet.tflite
// BABY_CRY_INDEX=20, CRYING_INDEX=19, WHIMPER_INDEX=21
//
// startListening/stopListening: analiz.tsx kendi kayıt döngüsünü yönetir; bu metodlar
// YAMNet'in doğrudan bağımsız döngü olarak kullanılacağı (gelecek) entegrasyon içindir.
// analyze(db) çağrısında; YAMNet döngüsü aktifse lastScore, değilse genlik proxy döner.

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system';

// ── EXPORTS (analiz.tsx bunları kullanıyor — değiştirme) ──────────────────────
export const WINDOW_SIZE_MS    = 500;
export const DETECTION_WINDOWS = 6;
export const COOLDOWN_MS       = 8000;
export const MIN_CRY_WINDOWS   = 3;

export const CONFIDENCE_THRESHOLD = {
  high:     60,
  balanced: 72,
  strict:   85,
} as const;

// YAMNet ham skor eşikleri (0-100 aralığı)
// 0-24 → sessizlik / 25-59 → şüpheli / 60+ → kesin ağlama
export const YAMNET_CRY_THRESHOLD: Record<SensitivityLevel, number> = {
  high:     25,  // hafif ağlamayı da yakala
  balanced: 40,  // default
  strict:   60,  // sadece çok net ağlama
};

export type SensitivityLevel = 'high' | 'balanced' | 'strict';

export interface CryDetectionCallbacks {
  onDetected:        (confidence: number) => void;
  onSilenceDetected: () => void;
}

// ── YAMNet SINIFLANDIRICI İNDEKSLERİ ─────────────────────────────────────────
const CRYING_INDEX   = 19;
const BABY_CRY_INDEX = 20;
const WHIMPER_INDEX  = 21;

// YAMNet girişi: 16kHz × 975ms = 15600 Float32 örnek
const YAMNET_FRAME_LEN = 15600;
const YAMNET_RATE      = 16000;

const PATTERN_STORAGE_KEY = 'lumibaby_cry_patterns';

// ── WAV ÇÖZÜCÜ ────────────────────────────────────────────────────────────────
// base64 WAV dosyasını PCM Float32 örneklerine dönüştürür.
// WAV başlığından gerçek sample rate okunur.
function parseWav(base64: string): { samples: Float32Array; sampleRate: number } | null {
  try {
    const binary = atob(base64);
    const buf    = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) buf[i] = binary.charCodeAt(i);

    // RIFF/WAVE doğrulama
    if (buf[0] !== 0x52 || buf[1] !== 0x49 || buf[2] !== 0x46 || buf[3] !== 0x46) return null;

    // fmt chunk: byte 24-27 = sampleRate (LE int32), byte 16-19 = subchunk1 size
    const sampleRate = buf[24] | (buf[25] << 8) | (buf[26] << 16) | (buf[27] << 24);
    const fmtSize    = buf[16] | (buf[17] << 8) | (buf[18] << 16) | (buf[19] << 24);

    // 'data' chunk'ı bul
    let offset = 20 + fmtSize;
    while (offset + 8 < buf.length) {
      const tag = String.fromCharCode(buf[offset], buf[offset + 1], buf[offset + 2], buf[offset + 3]);
      const chunkSize = buf[offset + 4] | (buf[offset + 5] << 8) | (buf[offset + 6] << 16) | (buf[offset + 7] << 24);
      if (tag === 'data') {
        offset += 8;
        break;
      }
      offset += 8 + chunkSize;
    }
    if (offset >= buf.length) return null;

    // Int16LE → Float32 [-1, 1]
    const pcm     = buf.slice(offset);
    const samples = new Float32Array(pcm.length >> 1);
    for (let i = 0; i < samples.length; i++) {
      let v = (pcm[i * 2 + 1] << 8) | pcm[i * 2];
      if (v > 32767) v -= 65536;
      samples[i] = v / 32768.0;
    }
    return { samples, sampleRate };
  } catch {
    return null;
  }
}

// En yakın komşu yeniden örnekleme
function resample(src: Float32Array, fromRate: number, toRate: number): Float32Array {
  if (fromRate === toRate) return src;
  const ratio = fromRate / toRate;
  const len   = Math.floor(src.length / ratio);
  const out   = new Float32Array(len);
  for (let i = 0; i < len; i++) out[i] = src[Math.floor(i * ratio)];
  return out;
}

// Sabit uzunluğa kırp veya sıfırla doldur
function padOrTrim(src: Float32Array, len: number): Float32Array {
  if (src.length === len) return src;
  const out = new Float32Array(len);
  out.set(src.subarray(0, Math.min(src.length, len)));
  return out;
}

// 16kHz tek kanal PCM WAV kayıt seçenekleri — iOS ve Android
const IOS_RECORDING_OPTIONS = {
  ios: {
    extension:           '.wav',
    outputFormat:        'lpcm' as any,  // IOSOutputFormat.LINEARPCM
    audioQuality:        127,            // IOSAudioQuality.MAX
    sampleRate:          YAMNET_RATE,
    numberOfChannels:    1,
    bitRate:             256000,
    linearPCMBitDepth:   16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat:    false,
  },
  android: { extension: '.wav', outputFormat: 0, audioEncoder: 0, sampleRate: YAMNET_RATE, numberOfChannels: 1, bitRate: 256000 },
  web:     { mimeType: 'audio/wav', bitsPerSample: 16 },
};

export const WAV_RECORDING_OPTIONS = IOS_RECORDING_OPTIONS;

// ── AĞLAMA TESPİT MOTORU ──────────────────────────────────────────────────────
export class CryDetectionEngine {
  // YAMNet modeli (lazy-loaded)
  private model:       any | null = null;
  private modelLoaded: boolean    = false;

  // Çalışma durumu
  private lastTrigger: number  = 0;
  private lastScore:   number  = 0;
  private ambientDb:   number  = -50;

  // Dinleme döngüsü
  private isListening: boolean = false;
  private loopTimeout: ReturnType<typeof setTimeout> | null = null;

  public lastConfidence:  number = 0;
  public yamnetThreshold: number = YAMNET_CRY_THRESHOLD.balanced;
  public lastDb:          number = -50;

  // ── MODEL YÜKLEME ────────────────────────────────────────────────────────────
  async loadModel(): Promise<void> {
    if (this.modelLoaded) return;

    // NitroModules (react-native-fast-tflite) kurulu değilse sessizce çık
    let tflite: any;
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      tflite = require('react-native-fast-tflite');
    } catch (e) {
      console.log('[YAMNet] NitroModules yok, genlik proxy aktif');
      this.model       = null;
      this.modelLoaded = false;
      return;
    }

    try {
      const { loadTensorflowModel } = tflite;
      this.model = await loadTensorflowModel(
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        require('../assets/models/yamnet.tflite'),
        [],  // boş delegates = CPU çıkarımı
      );
      this.modelLoaded = true;
      console.log('[YAMNet] Model başarıyla yüklendi ✅');
    } catch (e) {
      console.error('[YAMNet] Model yüklenemedi:', e);
      console.log('[YAMNet] model null mu:', this.model === null);
      this.model       = null;
      this.modelLoaded = false;
    }
  }

  // ── KALİBRASYON ─────────────────────────────────────────────────────────────
  calibrate(samples: number[]): void {
    if (samples.length === 0) return;
    const sorted   = [...samples].sort((a, b) => a - b);
    this.ambientDb = sorted[Math.floor(sorted.length * 0.5)];
    this.lastScore = 0;
    this.lastConfidence = 0;
  }

  configure(sensitivity: SensitivityLevel): void {
    this.yamnetThreshold = YAMNET_CRY_THRESHOLD[sensitivity];
  }

  getAmplitudeScore(): number {
    if (this.ambientDb === 0) return 0;
    const diff = this.lastDb - this.ambientDb;
    return Math.min(100, Math.max(0, Math.round(diff * 3)));
  }

  // ── WAV'DAN YAMNet ÇIKARIMI ──────────────────────────────────────────────────
  // analiz.tsx burst döngüsünden çağrılır: uri → base64 → PCM → model → skor (0-100)
  async inferFromWav(uri: string): Promise<number> {
    console.log('[YAMNet] inferFromWav çağrıldı, modelLoaded:', this.modelLoaded);
    if (!this.modelLoaded) await this.loadModel();
    if (!this.model) {
      console.log('[YAMNet] Model null, 0 dönüyor');
      return 0;
    }
    try {
      const base64 = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' });
      const parsed = parseWav(base64);
      if (!parsed) return 0;
      const { samples, sampleRate } = parsed;
      const resampled = resample(samples, sampleRate, YAMNET_RATE);
      const input     = padOrTrim(resampled, YAMNET_FRAME_LEN);
      const outputs: ArrayBuffer[] = this.model.runSync([input.buffer as ArrayBuffer]);
      if (!outputs?.length) return 0;
      const scores     = new Float32Array(outputs[0]);
      const confidence = Math.max(
        scores[CRYING_INDEX]   ?? 0,
        scores[BABY_CRY_INDEX] ?? 0,
        scores[WHIMPER_INDEX]  ?? 0,
      ) * 100;
      const score = Math.round(Math.min(100, confidence));
      console.log('[YAMNet] Score:', score);
      this.lastScore      = score;
      this.lastConfidence = score;
      return score;
    } catch (e) {
      console.error('[YAMNet] parseWav hatası:', e);
      return 0;
    }
  }

  // ── ANA ANALİZ ──────────────────────────────────────────────────────────────
  // Burst döngüsünde kullanılmaz — geriye uyumluluk için bırakıldı.
  // lastScore > 0 ise (inferFromWav doldurmuş) onu döndürür, aksi hâlde genlik proxy.
  analyze(db: number, _mode: 'aglama' | 'kolik'): number {
    if (Date.now() - this.lastTrigger < COOLDOWN_MS) {
      this.lastConfidence = 0;
      return 0;
    }

    if (this.lastScore > 0) {
      this.lastConfidence = this.lastScore;
      return this.lastScore;
    }

    // YAMNet sonucu yok — genlik proxy
    const aboveAmbient  = Math.max(0, db - this.ambientDb);
    const score         = Math.min(100, Math.round(aboveAmbient * 3));
    this.lastScore      = score;
    this.lastConfidence = score;
    return score;
  }

  triggerDetected(): void {
    this.lastTrigger = Date.now();
    this.lastScore   = 0;
  }

  isCoolingDown(): boolean {
    return Date.now() - this.lastTrigger < COOLDOWN_MS;
  }

  cooldownRemaining(): number {
    return Math.max(0, COOLDOWN_MS - (Date.now() - this.lastTrigger));
  }

  reset(): void {
    this.lastTrigger    = 0;
    this.lastScore      = 0;
    this.lastConfidence = 0;
  }

  // ── startListening / stopListening ───────────────────────────────────────────
  // YAMNet bağımsız kayıt döngüsünü başlatır.
  // analiz.tsx şu an kendi döngüsünü yönetiyor; bu metodlar tam entegrasyon içindir.
  async startListening(
    _sensitivity: SensitivityLevel,
    _callbacks:   CryDetectionCallbacks,
  ): Promise<void> {
    this.isListening = true;
    if (!this.modelLoaded) await this.loadModel();
    this._runLoop();
  }

  stopListening(): void {
    this.isListening = false;
    if (this.loopTimeout) {
      clearTimeout(this.loopTimeout);
      this.loopTimeout = null;
    }
  }

  // ── YAMNet ÇIKARIM DÖNGÜSÜ ───────────────────────────────────────────────────
  private _runLoop(): void {
    if (!this.isListening || !this.model) return;
    this._recordAndInfer()
      .catch(() => {})
      .finally(() => {
        if (this.isListening) {
          // 975ms kayıt + 100ms boşluk → ~1.075s döngü
          this.loopTimeout = setTimeout(() => this._runLoop(), 100);
        }
      });
  }

  private async _recordAndInfer(): Promise<void> {
    if (!this.model || !this.isListening) return;
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { Audio } = require('expo-av');
    let rec: any = null;
    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS:     true,
        playsInSilentModeIOS:   true,
        staysActiveInBackground: true,
        shouldDuckAndroid:      false,
      });
      const { recording } = await Audio.Recording.createAsync(
        IOS_RECORDING_OPTIONS as any,
      );
      rec = recording;

      // Tam olarak 975ms kayıt = 16000 × 0.975 = 15600 örnek
      await new Promise<void>(res => setTimeout(res, 975));

      if (!this.isListening) {
        await rec.stopAndUnloadAsync();
        return;
      }
      await rec.stopAndUnloadAsync();
      const uri: string | null = rec.getURI();
      rec = null;
      if (!uri) return;

      const base64 = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' });
      const parsed = parseWav(base64);
      if (!parsed) return;

      const { samples, sampleRate } = parsed;
      const resampled   = resample(samples, sampleRate, YAMNET_RATE);
      const input       = padOrTrim(resampled, YAMNET_FRAME_LEN);
      const outputs: ArrayBuffer[] = this.model.runSync([input.buffer as ArrayBuffer]);
      if (!outputs?.length) return;

      const scores     = new Float32Array(outputs[0]);
      const confidence = Math.max(
        scores[CRYING_INDEX]   ?? 0,
        scores[BABY_CRY_INDEX] ?? 0,
        scores[WHIMPER_INDEX]  ?? 0,
      ) * 100;
      this.lastScore = Math.round(Math.min(100, confidence));
    } catch {
      if (rec) { try { await rec.stopAndUnloadAsync(); } catch {} }
    }
  }

  // ── PATTERN ÖĞRENME (analiz.tsx API uyumluluğu) ───────────────────────────────
  async saveCurrentPattern(): Promise<void> {
    // YAMNet kendi gömme vektörlerini kullanır — dB pattern öğrenme gerekmiyor
  }

  async loadPatterns(): Promise<void> {
    try {
      await AsyncStorage.getItem(PATTERN_STORAGE_KEY);
    } catch {}
    // loadPatterns çağrısını model yüklemeye bağla (analiz.tsx mount'ından tetiklenir)
    if (!this.modelLoaded) this.loadModel().catch(() => {});
  }
}
