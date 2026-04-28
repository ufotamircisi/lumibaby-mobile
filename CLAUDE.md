# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npx expo start          # Start dev server (Expo Go or dev client)
npx expo start --android
npx expo start --ios
expo lint               # ESLint (expo lint)
```

> **AdMob and RevenueCat native modules do not work in Expo Go.** Use a dev client build (`expo-dev-client`) for any feature involving ads or in-app purchases. The app detects Expo Go via `expo-constants.executionEnvironment === 'storeClient'` and silently skips those modules.

## Architecture

### Routing

Expo Router (file-based). Entry point is `app/_layout.tsx` (root layout), which:
1. Checks `lumibaby_onboarding_done` in AsyncStorage — redirects to `/onboarding` on first launch, otherwise to `/(tabs)/analiz`.
2. Wraps everything in `<PremiumProvider>`.

Tab screens live in `app/(tabs)/`:
- `analiz` — AI cry/sleep detector (default tab)
- `index` — Ninniler (lullabies)
- `kolik` — Kolik sesleri (colic sounds)
- `hikayeler` — Bedtime stories
- `sesim` — Record mom's voice

### Premium / Monetization

**Single source of truth: `contexts/PremiumContext.tsx`** (accessed via `hooks/usePremium.ts` re-export).

Three states: `'trial'` | `'premium'` | `'free'`.
- Trial = 7 days from first launch (`lumibaby_trial_start` in AsyncStorage).
- Premium = RevenueCat entitlement `'premium'` OR `partner_premium === 'true'` (partner QR sync).
- Free = trial expired + no active subscription.

`canAccessPremium` is true for both trial and premium. The pattern used throughout screens:
```ts
const { isPremium, isTrial } = usePremium();
const free = !isPremium && !isTrial;
```

**Premium RC cache** (`lumibaby_rc_premium_cache`) expires after 1 hour to avoid hammering RevenueCat.

**Daily usage limits** (free users only) are stored per-feature with keys `detectorDailyUsage`, `cryHelperDailyUsage`, `uykuDedektorDailyUsage`. Each allows 1 free use + 1 rewarded-ad use per day.

### Premium item gating (audio)

**Single source of truth: `utils/premiumItems.ts`**

```ts
const PREMIUM_IDS: number[] = [998, 999];
export function isItemPremium(item: { id: string | number }): boolean
```

- ID 999 = anne sesi ninni (index.tsx) + anne sesi pış pış (kolik.tsx)
- ID 998 = anne sesi pış pış (analiz.tsx sesList)
- IDs 1–10 = regular ninniler — ALL free
- All kolik sounds (1–22 range) — ALL free

**Never add a `premium: boolean` field to audio item types.** Always call `isItemPremium(item)` instead.

### Audio

**Global singleton: `services/audioManager.ts`**

Rules:
- No screen creates `Audio.Sound` directly — always use `audioManager.play(file, id, tab, options)`.
- `audioManager.stop()` unloads and clears active sound across all tabs.
- Race conditions handled via monotonically increasing `playGeneration` token.
- `AudioTab` type: `'ninniler' | 'kolik' | 'hikayeler' | 'analiz' | 'sesim'`

### Cry Detection

`services/cryDetectionEngine.ts` — uses `react-native-fast-tflite` with `assets/models/yamnet.tflite`. Sensitivity levels: `'high' | 'balanced' | 'strict'` (stored in `lumibaby_hassasiyet`).

### Localisation

Two languages: Turkish (`'tr'`, default) + English (`'en'`). Stored in `lumibaby_lang`.

`hooks/useLang.ts` uses a module-level singleton (`_lang`, `_listeners`) so all components update simultaneously when language changes — no Context provider needed. Access translations via `const { lang, t } = useLang()`.

All strings live in `constants/translations.ts`. Add both `tr` and `en` entries for every new string.

### Detector Limit System

`utils/detectorLimit.ts` — separate from PremiumContext's daily usage. Used specifically for the sleep/cry detector feature with AsyncStorage keys:
- `detector_daily_date` / `detector_free_used` / `detector_ad_used` / `detector_session_start`
- Session duration: 60 minutes (`DETECTOR_SESSION_MS`)
- `detectorTryStart()` → `'ok' | 'need_ad' | 'exhausted'`

### Sleep Score

`utils/sleepScore.ts` — duration-based ceiling applied before other penalties. Single-report weight is 1.0. Outputs `ozetCumle`, `buGeceIcin`, `sureOrani`, `skorTavani`, `enBuyukEtki.penalty`.

### Notifications / Partner Sync

Push notifications via Expo (`expo-notifications`). Partner pairing uses QR codes encoding `LUMIBABY:{token}:{isPremium}:{bebekAdi}:{dogumTarihi}`. Alerts sent directly to Expo push API at `exp.host/--/api/v2/push/send`. Baby device uses silent notifications; partner device uses sound.

### Ads

`services/adMob.ts`:
- `initAdMob()` — called once in `app/_layout.tsx`, loads rewarded + interstitial ads.
- `showRewarded()` → `'earned' | 'skipped' | 'unavailable'` — used by PremiumContext for daily bonus use.
- `showInterstitialIfReady(detectorActive)` — skips if detector is running; fires every 3–4 app opens.
- All ad calls are no-ops when `IS_AVAILABLE` is false (Expo Go).

### Key AsyncStorage Keys

| Key | Purpose |
|-----|---------|
| `lumibaby_onboarding_done` | Skip onboarding on relaunch |
| `lumibaby_trial_start` | Trial period start timestamp |
| `lumibaby_rc_premium_cache` | RevenueCat premium status cache (1h TTL) |
| `partner_premium` | Partner shared premium flag |
| `lumibaby_lang` | Language (`'tr'` / `'en'`) |
| `lumibaby_hassasiyet` | Cry detector sensitivity |
| `bebek_adi` / `bebek_dogum_tarihi` | Baby name and birth date |
| `lumibaby_my_token` / `lumibaby_anne_token` / `lumibaby_partner_token` | Push token pairing |

### Dev Menu

In `__DEV__` mode, tap the version row in Settings 5 times to open a hidden dev menu that can force-set trial / premium / free states and reload the app.

### Environment Variables

Set in `.env` (not committed). Prefixed with `EXPO_PUBLIC_`:
- `EXPO_PUBLIC_REVENUECAT_IOS_KEY` / `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY`
- `EXPO_PUBLIC_ADMOB_IOS_BANNER` / `EXPO_PUBLIC_ADMOB_IOS_INTERSTITIAL` / `EXPO_PUBLIC_ADMOB_IOS_REWARDED`
- `EXPO_PUBLIC_ADMOB_ANDROID_BANNER` / `EXPO_PUBLIC_ADMOB_ANDROID_INTERSTITIAL` / `EXPO_PUBLIC_ADMOB_ANDROID_REWARDED`
## Extra Rules
- Anne sesi her ses listesinde EN ÜSTTE olmalı (id: 998, 999)
- Cry analysis API'ye ses dosyası gönderilmez, sadece metin prompt gönderilir
- Compact yaparken: açık hatalar, değiştirilen dosyalar ve mimari kararlar korunsun