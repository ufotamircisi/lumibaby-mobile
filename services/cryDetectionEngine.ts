// services/cryDetectionEngine.ts
// YAMNet TFLite-based baby cry detection engine

import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import { loadTensorflowModel, type TfliteModel } from 'react-native-fast-tflite';
import { Platform } from 'react-native';

// ── YAMNet class indices ──────────────────────────────────────────────────────
const BABY_CRY_INDEX = 20;
const CRYING_INDEX   = 19;
const WHIMPER_INDEX  = 21;

// ── Audio config ──────────────────────────────────────────────────────────────
const WINDOW_MS        = 975;
const SAMPLE_RATE      = 16000;
const EXPECTED_SAMPLES = 15600;

// ── Detection config ──────────────────────────────────────────────────────────
export const COOLDOWN_MS               = 10000;
const        SILENCE_WINDOWS_THRESHOLD = 62;    // ~60 s of consecutive low-score windows

export const CONFIDENCE_THRESHOLD = {
  high:     0.35,
  balanced: 0.50,
  strict:   0.70,
} as const;

export type SensitivityLevel = 'high' | 'balanced' | 'strict';

export interface CryDetectionCallbacks {
  onDetected:        (confidence: number) => void;
  onSilenceDetected: () => void;
}

// iOS recording options that produce a PCM WAV file
const IOS_RECORDING_OPTIONS: Audio.RecordingOptions = {
  isMeteringEnabled: false,
  android: {
    extension:     '.wav',
    outputFormat:  Audio.AndroidOutputFormat.DEFAULT,
    audioEncoder:  Audio.AndroidAudioEncoder.DEFAULT,
    sampleRate:    SAMPLE_RATE,
    numberOfChannels: 1,
    bitRate:       256000,
  },
  ios: {
    extension:          '.wav',
    outputFormat:       Audio.IOSOutputFormat.LINEARPCM,
    audioQuality:       Audio.IOSAudioQuality.HIGH,
    sampleRate:         SAMPLE_RATE,
    numberOfChannels:   1,
    bitRate:            256000,
    linearPCMBitDepth:  16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat:   false,
  },
  web: {},
};

// ── Engine class ──────────────────────────────────────────────────────────────
export class CryDetectionEngine {
  public  lastConfidence: number = 0;

  private model:              TfliteModel | null = null;
  private isListening:        boolean = false;
  private silenceWindowCount: number  = 0;
  private lastTriggerTime:    number  = 0;

  // ── Model loading ───────────────────────────────────────────────────────────
  async loadModel(): Promise<void> {
    if (this.model) return;
    try {
      this.model = await loadTensorflowModel(
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        require('../assets/models/yamnet.tflite'),
        [], // use default CPU delegate
      );
    } catch (e) {
      console.log('[CryEngine] model load error:', e);
    }
  }

  // ── Public state queries ────────────────────────────────────────────────────
  isCoolingDown(): boolean {
    return Date.now() - this.lastTriggerTime < COOLDOWN_MS;
  }

  cooldownRemaining(): number {
    return Math.max(0, COOLDOWN_MS - (Date.now() - this.lastTriggerTime));
  }

  reset(): void {
    this.lastConfidence    = 0;
    this.silenceWindowCount = 0;
    this.lastTriggerTime   = 0;
  }

