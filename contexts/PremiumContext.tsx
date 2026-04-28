import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
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

const TRIAL_START_KEY   = 'lumibaby_trial_start';
const PREMIUM_CACHE_KEY = 'lumibaby_rc_premium_cache';
const TRIAL_GUN         = 7;

export type PremiumDurum = 'trial' | 'premium' | 'free';

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
  premiumAktifEt: () => Promise<boolean>;
  presentPaywall: () => Promise<boolean>;
  restorePurchases: () => Promise<boolean>;
  yukle: () => Promise<void>;
  yuklendi: boolean;
}

const PremiumContext = createContext<PremiumContextValue | null>(null);

export function PremiumProvider({ children }: { children: React.ReactNode }) {
  const [durum, setDurum]             = useState<PremiumDurum>('trial');
  const [trialKalanGun, setTrialKalanGun] = useState(TRIAL_GUN);
  const [yuklendi, setYuklendi]       = useState(false);

  const yukle = useCallback(async () => {
    const rcPremium      = await rcIsPremium();
    const partnerPremium = (await AsyncStorage.getItem('partner_premium')) === 'true';
    const isPremium      = rcPremium || partnerPremium;

    let trialStart = await AsyncStorage.getItem(TRIAL_START_KEY);
    if (!trialStart) {
      trialStart = Date.now().toString();
      await AsyncStorage.setItem(TRIAL_START_KEY, trialStart);
    }
    const trialGecenGun = Math.floor((Date.now() - parseInt(trialStart)) / (1000 * 60 * 60 * 24));
    const trialBitti    = trialGecenGun >= TRIAL_GUN;
    const kalanGun      = Math.max(0, TRIAL_GUN - trialGecenGun);

    let yeniDurum: PremiumDurum = 'free';
    if (isPremium)        yeniDurum = 'premium';
    else if (!trialBitti) yeniDurum = 'trial';

    setDurum(yeniDurum);
    setTrialKalanGun(kalanGun);
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
    premiumAktifEt: presentPaywall,
    presentPaywall,
    restorePurchases,
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
