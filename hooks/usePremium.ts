// hooks/usePremium.ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';
import Purchases from 'react-native-purchases';
import RevenueCatUI, { PAYWALL_RESULT } from 'react-native-purchases-ui';

const KEYS = {
  TRIAL_START:       'lumibaby_trial_start',
  DETEKTOR_KULLANIM: 'lumibaby_detektor_kullanim',
  ANALIZ_KULLANIM:   'lumibaby_analiz_kullanim',
  DETEKTOR_EKSTRA:   'lumibaby_detektor_ekstra',
  ANALIZ_EKSTRA:     'lumibaby_analiz_ekstra',
};

const TRIAL_GUN   = 7;
const ENTITLEMENT = 'LumiBaby Pro';

export type PremiumDurum = 'trial' | 'premium' | 'free';

function bugunKey() {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

async function rcIsPremium(): Promise<boolean> {
  try {
    const info = await Purchases.getCustomerInfo();
    return info.entitlements.active[ENTITLEMENT] !== undefined;
  } catch {
    return false;
  }
}

export function usePremium() {
  const [durum, setDurum]                 = useState<PremiumDurum>('trial');
  const [trialKalanGun, setTrialKalanGun] = useState(TRIAL_GUN);
  const [detektorHak, setDetektorHak]     = useState(1);
  const [analizHak, setAnalizHak]         = useState(1);
  const [yuklendi, setYuklendi]           = useState(false);

  const yukle = useCallback(async () => {
    const bugun = bugunKey();

    // RC entitlement check
    const isPremium = await rcIsPremium();

    // Trial kontrolü
    let trialStart = await AsyncStorage.getItem(KEYS.TRIAL_START);
    if (!trialStart) {
      trialStart = Date.now().toString();
      await AsyncStorage.setItem(KEYS.TRIAL_START, trialStart);
    }
    const trialGecenGun = Math.floor((Date.now() - parseInt(trialStart)) / (1000 * 60 * 60 * 24));
    const trialBitti    = trialGecenGun >= TRIAL_GUN;
    const kalanGun      = Math.max(0, TRIAL_GUN - trialGecenGun);

    // Durum belirle
    let yeniDurum: PremiumDurum = 'free';
    if (isPremium)       yeniDurum = 'premium';
    else if (!trialBitti) yeniDurum = 'trial';

    setDurum(yeniDurum);
    setTrialKalanGun(kalanGun);

    // Trial veya Premium → dedektör sınırsız
    if (yeniDurum === 'premium' || yeniDurum === 'trial') {
      setDetektorHak(999);
    } else {
      // Free: günde 1 + ekstra
      const detektorData     = await AsyncStorage.getItem(KEYS.DETEKTOR_KULLANIM);
      const detektorObj      = detektorData ? JSON.parse(detektorData) : {};
      const detektorEkstraData = await AsyncStorage.getItem(KEYS.DETEKTOR_EKSTRA);
      const detektorEkstraObj  = detektorEkstraData ? JSON.parse(detektorEkstraData) : {};
      const detektorKullanildi = detektorObj[bugun] || 0;
      const detektorEkstra     = detektorEkstraObj[bugun] || 0;
      setDetektorHak(Math.max(0, 1 + detektorEkstra - detektorKullanildi));
    }

    // Analiz hak
    if (yeniDurum === 'premium') {
      setAnalizHak(999);
    } else {
      const analizData     = await AsyncStorage.getItem(KEYS.ANALIZ_KULLANIM);
      const analizObj      = analizData ? JSON.parse(analizData) : {};
      const analizEkstraData = await AsyncStorage.getItem(KEYS.ANALIZ_EKSTRA);
      const analizEkstraObj  = analizEkstraData ? JSON.parse(analizEkstraData) : {};
      const analizKullanildi = analizObj[bugun] || 0;
      const analizEkstra     = analizEkstraObj[bugun] || 0;
      // Trial: günde 3 (reklamsız), Free: günde 1 + reklam
      const analizMaxHak = yeniDurum === 'trial' ? 3 : 1;
      setAnalizHak(Math.max(0, analizMaxHak + analizEkstra - analizKullanildi));
    }

    setYuklendi(true);
  }, []);

  useEffect(() => { yukle(); }, []);

  // ── Paywall göster ────────────────────────────────────────────────────────
  const presentPaywall = useCallback(async (): Promise<boolean> => {
    try {
      const result = await RevenueCatUI.presentPaywall();
      if (result === PAYWALL_RESULT.PURCHASED || result === PAYWALL_RESULT.RESTORED) {
        await yukle();
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }, [yukle]);

  // ── Satın almaları geri yükle ─────────────────────────────────────────────
  const restorePurchases = useCallback(async (): Promise<boolean> => {
    try {
      const info = await Purchases.restorePurchases();
      if (info.entitlements.active[ENTITLEMENT] !== undefined) {
        await yukle();
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }, [yukle]);

  // ── Dedektör kullanıldı ────────────────────────────────────────────────────
  const detektorKullan = useCallback(async (): Promise<boolean> => {
    if (durum === 'premium' || durum === 'trial') return true; // sınırsız
    if (detektorHak <= 0) return false;
    const bugun = bugunKey();
    const data = await AsyncStorage.getItem(KEYS.DETEKTOR_KULLANIM);
    const obj = data ? JSON.parse(data) : {};
    obj[bugun] = (obj[bugun] || 0) + 1;
    await AsyncStorage.setItem(KEYS.DETEKTOR_KULLANIM, JSON.stringify(obj));
    setDetektorHak(prev => prev - 1);
    return true;
  }, [durum, detektorHak]);

  // ── Analiz kullanıldı ──────────────────────────────────────────────────────
  const analizKullan = useCallback(async (): Promise<boolean> => {
    if (durum === 'premium') return true; // sınırsız
    if (analizHak <= 0) return false;
    const bugun = bugunKey();
    const data = await AsyncStorage.getItem(KEYS.ANALIZ_KULLANIM);
    const obj = data ? JSON.parse(data) : {};
    obj[bugun] = (obj[bugun] || 0) + 1;
    await AsyncStorage.setItem(KEYS.ANALIZ_KULLANIM, JSON.stringify(obj));
    setAnalizHak(prev => prev - 1);
    return true;
  }, [durum, analizHak]);

  // ── Reklam izleyince +1 hak (sadece free kullanıcılar için) ───────────────
  const reklamIzleDetektor = useCallback(async () => {
    if (durum !== 'free') return;
    const bugun = bugunKey();
    const data = await AsyncStorage.getItem(KEYS.DETEKTOR_EKSTRA);
    const obj = data ? JSON.parse(data) : {};
    obj[bugun] = (obj[bugun] || 0) + 1;
    await AsyncStorage.setItem(KEYS.DETEKTOR_EKSTRA, JSON.stringify(obj));
    setDetektorHak(prev => prev + 1);
  }, [durum]);

  const reklamIzleAnaliz = useCallback(async () => {
    if (durum !== 'free') return;
    const bugun = bugunKey();
    const data = await AsyncStorage.getItem(KEYS.ANALIZ_EKSTRA);
    const obj = data ? JSON.parse(data) : {};
    obj[bugun] = (obj[bugun] || 0) + 1;
    await AsyncStorage.setItem(KEYS.ANALIZ_EKSTRA, JSON.stringify(obj));
    setAnalizHak(prev => prev + 1);
  }, [durum]);

  // premiumAktifEt → presentPaywall (backward compat alias)
  const premiumAktifEt = presentPaywall;

  return {
    durum,
    isPremium:         durum === 'premium',
    isTrial:           durum === 'trial',
    isFree:            durum === 'free',
    trialKalanGun,
    detektorHak,
    analizHak,
    detektorKullan,
    analizKullan,
    reklamIzleDetektor,
    reklamIzleAnaliz,
    premiumAktifEt,
    presentPaywall,
    restorePurchases,
    yukle,
    yuklendi,
  };
}