  // ── Listening control ───────────────────────────────────────────────────────
  async startListening(
    sensitivity: SensitivityLevel,
    callbacks:   CryDetectionCallbacks,
  ): Promise<void> {
    if (this.isListening) return;
    await this.loadModel();
    // Set PlayAndRecord mode once — stays until stopListening
    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS:      true,
        playsInSilentModeIOS:    true,
        staysActiveInBackground: true,
      });
    } catch {}
    this.isListening        = true;
    this.silenceWindowCount = 0;
    this._runLoop(sensitivity, callbacks);
  }

  stopListening(): void {
    this.isListening = false;
    // Restore Playback mode
    Audio.setAudioModeAsync({
      allowsRecordingIOS:      false,
      playsInSilentModeIOS:    true,
      staysActiveInBackground: true,
    }).catch(() => {});
  }

  // ── Internal loop ───────────────────────────────────────────────────────────
  private async _runLoop(
    sensitivity: SensitivityLevel,
    callbacks:   CryDetectionCallbacks,
  ): Promise<void> {
    while (this.isListening) {
      try {
        const samples = await this._recordWindow();

        if (!samples || !this.model || !this.isListening) continue;

        const score = this._runInference(samples);
        this.lastConfidence = score;

        const threshold = CONFIDENCE_THRESHOLD[sensitivity];

        if (score >= threshold && !this.isCoolingDown()) {
          this.lastTriggerTime    = Date.now();
          this.silenceWindowCount = 0;
          callbacks.onDetected(score);
        } else if (score < threshold) {
          this.silenceWindowCount++;
          if (this.silenceWindowCount >= SILENCE_WINDOWS_THRESHOLD) {
            this.silenceWindowCount = 0;
            if (this.isListening) callbacks.onSilenceDetected();
          }
        } else {
          // score above threshold but in cooldown — not silence
          this.silenceWindowCount = 0;
        }
      } catch (e) {
        console.log('[CryEngine] loop error:', e);
      }
    }
  }

  // ── Recording ───────────────────────────────────────────────────────────────
  private async _recordWindow(): Promise<Float32Array | null> {
    let recording: Audio.Recording | null = null;
    let uri: string | null = null;

    try {
      const opts = Platform.OS === 'ios'
        ? IOS_RECORDING_OPTIONS
        : Audio.RecordingOptionsPresets.HIGH_QUALITY;

      recording = new Audio.Recording();
      await recording.prepareToRecordAsync(opts);
      await recording.startAsync();
      await new Promise<void>(res => setTimeout(res, WINDOW_MS));
      await recording.stopAndUnloadAsync();
      uri = recording.getURI() ?? null;
      recording = null;

      if (!uri) return null;

      const b64 = await FileSystem.readAsStringAsync(uri, {
        encoding: 'base64',
      });
      await FileSystem.deleteAsync(uri, { idempotent: true });

      return this._parseWav(b64);
    } catch (e) {
      console.log('[CryEngine] record error:', e);
      if (recording) {
        try { await recording.stopAndUnloadAsync(); } catch {}
      }
      if (uri) {
        try { await FileSystem.deleteAsync(uri, { idempotent: true }); } catch {}
      }
      return null;
    }
  }

  // ── WAV parser ───────────────────────────────────────────────────────────────
  // Finds the PCM 'data' chunk in a WAV file and converts int16 → float32.
  // Returns null if the file isn't a valid PCM WAV.
  private _parseWav(base64: string): Float32Array | null {
    try {
      const bin   = atob(base64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);

      // Scan for 'data' chunk marker
      let dataOffset = -1;
      let dataLength = 0;
      for (let i = 0; i < bytes.length - 8; i++) {
        if (
          bytes[i]   === 0x64 && // d
          bytes[i+1] === 0x61 && // a
          bytes[i+2] === 0x74 && // t
          bytes[i+3] === 0x61    // a
        ) {
          dataLength =
            bytes[i+4]        |
            (bytes[i+5] << 8) |
            (bytes[i+6] << 16)|
            (bytes[i+7] << 24);
          dataOffset = i + 8;
          break;
        }
      }
      if (dataOffset < 0 || dataLength <= 0) return null;

      const sampleCount = Math.min(dataLength >> 1, EXPECTED_SAMPLES);
      const pcm         = new Float32Array(EXPECTED_SAMPLES); // zero-pad to exact size
      const view        = new DataView(bytes.buffer, dataOffset);
      for (let i = 0; i < sampleCount; i++) {
        pcm[i] = view.getInt16(i * 2, true) / 32768.0;
      }
      return pcm;
    } catch {
      return null;
    }
  }

  // ── TFLite inference ─────────────────────────────────────────────────────────
  private _runInference(samples: Float32Array): number {
    if (!this.model) return 0;
    try {
      const rawOutputs = this.model.runSync([samples.buffer as ArrayBuffer]);
      const scores     = new Float32Array(rawOutputs[0]);
      if (!scores || scores.length < 22) return 0;
      return Math.min(
        1.0,
        scores[BABY_CRY_INDEX] +
        scores[CRYING_INDEX]   * 0.8 +
        scores[WHIMPER_INDEX]  * 0.6,
      );
    } catch (e) {
      console.log('[CryEngine] inference error:', e);
      return 0;
    }
  }
}
