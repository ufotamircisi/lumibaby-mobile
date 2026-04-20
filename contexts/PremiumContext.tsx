import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { Alert } from 'react-native';
import { showRewarded } from '@/services/adMob';
import { ENTITLEMENT_ID } from '@/services/revenuecat';

function getRCPurchases() {
  try { return require('react-native-purchases').default; } catch { return null; }
}
function getRCUI() {
  try { return require('react-native-purchases-ui').default; } catch { return null; }
}
function getPAYWALL_RESULT() {
  try { return require('react-native-purchases-ui').PAYWALL_RESULT; } catch { return {}; }
}

const KEYS = {
  TRIAL_START:    'lumibaby_trial_start',
  DETEKTOR_DAILY: 'detectorDailyUsage',
  ANALIZ_DAILY:   'cryHelperDailyUsage',
};

const TRIAL_GUN         = 7;
const PREMIUM_CACHE_KEY = 'lumibaby_rc_premium_cache';
const SLEEP_DAILY_KEY   = 'lumibaby_sleep_daily';
const SLEEP_FREE_LIMIT  = 3;

export type PremiumDurum = 'trial' | 'premium' | 'free';

interface DailyUsage {
  date: string;
  normalHakKullanildi: boolean;
  reklamHakKullanildi: boolean;
  kullanilmis: number;
}

function bugunTarih(): string {
  return new Date().toISOString().split('T')[0];
}

async function getDailyUsage(key: string): Promise<DailyUsage> {
  const today = bugunTarih();
  try {
    const data = await AsyncStorage.getItem(key);
    if (data) {
      const parsed: DailyUsage = JSON.parse(data);
      if (parsed.date === today) return parsed;
    }
  } catch {}
  return { date: today, normalHakKullanildi: false, reklamHakKullanildi: false, kullanilmis: 0 };
}

async function saveDailyUsage(key: string, usage: DailyUsage): Promise<void> {
  await AsyncStorage.setItem(key, JSON.stringify(usage));
}

function computeHak(usage: DailyUsage): number {
  const earned = 1 + (usage.reklamHakKullanildi ? 1 : 0);
  return Math.max(0, earned - usage.kullanilmis);
}

async function rcIsPremium(): Promise<boolean> {
  try {
    const cached = await AsyncStorage.getItem(PREMIUM_CACHE_KEY);
    if (cached) {
      const { isPremium, ts } = JSON.parse(cached);
      if (Date.now() - ts < 3_600_000) return isPremium;
    }
    const Purchases = getRCPurchases();
    if (!Purchases) return false;
    const info = await Purchases.getCustomerInfo();
    const isPremium = info.entitlements.active[ENTITLEMENT_ID] !== undefined;
    await AsyncStorage.setItem(PREMIUM_CACHE_KEY, JSON.stringify({ isPremium, ts: Date.now() }));
    return isPremium;
  } catch {
    return false;
  }
}

async function getSleepCountToday(): Promise<number> {
  try {
    const today = bugunTarih();
    const data  = await AsyncStorage.getItem(SLEEP_DAILY_KEY);
    if (data) {
      const { date, count } = JSON.parse(data);
      if (date === today) return count;
    }
  } catch {}
  return 0;
}

export async function incrementSleepCount(): Promise<void> {
  const today = bugunTarih();
  const count = await getSleepCountToday();
  await AsyncStorage.setItem(SLEEP_DAILY_KEY, JSON.stringify({ date: today, count: count + 1 }));
}

export interface PremiumContextValue {
  durum: PremiumDurum;
  isPremium: boolean;
  isTrial: boolean;
  isFree: boolean;
  isLoading: boolean;
  canAccessPremium: boolean;
  showTeaserOnly: boolean;
  isLockedFeature: boolean;
  trialKalanGun: number;
  detektorHak: number;
  analizHak: number;
  detektorReklamGoster: boolean;
  analizReklamGoster: boolean;
  detektorKullan: () => Promise<boolean>;
  analizKullan: () => Promise<boolean>;
  reklamIzleDetektor: (lang?: string) => Promise<void>;
  reklamIzleAnaliz: (lang?: string) => Promise<void>;
  premiumAktifEt: () => Promise<boolean>;
  presentPaywall: () => Promise<boolean>;
  restorePurchases: () => Promise<boolean>;
  sleepLimitDoldu: () => Promise<boolean>;
  yukle: () => Promise<void>;
  yuklendi: boolean;
}

const PremiumContext = createContext<PremiumContextValue | null>(null);

