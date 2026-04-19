// services/adMob.ts
// AdMob native module — EAS Build only (not available in Expo Go)
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NativeModules, Platform } from 'react-native';

// ── Expo Go tespiti ───────────────────────────────────────────────────────────
// NativeModules kontrolü yeterli değil: Expo Go'da modül kısmen kayıtlı
// olabilir ama metodları çağrıldığında crash yapar.
// expo-constants.executionEnvironment === 'storeClient' → kesinlikle Expo Go.
const IS_AVAILABLE: boolean = (() => {
  try {
    // Önce Expo Go mu kontrol et (en güvenilir yöntem)
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Constants = require('expo-constants').default;
    if (Constants?.executionEnvironment === 'storeClient') return false;
    // Sonra native modülün gerçekten bağlı olup olmadığını kontrol et
    return !!NativeModules.RNGoogleMobileAdsModule;
  } catch {
    return false;
  }
})();

const KEY_OPEN_COUNT  = 'lumibaby_interstitial_open_count';
const KEY_THRESHOLD   = 'lumibaby_interstitial_threshold';

const TEST_IDS = {
  banner:       'ca-app-pub-3940256099942544/6300978111',
  interstitial: 'ca-app-pub-3940256099942544/1033173712',
  rewarded:     'ca-app-pub-3940256099942544/5224354917',
};

function getAdIds() {
  if (__DEV__) return TEST_IDS;
  if (Platform.OS === 'ios') {
    return {
      banner:       process.env.EXPO_PUBLIC_ADMOB_IOS_BANNER       ?? '',
      interstitial: process.env.EXPO_PUBLIC_ADMOB_IOS_INTERSTITIAL ?? '',
      rewarded:     process.env.EXPO_PUBLIC_ADMOB_IOS_REWARDED     ?? '',
    };
  }
  return {
    banner:       process.env.EXPO_PUBLIC_ADMOB_ANDROID_BANNER       ?? '',
    interstitial: process.env.EXPO_PUBLIC_ADMOB_ANDROID_INTERSTITIAL ?? '',
    rewarded:     process.env.EXPO_PUBLIC_ADMOB_ANDROID_REWARDED     ?? '',
  };
}

// IS_AVAILABLE false ise require hiç çağrılmaz — modülün kendi init kodu çalışmaz
function getAds(): any {
  if (!IS_AVAILABLE) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('react-native-google-mobile-ads');
    if (!mod?.MobileAds) return null;
    return mod;
  } catch {
    return null;
  }
}

// ── Banner ────────────────────────────────────────────────────────────────────
export function getBannerAdUnitId(): string {
  return getAdIds().banner;
}

// ── Rewarded Ad ───────────────────────────────────────────────────────────────
let rewardedAd: any   = null;
let rewardedLoaded    = false;

function loadRewarded() {
  const ads = getAds();
  if (!ads) return;
  try {
    const { RewardedAd, RewardedAdEventType, AdEventType } = ads;
    rewardedAd = RewardedAd.createForAdRequest(getAdIds().rewarded, {
      requestNonPersonalizedAdsOnly: true,
    });
    rewardedAd.addAdEventListener(RewardedAdEventType.LOADED, () => { rewardedLoaded = true; });
    rewardedAd.addAdEventListener(AdEventType.ERROR,          () => { rewardedLoaded = false; });
    rewardedAd.load();
  } catch {
    rewardedAd    = null;
    rewardedLoaded = false;
  }
}

export type RewardResult = 'earned' | 'skipped' | 'unavailable';

export function showRewarded(): Promise<RewardResult> {
  return new Promise((resolve) => {
    const ads = getAds();
    if (!ads || !rewardedAd || !rewardedLoaded) { resolve('unavailable'); return; }

    const { RewardedAdEventType, AdEventType } = ads;
    let done = false;

    const unsubEarned = rewardedAd.addAdEventListener(RewardedAdEventType.EARNED_REWARD, () => {
      if (done) return;
      done = true;
      unsubEarned(); unsubClosed();
      rewardedLoaded = false;
      loadRewarded();
      resolve('earned');
    });

    const unsubClosed = rewardedAd.addAdEventListener(AdEventType.CLOSED, () => {
      if (done) return;
      done = true;
      unsubEarned(); unsubClosed();
      rewardedLoaded = false;
      loadRewarded();
      resolve('skipped');
    });

    try { rewardedAd.show(); }
    catch { unsubEarned(); unsubClosed(); resolve('unavailable'); }
  });
}

// ── Interstitial Ad ───────────────────────────────────────────────────────────
let interstitialAd: any   = null;
let interstitialLoaded    = false;

function loadInterstitial() {
  const ads = getAds();
  if (!ads) return;
  try {
    const { InterstitialAd, AdEventType } = ads;
    interstitialAd = InterstitialAd.createForAdRequest(getAdIds().interstitial, {
      requestNonPersonalizedAdsOnly: true,
    });
    interstitialAd.addAdEventListener(AdEventType.LOADED,  () => { interstitialLoaded = true; });
    interstitialAd.addAdEventListener(AdEventType.CLOSED,  () => { interstitialLoaded = false; loadInterstitial(); });
    interstitialAd.addAdEventListener(AdEventType.ERROR,   () => { interstitialLoaded = false; });
    interstitialAd.load();
  } catch {
    interstitialAd    = null;
    interstitialLoaded = false;
  }
}

async function nextThreshold(): Promise<number> {
  const t = Math.floor(Math.random() * 2) + 3;
  await AsyncStorage.setItem(KEY_THRESHOLD, String(t));
  return t;
}

export async function showInterstitialIfReady(detectorActive: boolean): Promise<void> {
  if (detectorActive) return;
  if (!interstitialAd || !interstitialLoaded) return;

  const countVal     = await AsyncStorage.getItem(KEY_OPEN_COUNT);
  const thresholdVal = await AsyncStorage.getItem(KEY_THRESHOLD);
  const count        = parseInt(countVal ?? '0');
  const threshold    = thresholdVal ? parseInt(thresholdVal) : await nextThreshold();

  if (count < threshold) return;

  await AsyncStorage.setItem(KEY_OPEN_COUNT, '0');
  await nextThreshold();

  try { interstitialAd.show(); } catch {}
}

// ── Başlatma (app/_layout.tsx'te bir kez çağrılır) ───────────────────────────
export async function initAdMob(): Promise<void> {
  const ads = getAds();
  if (!ads) return; // IS_AVAILABLE false → sessizce çık

  try {
    const { MaxAdContentRating } = ads;
    await ads.MobileAds().setRequestConfiguration({
      maxAdContentRating:           MaxAdContentRating.G,   // G = en kısıtlı: kumar/18+/cinsel içerik engeli
      tagForChildDirectedTreatment: false,
      tagForUnderAgeOfConsent:      false,
    });
    await ads.MobileAds().initialize();
    loadRewarded();
    loadInterstitial();
  } catch {
    return;
  }

  try {
    const val   = await AsyncStorage.getItem(KEY_OPEN_COUNT);
    const count = parseInt(val ?? '0') + 1;
    await AsyncStorage.setItem(KEY_OPEN_COUNT, String(count));
    const existing = await AsyncStorage.getItem(KEY_THRESHOLD);
    if (!existing) await nextThreshold();
  } catch {}
}