export function PremiumProvider({ children }: { children: React.ReactNode }) {
  const [durum, setDurum]                               = useState<PremiumDurum>('trial');
  const [trialKalanGun, setTrialKalanGun]               = useState(TRIAL_GUN);
  const [detektorHak, setDetektorHak]                   = useState(1);
  const [analizHak, setAnalizHak]                       = useState(1);
  const [detektorReklamGoster, setDetektorReklamGoster] = useState(true);
  const [analizReklamGoster, setAnalizReklamGoster]     = useState(true);
  const [yuklendi, setYuklendi]                         = useState(false);

  const yukle = useCallback(async () => {
    const rcPremium      = await rcIsPremium();
    const partnerPremium = (await AsyncStorage.getItem('partner_premium')) === 'true';
    const isPremium      = rcPremium || partnerPremium;

    let trialStart = await AsyncStorage.getItem(KEYS.TRIAL_START);
    if (!trialStart) {
      trialStart = Date.now().toString();
      await AsyncStorage.setItem(KEYS.TRIAL_START, trialStart);
    }
    const trialGecenGun = Math.floor((Date.now() - parseInt(trialStart)) / (1000 * 60 * 60 * 24));
    const trialBitti    = trialGecenGun >= TRIAL_GUN;
    const kalanGun      = Math.max(0, TRIAL_GUN - trialGecenGun);

    let yeniDurum: PremiumDurum = 'free';
    if (isPremium)        yeniDurum = 'premium';
    else if (!trialBitti) yeniDurum = 'trial';

    setDurum(yeniDurum);
    setTrialKalanGun(kalanGun);

    if (yeniDurum !== 'free') {
      setDetektorHak(999);
      setAnalizHak(999);
      setDetektorReklamGoster(false);
      setAnalizReklamGoster(false);
    } else {
      const detUsage = await getDailyUsage(KEYS.DETEKTOR_DAILY);
      setDetektorHak(computeHak(detUsage));
      setDetektorReklamGoster(!detUsage.reklamHakKullanildi);

      const anizUsage = await getDailyUsage(KEYS.ANALIZ_DAILY);
      setAnalizHak(computeHak(anizUsage));
      setAnalizReklamGoster(!anizUsage.reklamHakKullanildi);
    }

    setYuklendi(true);
  }, []);

  useEffect(() => { yukle(); }, []);

  const presentPaywall = useCallback(async (): Promise<boolean> => {
    try {
      const RevenueCatUI   = getRCUI();
      const PAYWALL_RESULT = getPAYWALL_RESULT();
      if (!RevenueCatUI) return false;
      const result = await RevenueCatUI.presentPaywall();
      if (result === PAYWALL_RESULT.PURCHASED || result === PAYWALL_RESULT.RESTORED) {
        await AsyncStorage.removeItem(PREMIUM_CACHE_KEY);
        await yukle();
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }, [yukle]);

  const restorePurchases = useCallback(async (): Promise<boolean> => {
    try {
      const Purchases = getRCPurchases();
      if (!Purchases) return false;
      const info = await Purchases.restorePurchases();
      const ok = info.entitlements.active[ENTITLEMENT_ID] !== undefined;
      if (ok) {
        await AsyncStorage.removeItem(PREMIUM_CACHE_KEY);
        await yukle();
      }
      return ok;
    } catch {
      return false;
    }
  }, [yukle]);

  const detektorKullan = useCallback(async (): Promise<boolean> => {
    if (durum !== 'free') return true;
    if (detektorHak <= 0) return false;
    const usage = await getDailyUsage(KEYS.DETEKTOR_DAILY);
    usage.kullanilmis += 1;
    usage.normalHakKullanildi = true;
    await saveDailyUsage(KEYS.DETEKTOR_DAILY, usage);
    setDetektorHak(prev => prev - 1);
    return true;
  }, [durum, detektorHak]);

  const analizKullan = useCallback(async (): Promise<boolean> => {
    if (durum !== 'free') return true;
    if (analizHak <= 0) return false;
    const usage = await getDailyUsage(KEYS.ANALIZ_DAILY);
    usage.kullanilmis += 1;
    usage.normalHakKullanildi = true;
    await saveDailyUsage(KEYS.ANALIZ_DAILY, usage);
    setAnalizHak(prev => prev - 1);
    return true;
  }, [durum, analizHak]);

  const reklamIzleDetektor = useCallback(async (lang: string = 'tr') => {
    if (durum !== 'free') return;
    const result = await showRewarded();
    if (result === 'unavailable') {
      Alert.alert(lang === 'en' ? "Ad couldn't load, please try again" : 'Reklam şu an yüklenemedi, lütfen tekrar deneyin');
      return;
    }
    if (result !== 'earned') return;
    const usage = await getDailyUsage(KEYS.DETEKTOR_DAILY);
    usage.reklamHakKullanildi = true;
    await saveDailyUsage(KEYS.DETEKTOR_DAILY, usage);
    setDetektorHak(prev => prev + 1);
    setDetektorReklamGoster(false);
  }, [durum]);

  const reklamIzleAnaliz = useCallback(async (lang: string = 'tr') => {
    if (durum !== 'free') return;
    const result = await showRewarded();
    if (result === 'unavailable') {
      Alert.alert(lang === 'en' ? "Ad couldn't load, please try again" : 'Reklam şu an yüklenemedi, lütfen tekrar deneyin');
      return;
    }
    if (result !== 'earned') return;
    const usage = await getDailyUsage(KEYS.ANALIZ_DAILY);
    usage.reklamHakKullanildi = true;
    await saveDailyUsage(KEYS.ANALIZ_DAILY, usage);
    setAnalizHak(prev => prev + 1);
    setAnalizReklamGoster(false);
  }, [durum]);

  const sleepLimitDoldu = useCallback(async (): Promise<boolean> => {
    if (durum !== 'free') return false;
    const count = await getSleepCountToday();
    return count >= SLEEP_FREE_LIMIT;
  }, [durum]);

  const value: PremiumContextValue = {
    durum,
    isPremium:        durum === 'premium',
    isTrial:          durum === 'trial',
    isFree:           durum === 'free',
    isLoading:        !yuklendi,
    canAccessPremium: durum === 'premium' || durum === 'trial',
    showTeaserOnly:   durum === 'free',
    isLockedFeature:  durum === 'free',
    trialKalanGun,
    detektorHak,
    analizHak,
    detektorReklamGoster,
    analizReklamGoster,
    detektorKullan,
    analizKullan,
    reklamIzleDetektor,
    reklamIzleAnaliz,
    premiumAktifEt: presentPaywall,
    presentPaywall,
    restorePurchases,
    sleepLimitDoldu,
    yukle,
    yuklendi,
  };

  return <PremiumContext.Provider value={value}>{children}</PremiumContext.Provider>;
}

export function usePremiumContext(): PremiumContextValue {
  const ctx = useContext(PremiumContext);
  if (!ctx) throw new Error('usePremiumContext must be used inside PremiumProvider');
  return ctx;
}
