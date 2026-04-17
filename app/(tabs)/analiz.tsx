import AdBanner from '@/components/AdBanner';
import Paywall from '@/components/Paywall';
import { useLang } from '@/hooks/useLang';
import { usePremium } from '@/hooks/usePremium';
import { showInterstitialIfReady } from '@/services/adMob';
import * as audioManager from '@/services/audioManager';
import { CONFIDENCE_THRESHOLD, CryDetectionEngine, type SensitivityLevel } from '@/services/cryDetectionEngine';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Audio } from 'expo-av';
import * as Notifications from 'expo-notifications';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { sendAlertToAll } from './_layout';

// ── STORAGE KEYS ─────────────────────────────────────────────────────────────
const SES_OGRENME_KEY     = 'lumibaby_ses_ogrenme';
const GECE_RAPORLARI_KEY  = 'lumibaby_gece_raporlari';
const WAKE_WINDOW_BILDIRIM_KEY = 'lumibaby_wake_window_bildirim';
const SLEEP_START_KEY     = 'lumibaby_sleep_start';
type SesOgrenmeKayit = { sesId: number; sesAdi: string; kalisSaniye: number; ts: number };
// Wonder Weeks: hafta numaraları
const WONDER_WEEKS = [5, 8, 12, 19, 26, 37, 46, 55];

// ── AĞLAMA YARDIMCISI ────────────────────────────────────────────────────────
const CRY_HELPER_KEY = 'lumibaby_cry_helper_gecmis';
type CryKategori = 'aclik' | 'uykusuzluk' | 'gaz' | 'bez' | 'genel';
type CryHelperGecmis = { tarih: number; sonuc1: CryKategori; sonuc2: CryKategori | null; };
const CRY_SCORES: Record<number, Record<number, Record<CryKategori, number>>> = {
  0: {
    0: { aclik: -1, uykusuzluk: 0, gaz: 1, bez: 0, genel: 0 },
    1: { aclik: 1,  uykusuzluk: 0, gaz: 0, bez: 0, genel: 0 },
    2: { aclik: 3,  uykusuzluk: 0, gaz: 0, bez: 0, genel: 0 },
  },
  1: {
    0: { aclik: 0, uykusuzluk: 3,  gaz: 0, bez: 0, genel: 0 },
    1: { aclik: 1, uykusuzluk: -1, gaz: 0, bez: 0, genel: 0 },
    2: { aclik: 0, uykusuzluk: 0,  gaz: 0, bez: 0, genel: 0 },
  },
  2: {
    0: { aclik: 0, uykusuzluk: 0, gaz: 0, bez: -2, genel: 0 },
    1: { aclik: 0, uykusuzluk: 0, gaz: 0, bez: 1,  genel: 0 },
    2: { aclik: 0, uykusuzluk: 0, gaz: 0, bez: 3,  genel: 0 },
  },
  3: {
    0: { aclik: 0, uykusuzluk: 0, gaz: 3, bez: 0, genel: 0 },
    1: { aclik: 0, uykusuzluk: 0, gaz: 1, bez: 0, genel: 2 },
    2: { aclik: 1, uykusuzluk: 1, gaz: 0, bez: 0, genel: 0 },
  },
  4: {
    0: { aclik: 0, uykusuzluk: 1, gaz: 0, bez: 0, genel: 2 },
    1: { aclik: 0, uykusuzluk: 0, gaz: 0, bez: 0, genel: 0 },
    2: { aclik: 0, uykusuzluk: 0, gaz: 0, bez: 0, genel: 3 },
  },
};

type SesTip   = { id: number; name: string; icon: string; file: any; };
type UykuKaydi = { id: number; baslangic: number; bitis: number | null; };
type GeceRaporu = {
  id: number; tarih: string; toplamUyku: number; aglamaSayisi: number;
  baslangic: number; bitis: number; uykulaDalma: number; enUzunUyku: number;
  uykuKalitesi: number; puanDetay: { baslik: string; puan: number; pozitif: boolean }[];
};

const BAR_MAX_HEIGHT = 80;
const HASSASIYET_KEY = 'lumibaby_hassasiyet';
type DedektorTip = 'aglama' | 'kolik';

function kaliteRenk(puan: number): string {
  if (puan >= 85) return '#4ade80';
  if (puan >= 70) return '#facc15';
  if (puan >= 50) return '#fb923c';
  return '#f87171';
}

function uykuSkoruHesapla(
  toplamUyku: number,
  aglamaSayisi: number,
  baslangicSaat: number,
  t: any
): { toplam: number; detaylar: { baslik: string; puan: number; pozitif: boolean }[] } {
  const detaylar: { baslik: string; puan: number; pozitif: boolean }[] = [];
  let toplam = 0;
  const lang = t.grafikGunler[0] === 'Sun' ? 'en' : 'tr';

  if (toplamUyku >= 32400)      { detaylar.push({ baslik: lang === 'en' ? 'Long sleep (9h+)' : 'Uzun uyku süresi (9s+)',  puan: 50, pozitif: true });  toplam += 50; }
  else if (toplamUyku >= 25200) { detaylar.push({ baslik: lang === 'en' ? 'Good sleep (7h+)' : 'İyi uyku süresi (7s+)',   puan: 35, pozitif: true });  toplam += 35; }
  else if (toplamUyku >= 18000) { detaylar.push({ baslik: lang === 'en' ? 'Fair sleep (5h+)' : 'Orta uyku süresi (5s+)',  puan: 20, pozitif: true });  toplam += 20; }
  else                          { detaylar.push({ baslik: lang === 'en' ? 'Short sleep' : 'Kısa uyku süresi',             puan: -10, pozitif: false }); toplam -= 10; }

  if (aglamaSayisi === 0)      { detaylar.push({ baslik: lang === 'en' ? 'Did not cry at all' : 'Hiç ağlamadı',            puan: 30, pozitif: true }); toplam += 30; }
  else if (aglamaSayisi === 1) { detaylar.push({ baslik: lang === 'en' ? 'Cried once' : '1 kez ağladı',                   puan: 20, pozitif: true }); toplam += 20; }
  else if (aglamaSayisi === 2) { detaylar.push({ baslik: lang === 'en' ? 'Cried twice' : '2 kez ağladı',                  puan: 10, pozitif: true }); toplam += 10; }
  else if (aglamaSayisi <= 4)  { detaylar.push({ baslik: lang === 'en' ? `Cried ${aglamaSayisi} times` : aglamaSayisi + ' kez ağladı', puan: 0, pozitif: false }); }
  else                         { detaylar.push({ baslik: lang === 'en' ? `Cried ${aglamaSayisi} times (frequent)` : aglamaSayisi + ' kez ağladı (sık)', puan: -10, pozitif: false }); toplam -= 10; }

  const saat = new Date(baslangicSaat).getHours();
  if (saat >= 19 && saat <= 21) { detaylar.push({ baslik: lang === 'en' ? 'Regular bedtime' : 'Düzenli uyku saati',     puan: 20, pozitif: true }); toplam += 20; }
  else                           { detaylar.push({ baslik: lang === 'en' ? 'Late bedtime' : 'Geç uyku saati',             puan: 0,  pozitif: false }); }

  return { toplam: Math.max(0, Math.min(100, toplam)), detaylar };
}

function son7GunHazirla(raporlar: GeceRaporu[], gunIsimleri: string[]) {
  const bugun = new Date();
  const gunler = [];
  for (let i = 6; i >= 0; i--) {
    const gun = new Date(bugun);
    gun.setDate(bugun.getDate() - i);
    const gunBaslangic = new Date(gun.getFullYear(), gun.getMonth(), gun.getDate()).getTime();
    const gunBitis = gunBaslangic + 86400000;
    const rapor = raporlar.find(r => r.baslangic >= gunBaslangic && r.baslangic < gunBitis);
    gunler.push({ gun: gunIsimleri[gun.getDay()], tarih: gun.getDate(), puan: rapor ? rapor.uykuKalitesi : null, bugun: i === 0 });
  }
  return gunler;
}

const sabitNinniListesiTR: SesTip[] = [
  { id:  1, name: 'Dandini Dastana',        icon: '⭐', file: require('../../assets/sounds/dandini_dastana_tr.mp3')          },
  { id:  2, name: 'Uyusun da Büyüsün',      icon: '🌟', file: require('../../assets/sounds/uyusun_da_buyusun_ninni_tr.mp3')  },
  { id:  3, name: 'Güzel Annem',            icon: '💜', file: require('../../assets/sounds/guzel_annem_tr.mp3')              },
  { id:  4, name: 'Yağmur Ninnisi',         icon: '🌧️', file: require('../../assets/sounds/yagmur_ninnisi_tr.mp3')           },
  { id:  5, name: 'Uyu Yavrum',             icon: '🌙', file: require('../../assets/sounds/uyu_yavrum_tr.mp3')               },
  { id:  6, name: 'Müzik Kutusu 1',         icon: '🎵', file: require('../../assets/sounds/muzik_kutusu_tr.mp3')             },
  { id:  7, name: 'Müzik Kutusu 2',         icon: '🎶', file: require('../../assets/sounds/muzik_kutusu_2_tr.mp3')           },
  { id:  8, name: 'Müzik Kutusu 3',         icon: '🎼', file: require('../../assets/sounds/muzik_kutusu_3_tr.mp3')           },
  { id:  9, name: 'Yumuşak Piyano Ninnisi', icon: '🎹', file: require('../../assets/sounds/yumusak_piyano_ninnisi_tr.mp3')   },
  { id: 10, name: 'Enstrümantal Ninni',      icon: '🎻', file: require('../../assets/sounds/enstrumantal_ninni_tr.mp3')       },
];
const sabitNinniListesiEN: SesTip[] = [
  { id:  1, name: 'Little Star',           icon: '⭐', file: require('../../assets/sounds/star_in_the_sky_en.mp3')        },
  { id:  2, name: 'Hush Now Baby',         icon: '🤫', file: require('../../assets/sounds/hush_now_baby_en.mp3')          },
  { id:  3, name: 'Rock-a-Bye',            icon: '🍃', file: require('../../assets/sounds/rock_a_bye_en.mp3')             },
  { id:  4, name: 'Sleep Baby',            icon: '😴', file: require('../../assets/sounds/sleep_baby_en.mp3')             },
  { id:  5, name: 'A Candle',              icon: '🕯️', file: require('../../assets/sounds/a_candle_en.mp3')              },
  { id:  6, name: 'Music Box 1',           icon: '🎵', file: require('../../assets/sounds/music_box_en.mp3')              },
  { id:  7, name: 'Music Box 2',           icon: '🎶', file: require('../../assets/sounds/music_box_2_en.mp3')            },
  { id:  8, name: 'Music Box 3',           icon: '🎼', file: require('../../assets/sounds/music_box_3_en.mp3')            },
  { id:  9, name: 'Soft Piano Lullaby',    icon: '🎹', file: require('../../assets/sounds/soft_piano_lullaby_en.mp3')     },
  { id: 10, name: 'Instrumental Lullaby',  icon: '🎻', file: require('../../assets/sounds/instrumental_lullaby_en.mp3')   },
];

const sabitKolikListesiTR: SesTip[] = [
  { id:  1, name: 'Saç Kurutma Makinesi', icon: '💨', file: require('../../assets/sounds/hairdryer.mp3')       },
  { id:  2, name: 'Elektrikli Süpürge',   icon: '🌀', file: require('../../assets/sounds/vacuum.mp3')          },
  { id:  3, name: 'Piş Piş',              icon: '🫧', file: require('../../assets/sounds/pispis.mp3')          },
  { id:  4, name: 'Fan Sesi',             icon: '🌬️', file: require('../../assets/sounds/ac.mp3')             },
  { id:  5, name: 'Beyaz Gürültü',        icon: '🔊', file: require('../../assets/sounds/whitenoise.mp3')      },
  { id:  6, name: 'Kedi Mırıltısı',       icon: '🐱', file: require('../../assets/sounds/kedi_miriltisi.mp3')  },
  { id:  7, name: 'Kalp Atışı',           icon: '💗', file: require('../../assets/sounds/heart.mp3')           },
  { id:  8, name: 'Nefes Egzersizi',      icon: '🧘', file: require('../../assets/sounds/nefes_egzersizi.mp3') },
  { id:  9, name: 'Yağmur Sesi',          icon: '🌧️', file: require('../../assets/sounds/rain.mp3')           },
  { id: 10, name: 'Deniz Dalgaları',      icon: '🌊', file: require('../../assets/sounds/waves.mp3')           },
  { id: 11, name: 'Orman Sesi',           icon: '🌲', file: require('../../assets/sounds/forest.mp3')          },
  { id: 12, name: 'Şelale',               icon: '💧', file: require('../../assets/sounds/stream.mp3')          },
];
const sabitKolikListesiEN: SesTip[] = [
  { id:  1, name: 'Hair Dryer',          icon: '💨', file: require('../../assets/sounds/hairdryer.mp3')       },
  { id:  2, name: 'Vacuum Cleaner',      icon: '🌀', file: require('../../assets/sounds/vacuum.mp3')          },
  { id:  3, name: 'Shushing',            icon: '🫧', file: require('../../assets/sounds/pispis.mp3')          },
  { id:  4, name: 'Fan Sound',           icon: '🌬️', file: require('../../assets/sounds/ac.mp3')             },
  { id:  5, name: 'White Noise',         icon: '🔊', file: require('../../assets/sounds/whitenoise.mp3')      },
  { id:  6, name: 'Cat Purring',         icon: '🐱', file: require('../../assets/sounds/kedi_miriltisi.mp3')  },
  { id:  7, name: 'Heartbeat',           icon: '💗', file: require('../../assets/sounds/heart.mp3')           },
  { id:  8, name: 'Breathing Exercise',  icon: '🧘', file: require('../../assets/sounds/nefes_egzersizi.mp3') },
  { id:  9, name: 'Rain Sound',          icon: '🌧️', file: require('../../assets/sounds/rain.mp3')           },
  { id: 10, name: 'Ocean Waves',         icon: '🌊', file: require('../../assets/sounds/waves.mp3')           },
  { id: 11, name: 'Forest Sounds',       icon: '🌲', file: require('../../assets/sounds/forest.mp3')          },
  { id: 12, name: 'Waterfall',           icon: '💧', file: require('../../assets/sounds/stream.mp3')          },
];

export default function Analiz() {
  const { isTrial, canAccessPremium, detektorHak, analizHak, detektorKullan, analizKullan, reklamIzleDetektor, reklamIzleAnaliz, premiumAktifEt } = usePremium();
  const router = useRouter();
  const { lang, t } = useLang();
  const free = !canAccessPremium;

  const [paywallVisible, setPaywallVisible] = useState(false);
  const [paywallTip, setPaywallTip]         = useState<'detektor' | 'analiz' | 'premium'>('premium');
  const [bebekAdi, setBebekAdi]             = useState('');

  const [uyuyorMu, setUyuyorMu]             = useState(false);
  const [sure, setSure]                     = useState(0);
  const [aktifKayit, setAktifKayit]         = useState<UykuKaydi | null>(null);
  const [seciliDetektor, setSeciliDetektor] = useState<DedektorTip | null>(null);
  const [seciliNinni, setSeciliNinni]       = useState<SesTip | null>(null);
  const [seciliKolik, setSeciliKolik]       = useState<SesTip | null>(null);
  const [sesListeModal, setSesListeModal]   = useState(false);
  const [modalTip, setModalTip]             = useState<DedektorTip | null>(null);
  const [dinleniyor, setDinleniyor]         = useState(false);
  const [kalibrasyon, setKalibrasyon]       = useState(false);
  const [caliniyor, setCaliniyor]           = useState(false);
  const [confidenceScore, setConfidenceScore] = useState(0);
  const [cooldownKalan, setCooldownKalan]   = useState(0);
  const [hassasiyet, setHassasiyet]         = useState<SensitivityLevel>('balanced');
  const [aglamaSayisi, setAglamaSayisi]     = useState(0);
  const [raporModal, setRaporModal]         = useState(false);
  const [sonRapor, setSonRapor]             = useState<GeceRaporu | null>(null);
  const [geceRaporlari, setGeceRaporlari]   = useState<GeceRaporu[]>([]);
  const [seciliRapor, setSeciliRapor]       = useState<GeceRaporu | null>(null);
  const [detayModal, setDetayModal]         = useState(false);
  const [seciliYas, setSeciliYas]           = useState(0);
  const [acikHafta, setAcikHafta]           = useState<string | null>(null);
  const [anneNinniUri, setAnneNinniUri]     = useState<string | null>(null);
  const [annePisPisUri, setAnnePisPisUri]   = useState<string | null>(null);
  const [detektorSure, setDetektorSure]     = useState(0);
  // Ağlama yardımcısı
  const [cryHelperAdim, setCryHelperAdim]   = useState<'giris' | 'soru' | 'sonuc'>('giris');
  const [cryCevaplar, setCryCevaplar]       = useState<number[]>([]);
  const [crySonuc, setCrySonuc]             = useState<CryKategori[]>([]);
  const [cryGecmis, setCryGecmis]           = useState<CryHelperGecmis[]>([]);
  const [cryGecmisGoster, setCryGecmisGoster] = useState(false);
  const [dogumTarihi, setDogumTarihi]       = useState<string>('');
  const [nasılIslerModal, setNasılIslerModal]     = useState(false);
  const [rehberDetayModal, setRehberDetayModal]   = useState(false);
  const [nasılCalisirModal, setNasılCalisirModal] = useState(false);
  // Yeni özellikler
  const [sesOgrenmeKayitlar, setSesOgrenmeKayitlar] = useState<SesOgrenmeKayit[]>([]);
  const sesCalmaBaslangicRef = useRef<number>(0);
  const scrollRef           = useRef<ScrollView>(null);
  const gecmisOffsetRef     = useRef<number>(0);
  const grafikOffsetRef     = useRef<number>(0);
  const bildirimIdRef       = useRef<string | null>(null);
  const { height: screenHeight, width: screenWidth } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const tlBarW = screenWidth - 116; // ScrollView pad 40 + modal pad 48 + kutu pad 28

  const timerRef           = useRef<ReturnType<typeof setInterval> | null>(null);
  const detektorTimerRef   = useRef<ReturnType<typeof setInterval> | null>(null);
  const dinlemeRef         = useRef(false);
  const caliyorRef         = useRef(false);
  const geceBaslangicRef   = useRef<number>(0);
  const aglamaSayisiRef    = useRef(0);
  const aktifSesRef        = useRef<SesTip | null>(null);
  const modalTipRef        = useRef<DedektorTip | null>(null);
  const aktifDedektorRef   = useRef<DedektorTip | null>(null);
  const ilkAglamaZamaniRef = useRef<number | null>(null);
  const aktifKayitRef      = useRef<UykuKaydi | null>(null);
  const recordingRef       = useRef<Audio.Recording | null>(null);
  const probeTimerRef      = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollIntervalRef    = useRef<ReturnType<typeof setInterval> | null>(null);
  const cooldownTimerRef   = useRef<ReturnType<typeof setInterval> | null>(null);
  const hassasiyetRef      = useRef<SensitivityLevel>('balanced');
  const cryEngineRef       = useRef(new CryDetectionEngine());

  // hassasiyet state değişince ref'i güncelle (polling closure içinde güncel değer okunur)
  useEffect(() => { hassasiyetRef.current = hassasiyet; }, [hassasiyet]);

  useEffect(() => { return () => { herSeyiDurdur(); }; }, []);

  // Bildirim aksiyon kategorilerini kur
  useEffect(() => {
    Notifications.setNotificationCategoryAsync('crying', [
      { identifier: 'play_lullaby', buttonTitle: t.notifAglamaBtnCaldir, options: { opensAppToForeground: true } },
      { identifier: 'dismiss',      buttonTitle: t.notifAglamaBtnKapat,  options: { opensAppToForeground: false, isDestructive: false, isAuthenticationRequired: false } },
    ]).catch(() => {});
    Notifications.setNotificationCategoryAsync('wake_window', [
      { identifier: 'ok', buttonTitle: t.notifWakeWinBtnKapat, options: { opensAppToForeground: false } },
    ]).catch(() => {});
  }, []);

  // Başka bir tab sesi devraldığında dedektör çalma durumunu sıfırla
  useEffect(() => {
    return audioManager.subscribe((id, tab) => {
      if (tab !== 'analiz' && caliyorRef.current) {
        caliyorRef.current = false;
        setCaliniyor(false);
        probeTimerTemizle();
      }
    });
  }, []);

  useFocusEffect(useCallback(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, []));

  useEffect(() => {
    AsyncStorage.getItem('anne_ninni_kayit').then(v => { if (v) setAnneNinniUri(JSON.parse(v).uri); });
    AsyncStorage.getItem('anne_pispis_kayit').then(v => { if (v) setAnnePisPisUri(JSON.parse(v).uri); });
    AsyncStorage.getItem('bebek_adi').then(v => { if (v) setBebekAdi(v); });
    AsyncStorage.getItem('bebek_dogum_tarihi').then(v => { if (v) setDogumTarihi(v); });
    AsyncStorage.getItem(SES_OGRENME_KEY).then(v => {
      if (v) { try { setSesOgrenmeKayitlar(JSON.parse(v)); } catch {} }
    });
    AsyncStorage.getItem(CRY_HELPER_KEY).then(v => {
      if (v) { try { setCryGecmis(JSON.parse(v)); } catch {} }
    });
    AsyncStorage.getItem(HASSASIYET_KEY).then(v => {
      if (v === 'high' || v === 'balanced' || v === 'strict') {
        setHassasiyet(v); hassasiyetRef.current = v;
      }
    });
    cryEngineRef.current.loadPatterns().catch(() => {});
    AsyncStorage.getItem(GECE_RAPORLARI_KEY).then(v => {
      if (v) { try { setGeceRaporlari(JSON.parse(v)); } catch {} }
    });
    // Uygulama öldürülüp yeniden açılırsa devam eden uykuyu geri yükle
    AsyncStorage.getItem(SLEEP_START_KEY).then(v => {
      if (!v) return;
      const savedStart = parseInt(v, 10);
      if (isNaN(savedStart) || savedStart <= 0) return;
      geceBaslangicRef.current = savedStart;
      setUyuyorMu(true);
      setSure(Math.floor((Date.now() - savedStart) / 1000));
      timerRef.current = setInterval(() => setSure(Math.floor((Date.now() - geceBaslangicRef.current) / 1000)), 1000);
    });
  }, []);

  // AppState: arka plandan geri dönünce sayacı hemen güncelle
  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active' && geceBaslangicRef.current > 0) {
        setSure(Math.floor((Date.now() - geceBaslangicRef.current) / 1000));
      }
    });
    return () => sub.remove();
  }, []);

  const bebekIsmi = bebekAdi.trim() || null;

  const formatSayac = (s: number) => {
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sn = s % 60;
    if (h > 0) return h.toString().padStart(2, '0') + ':' + m.toString().padStart(2, '0') + ':' + sn.toString().padStart(2, '0');
    return m.toString().padStart(2, '0') + ':' + sn.toString().padStart(2, '0');
  };
  const formatSure = (s: number) => {
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
    if (lang === 'en') return h > 0 ? h + 'h ' + m + 'm' : m + ' min';
    return h > 0 ? h + 's ' + m + 'dk' : m + ' dk';
  };
  const formatSaat = (ts: number) => { const d = new Date(ts); return d.getHours().toString().padStart(2, '0') + ':' + d.getMinutes().toString().padStart(2, '0'); };
  const formatTarih = (ts: number) => { const d = new Date(ts); return d.getDate().toString().padStart(2, '0') + '.' + (d.getMonth() + 1).toString().padStart(2, '0') + '.' + d.getFullYear(); };
  const formatTarihGuzel = (ts: number) => {
    const d = new Date(ts);
    return t.grafikGunler[d.getDay()] + ', ' + d.getDate() + ' ' + t.grafikAylar[d.getMonth()] + ' ' + d.getFullYear();
  };
  const haftaKeyGetir = (ts: number) => {
    const d = new Date(ts), gun = d.getDay(), haftaBasi = new Date(d);
    haftaBasi.setDate(d.getDate() - (gun === 0 ? 6 : gun - 1));
    return haftaBasi.getDate() + ' ' + t.grafikAylar[haftaBasi.getMonth()] + ' ' + haftaBasi.getFullYear();
  };
  // ── UYKU REHBERİ ALGORİTMASI ──────────────────────────────────────────────
  const uykuRehberiHesapla = () => {
    // Doğum tarihi yoksa profil eksik
    const dogumDate = dogumTarihi ? (() => {
      const p = dogumTarihi.split('.');
      if (p.length === 3) return new Date(+p[2], +p[1] - 1, +p[0]);
      return null;
    })() : null;

    if (!dogumDate || isNaN(dogumDate.getTime())) return { tip: 'profilEksik' as const };
    if (geceRaporlari.length < 3) return { tip: 'yetersizKayit' as const };

    // Yaşa göre uyanıklık penceresi (dakika)
    const haftalar = Math.floor((Date.now() - dogumDate.getTime()) / (7 * 24 * 3600 * 1000));
    let pencereDk = 90; // varsayılan
    if (haftalar < 6)        pencereDk = 52;
    else if (haftalar < 12)  pencereDk = 75;
    else if (haftalar < 16)  pencereDk = 97;
    else if (haftalar < 24)  pencereDk = 150;
    else if (haftalar < 36)  pencereDk = 180;
    else                     pencereDk = 210;

    const sonRaporR   = geceRaporlari[0];
    const sonUykuSn   = sonRaporR.enUzunUyku;   // saniye
    const uyananKez   = sonRaporR.aglamaSayisi;
    const bitisSaati  = sonRaporR.bitis;         // ms timestamp

    // Düzeltmeler
    let duzeltmeDk = 0;
    if (sonUykuSn < 40 * 60)  duzeltmeDk -= 15;
    if (uyananKez >= 3)       duzeltmeDk -= 15;
    if (sonUykuSn > 90 * 60)  duzeltmeDk += 10;

    const tahminiMs = bitisSaati + (pencereDk + duzeltmeDk) * 60 * 1000;
    const tahminiD  = new Date(tahminiMs);
    const tahminiSaat = tahminiD.getHours().toString().padStart(2, '0') + ':' + tahminiD.getMinutes().toString().padStart(2, '0');

    // Ritim etiketi
    let ritim: 'dengeli' | 'birazKaymis' | 'yorgunluk';
    if (uyananKez >= 3)     ritim = 'yorgunluk';
    else if (duzeltmeDk < 0) ritim = 'birazKaymis';
    else                    ritim = 'dengeli';

    return { tip: 'sonuc' as const, tahminiSaat, ritim };
  };
  const rehberSonuc = uykuRehberiHesapla();

  const haftayaGoreGrupla = (raporlar: GeceRaporu[]) => {
    const gruplar: { [key: string]: GeceRaporu[] } = {};
    raporlar.forEach(r => { const key = haftaKeyGetir(r.baslangic); if (!gruplar[key]) gruplar[key] = []; gruplar[key].push(r); });
    return gruplar;
  };
  const kaliteEtiket = (puan: number) => {
    if (puan >= 85) return t.kaliteEtiketler[0];
    if (puan >= 70) return t.kaliteEtiketler[1];
    if (puan >= 50) return t.kaliteEtiketler[2];
    return t.kaliteEtiketler[3];
  };

  // ── GÜNDÜZ / GECE AYRIMI ──────────────────────────────────────────────────
  const raporGunduMu = useCallback((baslangic: number) => {
    const saat = new Date(baslangic).getHours();
    return saat >= 6 && saat < 20;
  }, []);

  // ── DOĞUM TARİHİ → HAFTA ─────────────────────────────────────────────────
  const bebekHaftasiHesapla = useCallback((): number | null => {
    if (!dogumTarihi) return null;
    const p = dogumTarihi.split('.');
    if (p.length !== 3) return null;
    const dogum = new Date(+p[2], +p[1] - 1, +p[0]);
    if (isNaN(dogum.getTime())) return null;
    return Math.floor((Date.now() - dogum.getTime()) / (7 * 24 * 3600 * 1000));
  }, [dogumTarihi]);

  // ── WONDER WEEKS KONTROLÜ ─────────────────────────────────────────────────
  const gelisimSicramasiVarMi = useMemo(() => {
    const haftalar = bebekHaftasiHesapla();
    if (haftalar === null) return false;
    return WONDER_WEEKS.some(w => Math.abs(haftalar - w) <= 1);
  }, [bebekHaftasiHesapla]);

  // ── YAŞA GÖRE ÖNERİLEN UYKU ─────────────────────────────────────────────
  const yasaGoreOnerilen = useMemo((): { saatSn: number; etiket: string } | null => {
    const haftalar = bebekHaftasiHesapla();
    if (haftalar === null) return null;
    const aylar = Math.floor(haftalar / 4.33);
    // Önerilen toplam uyku (saat * 3600 saniye)
    if (aylar < 3)       return { saatSn: 16 * 3600, etiket: '0-3 ay' };
    if (aylar < 6)       return { saatSn: 15 * 3600, etiket: '3-6 ay' };
    if (aylar < 12)      return { saatSn: 14 * 3600, etiket: '6-12 ay' };
    return               { saatSn: 13 * 3600, etiket: '1+ yıl' };
  }, [bebekHaftasiHesapla]);

  // ── SON 7 GÜN ORT. UYKU ─────────────────────────────────────────────────
  const son7GunOrtUyku = useMemo((): number => {
    if (geceRaporlari.length === 0) return 0;
    const bugun = Date.now();
    const son7 = geceRaporlari.filter(r => bugun - r.baslangic <= 7 * 24 * 3600 * 1000);
    if (son7.length === 0) return 0;
    return son7.reduce((acc, r) => acc + r.toplamUyku, 0) / son7.length;
  }, [geceRaporlari]);

  // ── HAFTALIK TREND ───────────────────────────────────────────────────────
  const haftalikTrend = useMemo(() => {
    const bugun = Date.now();
    const buHaftaRaporlar = geceRaporlari.filter(r => bugun - r.baslangic <= 7 * 24 * 3600 * 1000);
    const gecenHaftaRaporlar = geceRaporlari.filter(r => {
      const fark = bugun - r.baslangic;
      return fark > 7 * 24 * 3600 * 1000 && fark <= 14 * 24 * 3600 * 1000;
    });
    const avg = (arr: GeceRaporu[]) => arr.length ? arr.reduce((a, r) => a + r.toplamUyku, 0) / arr.length : 0;
    const aglamaAvg = (arr: GeceRaporu[]) => arr.length ? arr.reduce((a, r) => a + r.aglamaSayisi, 0) / arr.length : 0;
    return {
      buHaftaSayisi:   buHaftaRaporlar.length,
      gecenHaftaSayisi: gecenHaftaRaporlar.length,
      buHaftaOrt:      avg(buHaftaRaporlar),
      gecenHaftaOrt:   avg(gecenHaftaRaporlar),
      buHaftaAglama:   aglamaAvg(buHaftaRaporlar),
      gecenHaftaAglama: aglamaAvg(gecenHaftaRaporlar),
    };
  }, [geceRaporlari]);

  // ── DÜZEN ANALİZİ ────────────────────────────────────────────────────────
  const duzenAnalizi = useMemo((): 'dengeli' | 'hafifKaymis' | 'yetersiz' => {
    if (geceRaporlari.length < 4) return 'yetersiz';
    const son5 = geceRaporlari.slice(0, 5);
    const baslangicSaatler = son5.map(r => new Date(r.baslangic).getHours());
    const ort = baslangicSaatler.reduce((a, b) => a + b, 0) / baslangicSaatler.length;
    const sapma = Math.sqrt(baslangicSaatler.reduce((a, b) => a + Math.pow(b - ort, 2), 0) / baslangicSaatler.length);
    if (sapma <= 0.75) return 'dengeli';
    if (sapma <= 1.5)  return 'hafifKaymis';
    return 'hafifKaymis';
  }, [geceRaporlari]);

  // ── UYKU HAFIZASI (geçen hafta bu gün) ──────────────────────────────────
  const uykuHafizasi = useMemo((): GeceRaporu | null => {
    const bugun = new Date();
    const gecenHaftaBugun = new Date(bugun);
    gecenHaftaBugun.setDate(bugun.getDate() - 7);
    const gunBaslangic = new Date(gecenHaftaBugun.getFullYear(), gecenHaftaBugun.getMonth(), gecenHaftaBugun.getDate()).getTime();
    const gunBitis = gunBaslangic + 86400000;
    return geceRaporlari.find(r => r.baslangic >= gunBaslangic && r.baslangic < gunBitis) ?? null;
  }, [geceRaporlari]);

  // ── EBEVEYN NOTU MESAJI ──────────────────────────────────────────────────
  const buGeceIcinMesaj = useCallback((puan: number): string => {
    const msgs = t.buGeceIcinMesajlar as string[];
    if (puan >= 85) return msgs[0];
    if (puan >= 70) return msgs[1];
    if (puan >= 50) return msgs[2];
    return msgs[3];
  }, [t]);

  // ── SES ÖĞRENME: en iyi ses ───────────────────────────────────────────────
  const sesOnerisi = useMemo((): SesOgrenmeKayit | null => {
    if (sesOgrenmeKayitlar.length < 3) return null;
    const sayac: Record<number, { sesAdi: string; toplamKalis: number; count: number }> = {};
    sesOgrenmeKayitlar.forEach(k => {
      if (!sayac[k.sesId]) sayac[k.sesId] = { sesAdi: k.sesAdi, toplamKalis: 0, count: 0 };
      sayac[k.sesId].toplamKalis += k.kalisSaniye;
      sayac[k.sesId].count++;
    });
    const enIyiId = Object.keys(sayac).sort((a, b) => {
      const ortA = sayac[+a].toplamKalis / sayac[+a].count;
      const ortB = sayac[+b].toplamKalis / sayac[+b].count;
      return ortA - ortB; // daha kısa kaliş = daha hızlı sakinleşme = daha iyi
    })[0];
    if (!enIyiId) return null;
    const en = sayac[+enIyiId];
    return { sesId: +enIyiId, sesAdi: en.sesAdi, kalisSaniye: en.toplamKalis / en.count, ts: 0 };
  }, [sesOgrenmeKayitlar]);

  // ── SES ÖĞRENME: kaydet ──────────────────────────────────────────────────
  const sesOgrenmeKaydet = useCallback(async (sesId: number, sesAdi: string, kalisSaniye: number) => {
    const yeni: SesOgrenmeKayit = { sesId, sesAdi, kalisSaniye, ts: Date.now() };
    setSesOgrenmeKayitlar(prev => {
      const guncellendi = [yeni, ...prev].slice(0, 50);
      AsyncStorage.setItem(SES_OGRENME_KEY, JSON.stringify(guncellendi)).catch(() => {});
      return guncellendi;
    });
  }, []);

  // ── WAKE WINDOW: bildirim gönder (günde max 3) ───────────────────────────
  const wakeWindowBildirimGonder = useCallback(async (mesaj: string) => {
    try {
      const bugun = new Date().toDateString();
      const data = await AsyncStorage.getItem(WAKE_WINDOW_BILDIRIM_KEY);
      const obj = data ? JSON.parse(data) : {};
      const bugunSayisi = obj[bugun] || 0;
      if (bugunSayisi >= 3) return;
      const { status } = await Notifications.getPermissionsAsync();
      if (status !== 'granted') return;
      await Notifications.scheduleNotificationAsync({
        content: { title: 'LumiBaby ⏰', body: mesaj, sound: true },
        trigger: null,
      });
      obj[bugun] = bugunSayisi + 1;
      await AsyncStorage.setItem(WAKE_WINDOW_BILDIRIM_KEY, JSON.stringify(obj));
    } catch {}
  }, []);

  const kaydiDurdur = async () => {
    if (pollIntervalRef.current) { clearInterval(pollIntervalRef.current); pollIntervalRef.current = null; }
    if (recordingRef.current) { try { await recordingRef.current.stopAndUnloadAsync(); } catch (_) {} recordingRef.current = null; }
  };
  const probeTimerTemizle = () => { if (probeTimerRef.current) { clearTimeout(probeTimerRef.current); probeTimerRef.current = null; } };
  const herSeyiDurdur = async () => {
    dinlemeRef.current = false; caliyorRef.current = false;
    if (timerRef.current) clearInterval(timerRef.current);
    if (detektorTimerRef.current) clearInterval(detektorTimerRef.current);
    if (cooldownTimerRef.current) { clearInterval(cooldownTimerRef.current); cooldownTimerRef.current = null; }
    probeTimerTemizle();
    await kaydiDurdur();
    if (audioManager.getState().tab === 'analiz') await audioManager.stop();
    cryEngineRef.current.reset();
    setConfidenceScore(0);
    setCooldownKalan(0);
    AsyncStorage.removeItem(SLEEP_START_KEY).catch(() => {});
  };

  // ── AĞLAMA YARDIMCISI ────────────────────────────────────────────────────────
  const crySonucHesapla = useCallback((cevaplar: number[]): CryKategori[] => {
    const puanlar: Record<CryKategori, number> = { aclik: 0, uykusuzluk: 0, gaz: 0, bez: 0, genel: 0 };
    cevaplar.forEach((secenek, soru) => {
      const skorlar = CRY_SCORES[soru]?.[secenek];
      if (skorlar) { (Object.keys(puanlar) as CryKategori[]).forEach(k => { puanlar[k] += skorlar[k] ?? 0; }); }
    });
    return (Object.keys(puanlar) as CryKategori[]).sort((a, b) => puanlar[b] - puanlar[a]);
  }, []);

  const crySonucuKaydet = useCallback(async (s1: CryKategori, s2: CryKategori | null) => {
    const kayit: CryHelperGecmis = { tarih: Date.now(), sonuc1: s1, sonuc2: s2 };
    setCryGecmis(prev => {
      const yeni = [kayit, ...prev].slice(0, 5);
      AsyncStorage.setItem(CRY_HELPER_KEY, JSON.stringify(yeni)).catch(() => {});
      return yeni;
    });
  }, []);

  const cryHelperBaslat = useCallback(async () => {
    if (free) {
      if (analizHak <= 0) { setPaywallTip('analiz'); setPaywallVisible(true); return; }
      const hakKullanildi = await analizKullan();
      if (!hakKullanildi) { setPaywallTip('analiz'); setPaywallVisible(true); return; }
    }
    setCryCevaplar([]); setCrySonuc([]); setCryHelperAdim('soru');
  }, [free, analizHak, analizKullan]);

  const cryCevapSec = useCallback(async (secenekIdx: number) => {
    const yeniCevaplar = [...cryCevaplar, secenekIdx];
    if (yeniCevaplar.length < 5) {
      setCryCevaplar(yeniCevaplar);
    } else {
      setCryCevaplar(yeniCevaplar);
      const siralananlar = crySonucHesapla(yeniCevaplar);
      setCrySonuc(siralananlar);
      await crySonucuKaydet(siralananlar[0], siralananlar[1] ?? null);
      setCryHelperAdim('sonuc');
    }
  }, [cryCevaplar, crySonucHesapla, crySonucuKaydet]);

  const bebekUyudu = () => {
    const yeniKayit: UykuKaydi = { id: Date.now(), baslangic: Date.now(), bitis: null };
    setAktifKayit(yeniKayit); aktifKayitRef.current = yeniKayit;
    setUyuyorMu(true); setSure(0); setDetektorSure(0);
    geceBaslangicRef.current = Date.now(); aglamaSayisiRef.current = 0; ilkAglamaZamaniRef.current = null; setAglamaSayisi(0);
    AsyncStorage.setItem(SLEEP_START_KEY, String(geceBaslangicRef.current)).catch(() => {});
    timerRef.current = setInterval(() => setSure(Math.floor((Date.now() - geceBaslangicRef.current) / 1000)), 1000);

    // Zamanlı uyku bildirimi planla
    (async () => {
      try {
        const { status } = await Notifications.getPermissionsAsync();
        if (status !== 'granted') return;
        const sonuc = uykuRehberiHesapla();
        if (sonuc.tip !== 'sonuc') return;
        const sonRaporR = geceRaporlari[0];
        const haftalar = dogumTarihi ? (() => {
          const p = dogumTarihi.split('.');
          if (p.length === 3) return Math.floor((Date.now() - new Date(+p[2], +p[1] - 1, +p[0]).getTime()) / (7 * 24 * 3600 * 1000));
          return 0;
        })() : 0;
        let pencereDk = 90;
        if (haftalar < 6) pencereDk = 52;
        else if (haftalar < 12) pencereDk = 75;
        else if (haftalar < 16) pencereDk = 97;
        else if (haftalar < 24) pencereDk = 150;
        else if (haftalar < 36) pencereDk = 180;
        else pencereDk = 210;
        let duzeltmeDk = 0;
        if (sonRaporR && sonRaporR.enUzunUyku < 40 * 60) duzeltmeDk -= 15;
        if (sonRaporR && sonRaporR.aglamaSayisi >= 3) duzeltmeDk -= 15;
        if (sonRaporR && sonRaporR.enUzunUyku > 90 * 60) duzeltmeDk += 10;
        const toplamDk = pencereDk + duzeltmeDk;
        const tetikSaniye = Math.round(toplamDk * 60 * 0.75);
        if (tetikSaniye <= 0) return;
        if (bildirimIdRef.current) await Notifications.cancelScheduledNotificationAsync(bildirimIdRef.current).catch(() => {});
        const id = await Notifications.scheduleNotificationAsync({
          content: { title: 'LumiBaby 🌙', body: t.uykuZamaniBildirim(bebekIsmi), sound: true },
          trigger: { seconds: tetikSaniye, type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL },
        });
        bildirimIdRef.current = id;
      } catch (_) {}
    })();
  };

  const dedektoraBasildi = async (tip: DedektorTip) => {
    if (free) {
      if (detektorHak <= 0) { setPaywallTip('detektor'); setPaywallVisible(true); return; }
      const hakKullanildi = await detektorKullan();
      if (!hakKullanildi) { setPaywallTip('detektor'); setPaywallVisible(true); return; }
      setDetektorSure(0);
      if (detektorTimerRef.current) clearInterval(detektorTimerRef.current);
      detektorTimerRef.current = setInterval(() => {
        setDetektorSure(prev => {
          if (prev >= 3599) { clearInterval(detektorTimerRef.current!); herSeyiDurdur(); setSeciliDetektor(null); setPaywallTip('detektor'); setPaywallVisible(true); return 0; }
          return prev + 1;
        });
      }, 1000);
    }
    const izin = await Audio.requestPermissionsAsync();
    if (!izin.granted) { alert(t.mikrofonIzni); return; }
    modalTipRef.current = tip; setModalTip(tip); setSesListeModal(true);
  };

  const sesSecildi = async (ses: SesTip) => {
    const tip = modalTipRef.current!;
    setSesListeModal(false);
    if (tip === 'aglama') setSeciliNinni(ses); else setSeciliKolik(ses);
    setSeciliDetektor(tip); aktifSesRef.current = ses; aktifDedektorRef.current = tip;
    if (dinlemeRef.current) {
      dinlemeRef.current = false; caliyorRef.current = false; probeTimerTemizle(); await kaydiDurdur();
      if (audioManager.getState().tab === 'analiz') await audioManager.stop();
      setCaliniyor(false); setDinleniyor(false);
    }
    setTimeout(() => dinlemeBaslat(ses), 400);
  };

  const kalibrasyonYap = async (): Promise<void> => {
    const KALIBRASYON_SURE_MS = 3000;
    setKalibrasyon(true);
    let kalRec: Audio.Recording | null = null;
    try {
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true, staysActiveInBackground: true, shouldDuckAndroid: false });
      const { recording } = await Audio.Recording.createAsync({ ...Audio.RecordingOptionsPresets.HIGH_QUALITY, isMeteringEnabled: true });
      kalRec = recording;
      const ornekler: number[] = [];
      const interval = setInterval(async () => {
        try { const st = await recording.getStatusAsync(); const db = (st as any).metering ?? -160; if (db > -160) ornekler.push(db); } catch (_) {}
      }, 200);
      await new Promise(res => setTimeout(res, KALIBRASYON_SURE_MS));
      clearInterval(interval);
      await kalRec.stopAndUnloadAsync();
      kalRec = null;
      cryEngineRef.current.calibrate(ornekler);
    } catch (_) {
      if (kalRec) { try { await kalRec.stopAndUnloadAsync(); } catch (__) {} }
      cryEngineRef.current.calibrate([-50]); // fallback
    } finally {
      setKalibrasyon(false);
    }
  };

  const dinlemeBaslat = async (ses: SesTip) => {
    if (dinlemeRef.current) return;
    dinlemeRef.current = true; setDinleniyor(true);
    cryEngineRef.current.reset();
    await kalibrasyonYap();
    try {
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true, staysActiveInBackground: true, shouldDuckAndroid: false });
      const { recording } = await Audio.Recording.createAsync({ ...Audio.RecordingOptionsPresets.HIGH_QUALITY, isMeteringEnabled: true });
      recordingRef.current = recording;
      const engine    = cryEngineRef.current;
      const dedTip    = aktifDedektorRef.current ?? 'aglama';
      pollIntervalRef.current = setInterval(async () => {
        if (!dinlemeRef.current || caliyorRef.current) {
          if (pollIntervalRef.current) { clearInterval(pollIntervalRef.current); pollIntervalRef.current = null; }
          return;
        }
        // Cooldown devam ediyorsa sayacı güncelle
        if (engine.isCoolingDown()) {
          const kalan = Math.ceil(engine.cooldownRemaining() / 1000);
          setCooldownKalan(kalan);
          setConfidenceScore(0);
          return;
        }
        setCooldownKalan(0);
        try {
          const status = await recording.getStatusAsync();
          const db     = (status as any).metering ?? -160;
          const confidence = engine.analyze(db, dedTip);
          setConfidenceScore(confidence);
          const threshold = CONFIDENCE_THRESHOLD[hassasiyetRef.current];
          if (confidence >= threshold) {
            engine.triggerDetected();
            setConfidenceScore(0);
            if (pollIntervalRef.current) { clearInterval(pollIntervalRef.current); pollIntervalRef.current = null; }
            const g = aktifSesRef.current;
            if (g) sesCaldir(g);
          }
        } catch (_) {}
      }, 500);
    } catch (e) { dinlemeRef.current = false; setDinleniyor(false); }
  };

  const sessizlikProbeBaslat = (ses: SesTip) => {
    probeTimerTemizle();
    probeTimerRef.current = setTimeout(async () => {
      if (!dinlemeRef.current || !caliyorRef.current) return;
      // Sessizlik ölçümü için sesi kıs
      await audioManager.setActiveVolume(0);
      let dbOrnekleri: number[] = [];
      let probeRecording: Audio.Recording | null = null;
      try {
        await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true, staysActiveInBackground: true, shouldDuckAndroid: false });
        const { recording } = await Audio.Recording.createAsync({ ...Audio.RecordingOptionsPresets.HIGH_QUALITY, isMeteringEnabled: true });
        probeRecording = recording;
        const probeInterval = setInterval(async () => { try { const st = await recording.getStatusAsync(); const db = (st as any).metering ?? -160; dbOrnekleri.push(db); } catch (_) {} }, 500);
        await new Promise(res => setTimeout(res, 3000));
        clearInterval(probeInterval);
        await probeRecording.stopAndUnloadAsync(); probeRecording = null;
      } catch (_) { if (probeRecording) { try { await probeRecording.stopAndUnloadAsync(); } catch (_) {} } }
      if (!dinlemeRef.current) return;
      const ortDb = dbOrnekleri.length > 0 ? dbOrnekleri.reduce((a, b) => a + b, 0) / dbOrnekleri.length : -160;
      if (ortDb < -30) {
        // Bebek sakinleşti — ses öğrenme kaydı + pattern kaydet
        if (sesCalmaBaslangicRef.current > 0) {
          const kalisSn = Math.round((Date.now() - sesCalmaBaslangicRef.current) / 1000);
          sesCalmaBaslangicRef.current = 0;
          sesOgrenmeKaydet(ses.id, ses.name, kalisSn);
        }
        cryEngineRef.current.saveCurrentPattern().catch(() => {});
        sendAlertToAll('silence').catch(() => {});
        if (audioManager.getState().tab === 'analiz') await audioManager.stop();
        caliyorRef.current = false; setCaliniyor(false);
        dinlemeRef.current = false; setDinleniyor(false);
        setTimeout(() => dinlemeBaslat(ses), 300);
      } else {
        // Bebek hâlâ ağlıyor — sesi aç, probe'u tekrarla
        if (audioManager.getState().tab === 'analiz') await audioManager.setActiveVolume(1.0);
        sessizlikProbeBaslat(ses);
      }
    }, 60000);
  };

  const sesCaldir = async (ses: SesTip) => {
    if (caliyorRef.current) return;
    caliyorRef.current = true; setCaliniyor(true);
    sesCalmaBaslangicRef.current = Date.now();
    aglamaSayisiRef.current += 1; setAglamaSayisi(aglamaSayisiRef.current);
    if (!ilkAglamaZamaniRef.current) ilkAglamaZamaniRef.current = Date.now();
    const bildirimTip = aktifDedektorRef.current === 'kolik' ? 'colic' : 'crying';
    sendAlertToAll(bildirimTip).catch(() => {});
    try {
      await kaydiDurdur(); // mikrofon kaydını durdur — playback ile çakışmasın
      await audioManager.play(ses.file, ses.id, 'analiz', { loop: true });
      sessizlikProbeBaslat(ses);
    } catch (e) { caliyorRef.current = false; setCaliniyor(false); }
  };

  const bebekUyandi = async () => {
    if (bildirimIdRef.current) {
      await Notifications.cancelScheduledNotificationAsync(bildirimIdRef.current).catch(() => {});
      bildirimIdRef.current = null;
    }
    await herSeyiDurdur();
    // Wake Window bildirimini planla
    try {
      const haftalar = bebekHaftasiHesapla();
      if (haftalar !== null) {
        let wakeWindowDk = 90;
        if (haftalar < 6)       wakeWindowDk = 45;
        else if (haftalar < 12) wakeWindowDk = 60;
        else if (haftalar < 16) wakeWindowDk = 75;
        else if (haftalar < 24) wakeWindowDk = 120;
        else if (haftalar < 36) wakeWindowDk = 150;
        else                    wakeWindowDk = 180;
        const msg = t.wakeWindowAcik(wakeWindowDk);
        setTimeout(() => wakeWindowBildirimGonder(msg), wakeWindowDk * 60 * 1000);
      }
    } catch {}

    const bitis = Date.now(), baslangic = geceBaslangicRef.current;
    const toplamUyku  = Math.floor((bitis - baslangic) / 1000);
    const uykulaDalma = ilkAglamaZamaniRef.current ? Math.max(120, Math.floor((ilkAglamaZamaniRef.current - baslangic) / 1000)) : Math.max(120, Math.floor(toplamUyku * 0.05));
    const enUzunUyku  = aglamaSayisiRef.current === 0 ? toplamUyku : Math.floor(toplamUyku / (aglamaSayisiRef.current + 1));
    const skorSonuc   = uykuSkoruHesapla(toplamUyku, aglamaSayisiRef.current, baslangic, t);
    const tarihStr    = formatTarih(baslangic);
    const rapor: GeceRaporu = { id: Date.now(), tarih: tarihStr, toplamUyku, aglamaSayisi: aglamaSayisiRef.current, baslangic, bitis, uykulaDalma, enUzunUyku, uykuKalitesi: skorSonuc.toplam, puanDetay: skorSonuc.detaylar };
    setGeceRaporlari(prev => {
      const yeni = [rapor, ...prev];
      AsyncStorage.setItem(GECE_RAPORLARI_KEY, JSON.stringify(yeni)).catch(() => {});
      setSonRapor(rapor);
      return yeni;
    });
    setRaporModal(true);
    aktifKayitRef.current = null; setAktifKayit(null); setUyuyorMu(false); setSure(0);
    geceBaslangicRef.current = 0;
    setSeciliDetektor(null); setSeciliNinni(null); setSeciliKolik(null);
    setDinleniyor(false); setCaliniyor(false); setAglamaSayisi(0);
    aktifSesRef.current = null; aktifDedektorRef.current = null;
  };

  // Rapor modalı kapat + interstitial göster (dedektör aktifken asla)
  const closeRaporModal = () => {
    setRaporModal(false);
    showInterstitialIfReady(uyuyorMu).catch(() => {});
  };

  const raporDetayAc = (rapor: GeceRaporu) => {
    if (free) { setPaywallTip('premium'); setPaywallVisible(true); return; }
    setSeciliRapor(rapor); setDetayModal(true);
  };

  const haftalikGruplar  = haftayaGoreGrupla(geceRaporlari);
  const haftaAnahtarlari = Object.keys(haftalikGruplar);
  const son7Gun          = son7GunHazirla(geceRaporlari, t.grafikGunler);

  const sabitNinniler = lang === 'en' ? sabitNinniListesiEN : sabitNinniListesiTR;
  const sabitKolik    = lang === 'en' ? sabitKolikListesiEN : sabitKolikListesiTR;
  const sesList = modalTip === 'aglama'
    ? [...(anneNinniUri  ? [{ id: 999, name: lang === 'en' ? "Mom's Lullaby 👑" : 'Anne Sesi Ninnisi 👑', icon: '💜', file: { uri: anneNinniUri  } }] : []), ...sabitNinniler]
    : [...(annePisPisUri ? [{ id: 998, name: lang === 'en' ? "Mom's Shush 👑"    : 'Anne Sesi Pış Pış 👑',  icon: '💜', file: { uri: annePisPisUri } }] : []), ...sabitKolik];

  const cryKategoriLabel = useCallback((k: CryKategori): string => ({
    aclik: t.cryHelperAclik, uykusuzluk: t.cryHelperUykusuzluk,
    gaz: t.cryHelperGaz, bez: t.cryHelperBez, genel: t.cryHelperGenel,
  }[k]), [t]);

  const cryKategoriOneri = useCallback((k: CryKategori): string => ({
    aclik: t.cryHelperAclikOneri, uykusuzluk: t.cryHelperUykuOneri,
    gaz: t.cryHelperGazOneri, bez: t.cryHelperBezOneri, genel: t.cryHelperGenelOneri,
  }[k]), [t]);

  const crySoruMetinleri = [t.cryHelperS1, t.cryHelperS2, t.cryHelperS3, t.cryHelperS4, t.cryHelperS5];
  const crySecenekMetinleri = [
    [t.cryHelperS1A, t.cryHelperS1B, t.cryHelperS1C],
    [t.cryHelperS2A, t.cryHelperS2B, t.cryHelperS2C],
    [t.cryHelperS3A, t.cryHelperS3B, t.cryHelperS3C],
    [t.cryHelperS4A, t.cryHelperS4B, t.cryHelperS4C],
    [t.cryHelperS5A, t.cryHelperS5B, t.cryHelperS5C],
  ];

  return (
    <View style={styles.container}>
      {/* BANNER REKLAM — sadece ücretsiz kullanıcılara göster */}
      {free && <AdBanner />}

      <ScrollView ref={scrollRef} style={styles.scroll} contentContainerStyle={styles.scrollContent}>

        {/* UYKU KARTI */}
        <View style={styles.sleepCard}>
          <View style={styles.sleepCardUst}>
            <Text style={styles.sleepCardBaslik}>{t.geceModu}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              {free && <View style={styles.premiumMiniRozet}><Text style={styles.premiumMiniRozetYazi}>{t.gecePremiumSinirsiz}</Text></View>}
              <TouchableOpacity onPress={() => setNasılCalisirModal(true)}>
                <Text style={styles.nasılCalisirLink}>{t.nasılCalisirLink}</Text>
              </TouchableOpacity>
            </View>
          </View>
          <Text style={styles.sleepStatus}>
            {!uyuyorMu
              ? t.bebekUyanik(bebekIsmi)
              : caliniyor
                ? (seciliDetektor === 'aglama' ? t.ninnlCalıyor : t.beyazGurultuCalıyor)
                : kalibrasyon ? t.kalibrasyonMesaj
                : dinleniyor ? t.dinleniyor
                : t.bebekUyuyor(bebekIsmi)}
          </Text>
          <Text style={styles.sleepClock}>{formatSayac(sure)}</Text>
          {uyuyorMu && seciliDetektor !== null && (
            <View style={styles.aktifBilgi}>
              <Text style={styles.aktifBilgiText}>
                {seciliDetektor === 'aglama' ? t.aglamaDetektor : t.kolikDetektor}{' '}{t.aktif}
              </Text>
              {seciliDetektor === 'aglama' && seciliNinni && <Text style={styles.aktifSesText}>{seciliNinni.icon + ' ' + seciliNinni.name}</Text>}
              {seciliDetektor === 'kolik'  && seciliKolik  && <Text style={styles.aktifSesText}>{seciliKolik.icon + ' '  + seciliKolik.name}</Text>}
              {aglamaSayisi > 0 && <Text style={styles.aglamaSayisiText}>{t.agladiSayisi(aglamaSayisi)}</Text>}
              {free && <Text style={styles.sureBilgi}>{t.kalanSure(formatSayac(3600 - detektorSure))}</Text>}
              {/* Güven skoru çubuğu */}
              {dinleniyor && !caliniyor && cooldownKalan === 0 && (
                <View style={styles.confidenceRow}>
                  <View style={styles.confidenceBarBg}>
                    <View style={[styles.confidenceBarFill, {
                      width: `${confidenceScore}%` as any,
                      backgroundColor: confidenceScore >= CONFIDENCE_THRESHOLD[hassasiyet]
                        ? '#f87171'
                        : confidenceScore >= CONFIDENCE_THRESHOLD[hassasiyet] * 0.6
                          ? '#facc15'
                          : '#4ade80',
                    }]} />
                  </View>
                  <Text style={styles.confidenceText}>{t.guvenSkoru(confidenceScore)}</Text>
                </View>
              )}
              {cooldownKalan > 0 && (
                <Text style={styles.cooldownText}>{t.cooldownGostergesi(cooldownKalan)}</Text>
              )}
            </View>
          )}
          <TouchableOpacity style={[styles.sleepBtn, uyuyorMu && styles.sleepBtnUyaniyor]} onPress={uyuyorMu ? bebekUyandi : bebekUyudu}>
            <Text style={styles.sleepBtnText}>{uyuyorMu ? t.bebekUyandiBtn(bebekIsmi) : t.bebekUyuduBtn(bebekIsmi)}</Text>
          </TouchableOpacity>
        </View>

        {/* DEDEKTÖRLER */}
        {uyuyorMu && (
          <View style={styles.dedektorSection}>
            <Text style={styles.dedektorBaslik}>{t.geceModuSec}</Text>
            {free && <View style={styles.hakBilgi}><Text style={styles.hakBilgiYazi}>{t.bugunDetektor(detektorHak)}</Text></View>}
            <View style={styles.dedektorRow}>
              <View style={styles.dedektorKolumn}>
                <TouchableOpacity style={[styles.dedektorKart, seciliDetektor === 'aglama' && styles.dedektorKartAktif]} onPress={() => dedektoraBasildi('aglama')}>
                  <Text style={styles.dedektorKartIkon}>🎵</Text>
                  <Text style={styles.dedektorKartBaslik}>{t.aglamaDedektorBaslik}</Text>
                  <Text style={styles.dedektorKartAcik}>{t.aglamaDedektorAcik}</Text>
                  {seciliNinni && <View style={styles.sesBadge}><Text style={styles.sesBadgeText}>{seciliNinni.icon + ' ' + seciliNinni.name}</Text></View>}
                  {seciliDetektor === 'aglama' && <View style={styles.aktifBadge}><Text style={styles.aktifBadgeText}>{t.aktif}</Text></View>}
                </TouchableOpacity>
              </View>
              <View style={styles.dedektorKolumn}>
                <TouchableOpacity style={[styles.dedektorKart, seciliDetektor === 'kolik' && styles.dedektorKartAktifKolik]} onPress={() => dedektoraBasildi('kolik')}>
                  <Text style={styles.dedektorKartIkon}>🌿</Text>
                  <Text style={styles.dedektorKartBaslik}>{t.kolikDedektorBaslik}</Text>
                  <Text style={styles.dedektorKartAcik}>{t.kolikDedektorAcik}</Text>
                  {seciliKolik && <View style={[styles.sesBadge, styles.sesBadgeKolik]}><Text style={styles.sesBadgeText}>{seciliKolik.icon + ' ' + seciliKolik.name}</Text></View>}
                  {seciliDetektor === 'kolik' && <View style={[styles.aktifBadge, styles.aktifBadgeKolik]}><Text style={styles.aktifBadgeText}>{t.aktif}</Text></View>}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}

        {/* GEÇMİŞ GECELER */}
        <View onLayout={e => { gecmisOffsetRef.current = e.nativeEvent.layout.y; }}>
        <Text style={styles.bolumBaslik}>{t.gecmisGeceler}</Text>
        {free ? (
          <TouchableOpacity style={styles.arsivKilitKutu} onPress={() => { setPaywallTip('premium'); setPaywallVisible(true); }}>
            <Text style={styles.arsivKilitYazi}>{t.arsivKilit}</Text>
            <Text style={styles.arsivKilitAlt}>{t.arsivKilitAlt}</Text>
          </TouchableOpacity>
        ) : geceRaporlari.length === 0 ? (
          <View style={styles.bosKutu}><Text style={styles.bosKutuIkon}>📊</Text><Text style={styles.bosKutuYazi}>{t.bosRapor}</Text></View>
        ) : (
          haftaAnahtarlari.map((hafta) => (
            <View key={hafta} style={styles.haftaGrubu}>
              <TouchableOpacity style={styles.haftaBaslikRow} onPress={() => setAcikHafta(acikHafta === hafta ? null : hafta)}>
                <Text style={styles.haftaBaslikYazi}>{t.haftaBaslik(hafta)}</Text>
                <Text style={styles.haftaOk}>{acikHafta === hafta ? '▲' : '▼'}</Text>
              </TouchableOpacity>
              {acikHafta === hafta && haftalikGruplar[hafta].map((r) => (
                <TouchableOpacity key={r.id} style={styles.geceRow} onPress={() => raporDetayAc(r)}>
                  <View style={styles.geceRowSol}>
                    <Text style={styles.geceTarih}>{formatTarihGuzel(r.baslangic)}</Text>
                    <Text style={styles.geceSaat}>{formatSaat(r.baslangic) + ' → ' + formatSaat(r.bitis) + ' · ' + formatSure(r.toplamUyku)}</Text>
                  </View>
                  <View style={styles.geceRowSag}>
                    <View style={[styles.puanDaire, { borderColor: kaliteRenk(r.uykuKalitesi) }]}>
                      <Text style={[styles.puanYazi, { color: kaliteRenk(r.uykuKalitesi) }]}>{r.uykuKalitesi}</Text>
                    </View>
                    <Text style={styles.geceOk}>›</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          ))
        )}
        </View>

        {/* UYKU REHBERİ */}
        <TouchableOpacity activeOpacity={0.85} style={styles.rehberKart} onPress={() => setRehberDetayModal(true)}>
          <View style={styles.rehberBaslikRow}>
            <Text style={styles.rehberBaslik}>{t.uykuRehberiBaslik}</Text>
            <TouchableOpacity onPress={() => setNasılIslerModal(true)}>
              <Text style={styles.nasılCalisirLink}>{t.uykuRehberiNasılIsler}</Text>
            </TouchableOpacity>
          </View>
          {rehberSonuc.tip === 'profilEksik' ? (
            <Text style={styles.rehberUyari}>{t.uykuRehberiProfilEksik}</Text>
          ) : rehberSonuc.tip === 'yetersizKayit' ? (
            <Text style={styles.rehberUyari}>{t.uykuRehberiYetersizKayit}</Text>
          ) : (
            <>
              <View style={styles.rehberSatir}>
                <Text style={styles.rehberEtiket}>{t.uykuRehberiSiradaki}</Text>
                <Text style={styles.rehberDeger}>{rehberSonuc.tahminiSaat}</Text>
              </View>
              <View style={styles.rehberSatir}>
                <Text style={styles.rehberEtiket}>{t.uykuRehberiRitim}</Text>
                <Text style={[styles.rehberDeger, rehberSonuc.ritim === 'dengeli' ? styles.rehberYesil : rehberSonuc.ritim === 'yorgunluk' ? styles.rehberKirmizi : styles.rehberSari]}>
                  {t.uykuRehberiRitimler[rehberSonuc.ritim]}
                </Text>
              </View>
              <View style={styles.rehberAltSatir}>
                <Text style={styles.rehberKisaIpucu} numberOfLines={1}>{t.uykuRehberiNotlar[rehberSonuc.ritim]}</Text>
                <View style={styles.rehberOkDaire}>
                  <Text style={styles.rehberOkIkon}>›</Text>
                </View>
              </View>
            </>
          )}
        </TouchableOpacity>

        {/* 7 GÜNLÜK GRAFİK */}
        <View onLayout={e => { grafikOffsetRef.current = e.nativeEvent.layout.y; }}>
        <Text style={[styles.bolumBaslik, { marginTop: 16 }]}>{t.yedıGunGrafik}</Text>
        {free ? (
          <TouchableOpacity style={styles.premiumKilitKutu} onPress={() => { setPaywallTip('premium'); setPaywallVisible(true); }}>
            <Text style={styles.premiumKilitIkon}>📊</Text>
            <Text style={styles.premiumKilitYazi}>{t.grafikKilit}</Text>
            <Text style={styles.premiumKilitBtn}>{t.arsivKilitAlt}</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.grafikKart}>
            <View style={styles.grafikIcerik}>
              {son7Gun.map((g, i) => {
                const barH = g.puan !== null ? Math.max(4, (g.puan / 100) * BAR_MAX_HEIGHT) : 4;
                const renk = g.puan !== null ? kaliteRenk(g.puan) : 'rgba(255,255,255,0.1)';
                return (
                  <View key={i} style={styles.grafikSutun}>
                    <Text style={[styles.grafikPuanText, { color: g.puan !== null ? renk : 'transparent' }]}>{g.puan !== null ? '' + g.puan : ' '}</Text>
                    <View style={[styles.grafikBarAlani, { height: BAR_MAX_HEIGHT }]}>
                      <View style={[styles.grafikBar, { height: barH, backgroundColor: renk, opacity: g.bugun ? 1 : 0.7 }]} />
                    </View>
                    <Text style={[styles.grafikGun, g.bugun && styles.grafikGunBugun]}>{g.gun}</Text>
                    <Text style={styles.grafikTarih}>{'' + g.tarih}</Text>
                  </View>
                );
              })}
            </View>
            <View style={styles.grafikAciklama}>
              {[{ renk: '#4ade80' }, { renk: '#facc15' }, { renk: '#fb923c' }, { renk: '#f87171' }].map((item, i) => (
                <View key={i} style={styles.grafikAciklamaRow}>
                  <View style={[styles.grafikAciklamaNokta, { backgroundColor: item.renk }]} />
                  <Text style={styles.grafikAciklamaYazi}>{t.grafikAciklama[i]}</Text>
                </View>
              ))}
            </View>
          </View>
        )}
        </View>

        {/* GELİŞİM SIÇRAMASI — Wonder Weeks — herkese görünür */}
        {gelisimSicramasiVarMi && (
          <View style={styles.gelisimKart}>
            <Text style={styles.gelisimBaslik}>{t.gelisimSicramasiBaslik}</Text>
            <Text style={styles.gelisimAcik}>{t.gelisimSicramasiAcik}</Text>
            <Text style={styles.gelisimAlt}>{t.gelisimSicramasiAlt}</Text>
          </View>
        )}

        {/* SES ÖNERİSİ */}
        {sesOnerisi && (
          <View style={styles.sesOgrenmeKart}>
            <Text style={styles.sesOgrenmeBaslik}>{t.sesOgrenmeBaslik}</Text>
            <Text style={styles.sesOgrenmeOneri}>{t.sesOgrenmeOneri(sesOnerisi.sesAdi)}</Text>
          </View>
        )}

        {/* YAŞA GÖRE KARŞILAŞTIRMA */}
        {yasaGoreOnerilen && (
          <View style={styles.yasaGoreKart}>
            <Text style={styles.yasaGoreBaslik}>{t.yasaGoreBaslik}</Text>
            {free ? (
              <TouchableOpacity onPress={() => { setPaywallTip('premium'); setPaywallVisible(true); }}>
                <Text style={styles.premiumKilitGenelYazi}>{t.yasaGorePremium}</Text>
                <Text style={styles.premiumKilitGenelBtn}>{t.premiumKilitGenelBtn}</Text>
              </TouchableOpacity>
            ) : (
              <>
                {(() => {
                  const onerSaat = Math.floor(yasaGoreOnerilen.saatSn / 3600);
                  const onerDk   = Math.floor((yasaGoreOnerilen.saatSn % 3600) / 60);
                  const ortSaat  = Math.floor(son7GunOrtUyku / 3600);
                  const ortDk    = Math.floor((son7GunOrtUyku % 3600) / 60);
                  const fark     = son7GunOrtUyku - yasaGoreOnerilen.saatSn;
                  const mesaj    = Math.abs(fark) < 3600 ? t.yasaGoreIyi : fark < 0 ? t.yasaGoreAz : t.yasaGoreFazla;
                  return (
                    <>
                      <Text style={styles.yasaGoreSatir}>{t.yasaGoreOnerilen(onerSaat, onerDk)}</Text>
                      <Text style={styles.yasaGoreSatir}>{t.yasaGoreOrtalama(ortSaat, ortDk)}</Text>
                      <Text style={styles.yasaGoreMesaj}>{mesaj}</Text>
                    </>
                  );
                })()}
              </>
            )}
          </View>
        )}

        {/* AĞLAMA YARDIMCISI */}
        <View style={styles.cryHelperKart}>
          {cryHelperAdim === 'giris' && (
            <>
              <Text style={styles.cryHelperBaslik}>{t.cryHelperBaslik}</Text>
              <Text style={styles.cryHelperAcik}>{t.cryHelperAcik}</Text>
              {free && analizHak > 0 && (
                <View style={styles.hakBilgi}><Text style={styles.hakBilgiYazi}>{t.cryHelperHak(analizHak)}</Text></View>
              )}
              <TouchableOpacity style={styles.cryHelperBaslatBtn} onPress={cryHelperBaslat}>
                <Text style={styles.cryHelperBaslatBtnYazi}>{t.cryHelperBaslat}</Text>
              </TouchableOpacity>
              {cryGecmis.length > 0 && (
                <>
                  <TouchableOpacity style={styles.cryHelperGecmisToggle} onPress={() => setCryGecmisGoster(!cryGecmisGoster)}>
                    <Text style={styles.cryHelperGecmisToggleYazi}>{t.cryHelperGecmis}</Text>
                    <Text style={styles.cryHelperGecmisToggleIkon}>{cryGecmisGoster ? '▲' : '▼'}</Text>
                  </TouchableOpacity>
                  {cryGecmisGoster && cryGecmis.map((g, i) => (
                    <View key={i} style={styles.cryHelperGecmisItem}>
                      <Text style={styles.cryHelperGecmisItemYazi}>
                        {cryKategoriLabel(g.sonuc1)}{g.sonuc2 ? ' · ' + cryKategoriLabel(g.sonuc2) : ''}
                      </Text>
                      <Text style={styles.cryHelperGecmisTarih}>{formatSaat(g.tarih)} · {formatTarih(g.tarih)}</Text>
                    </View>
                  ))}
                </>
              )}
            </>
          )}

          {cryHelperAdim === 'soru' && cryCevaplar.length < 5 && (
            <>
              <View style={styles.cryHelperProgressRow}>
                {[0,1,2,3,4].map(i => (
                  <View key={i} style={[styles.cryHelperProgressDot, i < cryCevaplar.length && styles.cryHelperProgressDotTamamlandi, i === cryCevaplar.length && styles.cryHelperProgressDotAktif]} />
                ))}
              </View>
              <Text style={styles.cryHelperSoruNo}>{t.cryHelperSoru(cryCevaplar.length + 1)}</Text>
              <Text style={styles.cryHelperSoruMetin}>{crySoruMetinleri[cryCevaplar.length] ?? ''}</Text>
              {(crySecenekMetinleri[cryCevaplar.length] ?? []).map((secenek, secIdx) => (
                <TouchableOpacity key={secIdx} style={styles.cryHelperSecenekBtn} onPress={() => cryCevapSec(secIdx)}>
                  <Text style={styles.cryHelperSecenekYazi}>{secenek}</Text>
                </TouchableOpacity>
              ))}
            </>
          )}

          {cryHelperAdim === 'sonuc' && crySonuc.length > 0 && (
            <>
              <Text style={styles.cryHelperSonucBaslik}>{t.cryHelperSonucBaslik}</Text>
              {crySonuc.slice(0, 2).map((k, i) => (
                <View key={k} style={[styles.cryHelperSonucItem, i === 0 && styles.cryHelperSonucItem1]}>
                  <Text style={[styles.cryHelperSonucKategori, i === 0 && styles.cryHelperSonucKategori1]}>{cryKategoriLabel(k)}</Text>
                  <Text style={styles.cryHelperSonucOneri}>{cryKategoriOneri(k)}</Text>
                </View>
              ))}
              {/* Ses kısayolları */}
              {(crySonuc[0] === 'uykusuzluk' || crySonuc[1] === 'uykusuzluk') && (
                <TouchableOpacity style={styles.cryHelperSesBtn} onPress={() => { setCryHelperAdim('giris'); router.push('/'); }}>
                  <Text style={styles.cryHelperSesBtnYazi}>{t.cryHelperNinniGit}</Text>
                </TouchableOpacity>
              )}
              {(crySonuc[0] === 'gaz' || crySonuc[1] === 'gaz') && (
                <TouchableOpacity style={[styles.cryHelperSesBtn, styles.cryHelperSesBtnKolik]} onPress={() => { setCryHelperAdim('giris'); router.push('/kolik'); }}>
                  <Text style={styles.cryHelperSesBtnYazi}>{t.cryHelperKolikGit}</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={styles.cryHelperTekrarBtn} onPress={() => { setCryHelperAdim('giris'); }}>
                <Text style={styles.cryHelperTekrarBtnYazi}>{t.cryHelperTekrar}</Text>
              </TouchableOpacity>
            </>
          )}
        </View>

        {/* UZMAN ÖNERİLERİ */}
        <Text style={styles.bolumBaslik}>{t.uzmanOnerileriBaslik}</Text>
        <View style={styles.yasSecici}>
          {t.yasGruplari.map((y, i) => (
            <TouchableOpacity key={y} style={[styles.yasBtn, seciliYas === i && styles.yasBtnAktif]} onPress={() => setSeciliYas(i)}>
              <Text style={[styles.yasBtnYazi, seciliYas === i && styles.yasBtnYaziAktif]}>{y}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={styles.ipucuKart}>
          <Text style={styles.ipucuYazi}>{'🧠 🌙 ' + t.uzmanOnerileri[seciliYas]}</Text>
        </View>

      </ScrollView>

      {/* SES SEÇME MODAL */}
      <Modal visible={sesListeModal} transparent animationType="slide" onRequestClose={() => setSesListeModal(false)}>
        <View style={styles.modalArkaPlan}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setSesListeModal(false)} />
          <View style={[styles.modalKutu, { paddingBottom: Math.max(insets.bottom + 16, 24) }]}>
            <View style={styles.modalKol} />
            <Text style={styles.modalBaslik}>{modalTip === 'aglama' ? t.ninniSec : t.kolikSesSec}</Text>
            <Text style={styles.modalAltBaslik}>{modalTip === 'aglama' ? t.ninniSecAlt : t.kolikSecAlt}</Text>
            <ScrollView style={{ maxHeight: 400 }} nestedScrollEnabled>
              {sesList.map((ses) => {
                const secili  = modalTip === 'aglama' ? seciliNinni?.id === ses.id : seciliKolik?.id === ses.id;
                const anneMi  = ses.id >= 998;
                const kilitli = anneMi && free;
                return (
                  <TouchableOpacity
                    key={ses.id}
                    style={[styles.sesBtn, secili && styles.sesBtnSecili, anneMi && styles.sesBtnAnne, kilitli && { opacity: 0.6 }]}
                    onPress={() => { if (kilitli) { setPaywallTip('premium'); setPaywallVisible(true); return; } sesSecildi(ses); }}
                  >
                    <Text style={styles.sesIkon}>{ses.icon}</Text>
                    <Text style={styles.sesAdi}>{ses.name}</Text>
                    {kilitli && <Text style={{ fontSize: 16 }}>🔒</Text>}
                    {secili && !kilitli && <Text style={styles.sesTik}>✓</Text>}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* GECE RAPORU MODAL */}
      <Modal visible={raporModal} transparent animationType="fade" onRequestClose={closeRaporModal}>
        <View style={styles.raporModalArkaPlan}>
          <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: Math.max(insets.bottom + 20, 20) }}>
            {sonRapor && (
              <View style={styles.raporModalKutu}>
                <Text style={styles.raporModalBaslik}>
                  {raporGunduMu(sonRapor.baslangic) ? t.gunduzRaporuBaslik : t.geceRaporuTamBaslik}
                </Text>
                <Text style={styles.raporModalTarih}>{formatTarihGuzel(sonRapor.baslangic)}</Text>

                {free ? (
                  <View>
                    <View style={styles.basitRaporKutu}>
                      {[
                        { ikon: '😴', etiket: t.toplamUyku,    deger: formatSure(sonRapor.toplamUyku) },
                        { ikon: '😢', etiket: t.aglama,        deger: t.gecekez(sonRapor.aglamaSayisi) },
                        { ikon: '🕐', etiket: t.uykuBaslangici,deger: formatSaat(sonRapor.baslangic) },
                        { ikon: '🌅', etiket: t.uyanma,        deger: formatSaat(sonRapor.bitis) },
                      ].map((item, i, arr) => (
                        <View key={item.etiket}>
                          <View style={styles.basitRaporSatir}>
                            <Text style={styles.basitRaporEtiket}>{item.ikon + ' ' + item.etiket}</Text>
                            <Text style={styles.basitRaporDeger}>{item.deger}</Text>
                          </View>
                          {i < arr.length - 1 && <View style={styles.basitRaporAyrac} />}
                        </View>
                      ))}
                    </View>
                    <TouchableOpacity style={styles.detayKilitKutu} onPress={() => { setRaporModal(false); setPaywallTip('premium'); setPaywallVisible(true); }}>
                      <Text style={styles.detayKilitYazi}>{t.detayKilit}</Text>
                      <Text style={styles.detayKilitBtn}>{t.arsivKilitAlt}</Text>
                    </TouchableOpacity>
                    {/* Timeline teaser — üstü kilitli önizleme */}
                    <View style={[styles.timelineKutu, { opacity: 0.45 }]}>
                      <Text style={styles.timelineBaslik}>{t.timelineBaslik}</Text>
                      <View style={[styles.timelineBar, { height: 40 }]}>
                        <View style={{ position: 'absolute', left: tlBarW * 0.18, width: tlBarW * 0.58, height: 40, backgroundColor: '#7F77DD', borderRadius: 8 }} />
                      </View>
                      <View style={styles.timelineEtiketler}>
                        <Text style={styles.timelineEtiket}>19:00</Text>
                        <Text style={styles.timelineEtiket}>01:00</Text>
                        <Text style={styles.timelineEtiket}>07:00</Text>
                      </View>
                    </View>
                  </View>
                ) : (
                  <View>
                    <View style={styles.skorDaireKutu}>
                      <View style={[styles.skorDaire, { borderColor: kaliteRenk(sonRapor.uykuKalitesi) }]}>
                        <Text style={[styles.skorDaireSayi, { color: kaliteRenk(sonRapor.uykuKalitesi) }]}>{sonRapor.uykuKalitesi}</Text>
                        <Text style={[styles.skorDaireEtiket, { color: kaliteRenk(sonRapor.uykuKalitesi) }]}>{kaliteEtiket(sonRapor.uykuKalitesi)}</Text>
                      </View>
                    </View>
                    <View style={styles.progressBg}>
                      <View style={[styles.progressFill, { width: (sonRapor.uykuKalitesi + '%') as any, backgroundColor: kaliteRenk(sonRapor.uykuKalitesi) }]} />
                    </View>
                    <Text style={[styles.progressYazi, { color: kaliteRenk(sonRapor.uykuKalitesi) }]}>{'%' + sonRapor.uykuKalitesi + ' — ' + kaliteEtiket(sonRapor.uykuKalitesi)}</Text>
                    <View style={styles.gridRow}>
                      <View style={styles.gridKart}><Text style={styles.gridDeger}>{formatSure(sonRapor.toplamUyku)}</Text><Text style={styles.gridEtiket}>{t.toplamUyku}</Text></View>
                      <View style={styles.gridKart}><Text style={styles.gridDeger}>{t.gecekez(sonRapor.aglamaSayisi)}</Text><Text style={styles.gridEtiket}>{t.aglama}</Text></View>
                    </View>
                    <View style={styles.gridRow}>
                      <View style={styles.gridKart}><Text style={styles.gridDeger}>{formatSure(sonRapor.uykulaDalma)}</Text><Text style={styles.gridEtiket}>{t.uykuyaDalma}</Text></View>
                      <View style={styles.gridKart}><Text style={styles.gridDeger}>{formatSure(sonRapor.enUzunUyku)}</Text><Text style={styles.gridEtiket}>{t.enUzunUyku}</Text></View>
                    </View>
                    <View style={styles.gridRow}>
                      <View style={styles.gridKart}><Text style={styles.gridDeger}>{formatSaat(sonRapor.baslangic)}</Text><Text style={styles.gridEtiket}>{t.uykuBaslangici}</Text></View>
                      <View style={styles.gridKart}><Text style={styles.gridDeger}>{formatSaat(sonRapor.bitis)}</Text><Text style={styles.gridEtiket}>{t.uyanma}</Text></View>
                    </View>
                    <View style={styles.puanDetayKutu}>
                      <Text style={styles.puanDetayBaslik}>{t.puanDetayBaslik}</Text>
                      {sonRapor.puanDetay.map((d, i) => (
                        <View key={i} style={styles.puanDetaySatir}>
                          <Text style={styles.puanDetayIkon}>{d.pozitif ? '✅' : '❌'}</Text>
                          <Text style={styles.puanDetayYazi}>{d.baslik}</Text>
                          <Text style={[styles.puanDetayPuan, { color: d.puan > 0 ? '#4ade80' : d.puan < 0 ? '#f87171' : 'rgba(255,255,255,0.4)' }]}>
                            {d.puan > 0 ? '+' + d.puan : '' + d.puan}
                          </Text>
                        </View>
                      ))}
                    </View>
                    <View style={styles.analizYorumKutu}>
                      <Text style={styles.analizYorumBaslik}>{t.analizYorumBaslik}</Text>
                      <Text style={styles.analizYorumYazi}>{t.analizYorum(sonRapor.aglamaSayisi)}</Text>
                    </View>
                    {geceRaporlari.length > 1 && (() => {
                      const onceki = geceRaporlari[1];
                      const sureFark  = sonRapor.toplamUyku - onceki.toplamUyku;
                      const aglamaFark = sonRapor.aglamaSayisi - onceki.aglamaSayisi;
                      const skorFark  = sonRapor.uykuKalitesi - onceki.uykuKalitesi;
                      return (
                        <View style={styles.karsilastirmaKutu}>
                          <Text style={styles.karsilastirmaBaslik}>{t.dunleKarsilastirma}</Text>
                          <View style={styles.karsilastirmaSatir}>
                            <Text style={styles.karsilastirmaEtiket}>{t.uyku}</Text>
                            <Text style={[styles.karsilastirmaDeger, { color: sureFark > 0 ? '#4ade80' : sureFark < 0 ? '#f87171' : 'rgba(255,255,255,0.5)' }]}>
                              {sureFark === 0 ? t.aynı : sureFark > 0 ? t.dahahFazla(formatSure(sureFark)) : t.dahaAz(formatSure(Math.abs(sureFark)))}
                            </Text>
                          </View>
                          <View style={styles.karsilastirmaSatir}>
                            <Text style={styles.karsilastirmaEtiket}>{t.aglamaKars}</Text>
                            <Text style={[styles.karsilastirmaDeger, { color: aglamaFark < 0 ? '#4ade80' : aglamaFark > 0 ? '#f87171' : 'rgba(255,255,255,0.5)' }]}>
                              {aglamaFark === 0 ? t.aynı : aglamaFark < 0 ? t.dahaAz(Math.abs(aglamaFark).toString()) : t.dahahFazla(aglamaFark.toString())}
                            </Text>
                          </View>
                          <View style={styles.karsilastirmaSatir}>
                            <Text style={styles.karsilastirmaEtiket}>{t.uykuSkoru}</Text>
                            <Text style={[styles.karsilastirmaDeger, { color: skorFark > 0 ? '#4ade80' : skorFark < 0 ? '#f87171' : 'rgba(255,255,255,0.5)' }]}>
                              {skorFark === 0 ? t.aynı : skorFark > 0 ? t.skorArtti(skorFark) : t.skorDustu(skorFark)}
                            </Text>
                          </View>
                        </View>
                      );
                    })()}

                    {/* TİMELINE */}
                    {(() => {
                      const baslangic = sonRapor.baslangic;
                      const bitis     = sonRapor.bitis;
                      const startHour = new Date(baslangic).getHours();
                      const isGece    = startHour >= 19 || startHour < 10;

                      let windowStart: number;
                      let windowEnd:   number;
                      if (isGece) {
                        const d = new Date(baslangic);
                        d.setHours(19, 0, 0, 0);
                        if (startHour < 10) d.setDate(d.getDate() - 1);
                        windowStart = d.getTime();
                        const e = new Date(windowStart);
                        e.setDate(e.getDate() + 1);
                        e.setHours(7, 0, 0, 0);
                        windowEnd = e.getTime();
                      } else {
                        const rawStart   = baslangic - 3 * 3600000;
                        const rawEnd     = bitis     + 3 * 3600000;
                        const dur        = rawEnd - rawStart;
                        const clampedDur = Math.max(4 * 3600000, Math.min(8 * 3600000, dur));
                        const center     = (baslangic + bitis) / 2;
                        windowStart = center - clampedDur / 2;
                        windowEnd   = center + clampedDur / 2;
                      }

                      const windowDur = windowEnd - windowStart;
                      const fmtLabel  = (ts: number) => {
                        const d = new Date(ts);
                        return d.getHours().toString().padStart(2, '0') + ':' + d.getMinutes().toString().padStart(2, '0');
                      };

                      const sleepLeft  = Math.max(0, ((baslangic - windowStart) / windowDur) * tlBarW);
                      const sleepRight = Math.min(tlBarW, ((bitis - windowStart) / windowDur) * tlBarW);
                      const sleepW     = Math.max(0, sleepRight - sleepLeft);
                      const dotCount   = Math.min(sonRapor.aglamaSayisi, 8);

                      return (
                        <View style={styles.timelineKutu}>
                          <Text style={styles.timelineBaslik}>{t.timelineBaslik}</Text>
                          <View style={[styles.timelineBar, { height: 40 }]}>
                            {sleepW > 0 && (
                              <View style={{ position: 'absolute', left: sleepLeft, width: sleepW, height: 40, backgroundColor: '#7F77DD', borderRadius: 8 }}>
                                {dotCount > 0 && Array.from({ length: dotCount }).map((_, i) => (
                                  <View key={i} style={{ position: 'absolute', left: sleepW * (i + 1) / (dotCount + 1) - 4, top: 14, width: 8, height: 8, borderRadius: 4, backgroundColor: '#f87171', opacity: 0.9 }} />
                                ))}
                              </View>
                            )}
                          </View>
                          <View style={styles.timelineEtiketler}>
                            <Text style={styles.timelineEtiket}>{fmtLabel(windowStart)}</Text>
                            <Text style={styles.timelineEtiket}>{fmtLabel(windowStart + windowDur / 2)}</Text>
                            <Text style={styles.timelineEtiket}>{fmtLabel(windowEnd)}</Text>
                          </View>
                          <View style={styles.timelineLegend}>
                            <View style={styles.timelineLegendRow}><View style={[styles.timelineDot, { backgroundColor: '#7F77DD' }]} /><Text style={styles.timelineLegendYazi}>{t.timelineUyku}</Text></View>
                            {sonRapor.aglamaSayisi > 0 && (
                              <View style={styles.timelineLegendRow}><View style={[styles.timelineDot, { backgroundColor: '#f87171' }]} /><Text style={styles.timelineLegendYazi}>{t.timelineAglama}</Text></View>
                            )}
                          </View>
                        </View>
                      );
                    })()}

                    {/* HAFTALIK TREND */}
                    {haftalikTrend.buHaftaSayisi > 0 && haftalikTrend.gecenHaftaSayisi > 0 && (
                      <View style={styles.haftalikTrendKutu}>
                        <Text style={styles.haftalikTrendBaslik}>{t.haftalikTrendBaslik}</Text>
                        {[
                          {
                            etiket: t.haftalikOrtUyku,
                            buHafta: haftalikTrend.buHaftaOrt,
                            gecenHafta: haftalikTrend.gecenHaftaOrt,
                            formatFn: (s: number) => formatSure(Math.round(s)),
                            pozitifArtti: true,
                          },
                          {
                            etiket: t.haftalikAglama,
                            buHafta: haftalikTrend.buHaftaAglama,
                            gecenHafta: haftalikTrend.gecenHaftaAglama,
                            formatFn: (s: number) => Math.round(s).toString(),
                            pozitifArtti: false, // ağlama azalırsa iyi
                          },
                        ].map(item => {
                          const fark = item.buHafta - item.gecenHafta;
                          const iyiMi = item.pozitifArtti ? fark > 0 : fark < 0;
                          const renk = fark === 0 ? 'rgba(255,255,255,0.5)' : iyiMi ? '#4ade80' : '#f87171';
                          const metin = fark === 0 ? t.trendAyni : fark > 0 ? t.trendArtti(item.formatFn(Math.abs(fark))) : t.trendAzaldi(item.formatFn(Math.abs(fark)));
                          return (
                            <View key={item.etiket} style={styles.karsilastirmaSatir}>
                              <Text style={styles.karsilastirmaEtiket}>{item.etiket}</Text>
                              <Text style={[styles.karsilastirmaDeger, { color: renk }]}>{metin}</Text>
                            </View>
                          );
                        })}
                      </View>
                    )}

                    {/* DÜZEN ANALİZİ */}
                    {duzenAnalizi !== 'yetersiz' && (
                      <View style={styles.duzenAnaliziKutu}>
                        <Text style={styles.duzenAnaliziBaslik}>{t.duzenAnaliziBaslik}</Text>
                        <Text style={styles.duzenAnaliziMetin}>
                          {duzenAnalizi === 'dengeli' ? t.duzenDengeli : t.duzenHafifKaymis}
                        </Text>
                        <Text style={styles.duzenAnaliziNot}>{t.duzenDuzenliNot}</Text>
                      </View>
                    )}

                    {/* UYKU HAFIZASI */}
                    <View style={styles.uykuHafizasiKutu}>
                      <Text style={styles.uykuHafizasiBaslik}>{t.uykuHafizasiBaslik}</Text>
                      {uykuHafizasi ? (() => {
                        const fark = sonRapor.toplamUyku - uykuHafizasi.toplamUyku;
                        const metin = Math.abs(fark) < 900
                          ? t.uykuHafizasiAyni
                          : fark > 0 ? t.uykuHafizasiIyi : t.uykuHafizasiKotu;
                        const renk = Math.abs(fark) < 900 ? 'rgba(255,255,255,0.5)' : fark > 0 ? '#4ade80' : '#f87171';
                        return (
                          <>
                            <Text style={styles.uykuHafizasiVardi}>{t.uykuHafizasiVardi(formatSure(uykuHafizasi.toplamUyku))}</Text>
                            <Text style={[styles.uykuHafizasiKarsi, { color: renk }]}>{metin}</Text>
                          </>
                        );
                      })() : (
                        <Text style={styles.uykuHafizasiVardi}>{t.uykuHafizasiYoktu}</Text>
                      )}
                    </View>

                    {/* EBEVEYN NOTU */}
                    <View style={styles.buGeceIcinKutu}>
                      <Text style={styles.buGeceIcinBaslik}>{t.buGeceIcinBaslik}</Text>
                      <Text style={styles.buGeceIcinMesaj}>{buGeceIcinMesaj(sonRapor.uykuKalitesi)}</Text>
                    </View>
                  </View>
                )}
                <TouchableOpacity style={[styles.raporModalBtn, { marginTop: 20 }]} onPress={closeRaporModal}>
                  <Text style={styles.raporModalBtnYazi}>{t.tamam}</Text>
                </TouchableOpacity>
              </View>
            )}
          </ScrollView>
        </View>
      </Modal>

      {/* DETAY MODAL */}
      <Modal visible={detayModal} transparent animationType="slide" presentationStyle="overFullScreen" onRequestClose={() => setDetayModal(false)}>
        <View style={styles.detayModalArkaPlan}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setDetayModal(false)} />
          <View style={[styles.detayModalKutu, { paddingBottom: Math.max(insets.bottom + 16, 24) }]}>
            <View style={styles.modalKol} />
            {seciliRapor && (
              <View style={{ flex: 1 }}>
                <Text style={styles.modalBaslik}>
                  {raporGunduMu(seciliRapor.baslangic) ? t.gunduzRaporuBaslik : t.geceRaporuTamBaslik}
                </Text>
                <Text style={styles.modalAltBaslik}>{formatTarihGuzel(seciliRapor.baslangic)}</Text>
                <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 20 }} showsVerticalScrollIndicator={false}>
                  <View style={styles.skorDaireKutu}>
                    <View style={[styles.skorDaire, { borderColor: kaliteRenk(seciliRapor.uykuKalitesi) }]}>
                      <Text style={[styles.skorDaireSayi, { color: kaliteRenk(seciliRapor.uykuKalitesi) }]}>{seciliRapor.uykuKalitesi}</Text>
                      <Text style={[styles.skorDaireEtiket, { color: kaliteRenk(seciliRapor.uykuKalitesi) }]}>{kaliteEtiket(seciliRapor.uykuKalitesi)}</Text>
                    </View>
                  </View>
                  <View style={styles.progressBg}>
                    <View style={[styles.progressFill, { width: (seciliRapor.uykuKalitesi + '%') as any, backgroundColor: kaliteRenk(seciliRapor.uykuKalitesi) }]} />
                  </View>
                  <Text style={[styles.progressYazi, { color: kaliteRenk(seciliRapor.uykuKalitesi) }]}>{'%' + seciliRapor.uykuKalitesi + ' — ' + kaliteEtiket(seciliRapor.uykuKalitesi)}</Text>
                  <View style={styles.gridRow}>
                    <View style={styles.gridKart}><Text style={styles.gridDeger}>{formatSure(seciliRapor.toplamUyku)}</Text><Text style={styles.gridEtiket}>{t.toplamUyku}</Text></View>
                    <View style={styles.gridKart}><Text style={styles.gridDeger}>{t.gecekez(seciliRapor.aglamaSayisi)}</Text><Text style={styles.gridEtiket}>{t.aglama}</Text></View>
                  </View>
                  <View style={styles.gridRow}>
                    <View style={styles.gridKart}><Text style={styles.gridDeger}>{formatSure(seciliRapor.uykulaDalma)}</Text><Text style={styles.gridEtiket}>{t.uykuyaDalma}</Text></View>
                    <View style={styles.gridKart}><Text style={styles.gridDeger}>{formatSure(seciliRapor.enUzunUyku)}</Text><Text style={styles.gridEtiket}>{t.enUzunUyku}</Text></View>
                  </View>
                  <View style={styles.gridRow}>
                    <View style={styles.gridKart}><Text style={styles.gridDeger}>{formatSaat(seciliRapor.baslangic)}</Text><Text style={styles.gridEtiket}>{t.uykuBaslangici}</Text></View>
                    <View style={styles.gridKart}><Text style={styles.gridDeger}>{formatSaat(seciliRapor.bitis)}</Text><Text style={styles.gridEtiket}>{t.uyanma}</Text></View>
                  </View>
                  <View style={styles.puanDetayKutu}>
                    <Text style={styles.puanDetayBaslik}>{t.puanDetayBaslik}</Text>
                    {seciliRapor.puanDetay.map((d, i) => (
                      <View key={i} style={styles.puanDetaySatir}>
                        <Text style={styles.puanDetayIkon}>{d.pozitif ? '✅' : '❌'}</Text>
                        <Text style={styles.puanDetayYazi}>{d.baslik}</Text>
                        <Text style={[styles.puanDetayPuan, { color: d.puan > 0 ? '#4ade80' : d.puan < 0 ? '#f87171' : 'rgba(255,255,255,0.4)' }]}>
                          {d.puan > 0 ? '+' + d.puan : '' + d.puan}
                        </Text>
                      </View>
                    ))}
                  </View>
                </ScrollView>
                <TouchableOpacity style={[styles.raporModalBtn, { marginTop: 12 }]} onPress={() => setDetayModal(false)}>
                  <Text style={styles.raporModalBtnYazi}>{t.kapat}</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </Modal>

      {/* NASIL ÇALIŞIR BOTTOM SHEET */}
      <Modal visible={nasılCalisirModal} transparent animationType="slide" onRequestClose={() => setNasılCalisirModal(false)}>
        <TouchableOpacity style={styles.rehberOverlay} activeOpacity={1} onPress={() => setNasılCalisirModal(false)} />
        <View style={[styles.rehberSheet, { maxHeight: screenHeight * 0.82, paddingBottom: Math.max(insets.bottom + 16, 40) }]}>
          <View style={styles.rehberSheetHandle} />
          <Text style={styles.rehberSheetBaslik}>{t.nasılCalisirBaslik}</Text>
          <ScrollView showsVerticalScrollIndicator={false}>

            <View style={styles.rehberSheetBolum}>
              <Text style={styles.rehberSheetBolumBaslik}>{t.nasılCalisirB1Baslik}</Text>
              <Text style={styles.rehberSheetMetin}>{t.nasılCalisirB1Metin}</Text>
            </View>

            <View style={styles.rehberSheetBolum}>
              <Text style={styles.rehberSheetBolumBaslik}>{t.nasılCalisirB2Baslik}</Text>
              <Text style={styles.rehberSheetMetin}>{t.nasılCalisirB2Metin}</Text>
            </View>

            <View style={styles.rehberSheetBolum}>
              <Text style={styles.rehberSheetBolumBaslik}>{t.nasılCalisirB3Baslik}</Text>
              <Text style={styles.rehberSheetMetin}>{t.nasılCalisirB3Metin}</Text>
            </View>

            <View style={styles.rehberSheetBolum}>
              <Text style={styles.rehberSheetBolumBaslik}>{t.nasılCalisirB4Baslik}</Text>
              <Text style={styles.rehberSheetMetin}>{t.nasılCalisirB4Metin}</Text>
            </View>

            <View style={styles.nasılCalisirNotKutu}>
              <Text style={styles.nasılCalisirNotYazi}>{t.nasılCalisirNot}</Text>
            </View>

          </ScrollView>
        </View>
      </Modal>

      {/* NASIL İŞLER MODAL — "Bu öneri neye göre hazırlandı?" */}
      <Modal visible={nasılIslerModal} transparent animationType="slide" onRequestClose={() => setNasılIslerModal(false)}>
        <TouchableOpacity style={styles.rehberOverlay} activeOpacity={1} onPress={() => setNasılIslerModal(false)} />
        <View style={[styles.rehberSheet, { maxHeight: screenHeight * 0.65, paddingBottom: Math.max(insets.bottom + 16, 40) }]}>
          <View style={styles.rehberSheetHandle} />
          <Text style={styles.rehberSheetBaslik}>{t.uykuRehberiBolum1Baslik}</Text>
          <ScrollView showsVerticalScrollIndicator={false}>
            <View style={styles.rehberSheetBolum}>
              <Text style={styles.rehberSheetMetin}>{t.uykuRehberiBolum1Metin(bebekIsmi)}</Text>
            </View>
          </ScrollView>
          <TouchableOpacity style={styles.rehberKapatBtn} onPress={() => setNasılIslerModal(false)}>
            <Text style={styles.rehberKapatBtnYazi}>{t.kapat}</Text>
          </TouchableOpacity>
        </View>
      </Modal>

      {/* REHBERİ DETAY MODAL — "Bugün için not" + navigasyon */}
      <Modal visible={rehberDetayModal} transparent animationType="slide" onRequestClose={() => setRehberDetayModal(false)}>
        <TouchableOpacity style={styles.rehberOverlay} activeOpacity={1} onPress={() => setRehberDetayModal(false)} />
        <View style={[styles.rehberSheet, { maxHeight: screenHeight * 0.75, paddingBottom: Math.max(insets.bottom + 16, 40) }]}>
          <View style={styles.rehberSheetHandle} />
          <Text style={styles.rehberSheetBaslik}>{t.uykuRehberiModalBaslik}</Text>
          <ScrollView showsVerticalScrollIndicator={false}>

            {/* Bugün için not */}
            {rehberSonuc.tip === 'sonuc' && (() => {
              const sonRaporR = geceRaporlari[0];
              const notlar: string[] = [];
              if (sonRaporR.enUzunUyku < 40 * 60) notlar.push(t.uykuRehberiBolum2Kisauyku);
              else if (sonRaporR.aglamaSayisi >= 3) notlar.push(t.uykuRehberiBolum2Bolundu);
              else notlar.push(t.uykuRehberiBolum2Dengeli);
              notlar.push(t.uykuRehberiBolum2Aksam);
              return (
                <View style={styles.rehberSheetBolum}>
                  <Text style={styles.rehberSheetBolumBaslik}>{t.uykuRehberiBolum2Baslik}</Text>
                  {notlar.map((not, i) => (
                    <Text key={i} style={styles.rehberSheetMetin}>• {not}</Text>
                  ))}
                </View>
              );
            })()}

            {/* Navigasyon butonlar */}
            <View style={styles.rehberSheetBolum}>
              <Text style={styles.rehberSheetBolumBaslik}>{t.uykuRehberiBolum3Baslik}</Text>
              <TouchableOpacity style={styles.rehberNavBtn} onPress={() => {
                setRehberDetayModal(false);
                setTimeout(() => scrollRef.current?.scrollTo({ y: gecmisOffsetRef.current, animated: true }), 150);
              }}>
                <Text style={styles.rehberNavBtnYazi}>{t.uykuRehberiGecmiseGit}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.rehberNavBtn} onPress={() => {
                setRehberDetayModal(false);
                setTimeout(() => scrollRef.current?.scrollTo({ y: grafikOffsetRef.current, animated: true }), 150);
              }}>
                <Text style={styles.rehberNavBtnYazi}>{t.uykuRehberiGrafigeGit}</Text>
              </TouchableOpacity>
            </View>

          </ScrollView>
          <TouchableOpacity style={styles.rehberKapatBtn} onPress={() => setRehberDetayModal(false)}>
            <Text style={styles.rehberKapatBtnYazi}>{t.kapat}</Text>
          </TouchableOpacity>
        </View>
      </Modal>

      {/* PAYWALL */}
      <Paywall
        visible={paywallVisible}
        onClose={() => setPaywallVisible(false)}
        onPremium={() => { setPaywallVisible(false); premiumAktifEt(); }}
        onReklam={isTrial ? undefined
          : paywallTip === 'detektor' ? async () => { setPaywallVisible(false); await reklamIzleDetektor(lang); }
          : paywallTip === 'analiz'   ? async () => { setPaywallVisible(false); await reklamIzleAnaliz(lang); }
          : undefined}
        baslik={paywallTip === 'detektor' ? t.paywallDetektorBaslik : paywallTip === 'analiz' ? t.paywallAnalizBaslik : t.paywallPremiumBaslik}
        aciklama={paywallTip === 'detektor' ? t.paywallDetektorAcik : paywallTip === 'analiz' ? t.paywallAnalizAcik : t.paywallPremiumAcik}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container:              { flex: 1, backgroundColor: '#07101e' },
  scroll:                 { flex: 1 },
  scrollContent:          { padding: 16, paddingBottom: 40 },
  sleepCard:              { backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 18, padding: 22, alignItems: 'center', marginBottom: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', gap: 12 },
  sleepCardUst:           { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: '100%' },
  sleepCardBaslik:        { color: 'rgba(255,255,255,0.5)', fontSize: 13, fontWeight: '600' },
  sleepStatus:            { color: 'rgba(255,255,255,0.7)', fontSize: 15 },
  sleepClock:             { color: 'white', fontSize: 52, fontWeight: 'bold' },
  aktifBilgi:             { alignItems: 'center', gap: 4 },
  aktifBilgiText:         { color: '#b8a8f8', fontSize: 13 },
  aktifSesText:           { color: 'rgba(255,255,255,0.5)', fontSize: 12 },
  aglamaSayisiText:       { color: '#f59e0b', fontSize: 12 },
  sureBilgi:              { color: '#fb923c', fontSize: 12, fontWeight: '600' },
  confidenceRow:          { alignItems: 'center', gap: 4, width: '100%', paddingHorizontal: 8, marginTop: 4 },
  confidenceBarBg:        { width: '100%', height: 6, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 3, overflow: 'hidden' },
  confidenceBarFill:      { height: '100%', borderRadius: 3 },
  confidenceText:         { color: 'rgba(255,255,255,0.45)', fontSize: 11 },
  cooldownText:           { color: 'rgba(251,146,60,0.8)', fontSize: 12 },
  sleepBtn:               { backgroundColor: 'rgba(157,140,239,0.25)', paddingHorizontal: 28, paddingVertical: 14, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(157,140,239,0.4)', width: '100%', alignItems: 'center' },
  sleepBtnUyaniyor:       { backgroundColor: 'rgba(74,222,128,0.2)', borderColor: 'rgba(74,222,128,0.4)' },
  sleepBtnText:           { color: 'white', fontSize: 16, fontWeight: 'bold' },
  premiumMiniRozet:       { backgroundColor: 'rgba(157,140,239,0.15)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: 'rgba(157,140,239,0.3)' },
  premiumMiniRozetYazi:   { color: '#b8a8f8', fontSize: 10, fontWeight: 'bold' },
  hakBilgi:               { backgroundColor: 'rgba(157,140,239,0.1)', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderColor: 'rgba(157,140,239,0.2)', alignSelf: 'center', marginBottom: 8 },
  hakBilgiYazi:           { color: '#b8a8f8', fontSize: 12 },
  dedektorSection:        { marginBottom: 20 },
  dedektorBaslik:         { color: 'rgba(255,255,255,0.5)', fontSize: 13, textAlign: 'center', marginBottom: 10 },
  dedektorRow:            { flexDirection: 'row', gap: 10 },
  dedektorKolumn:         { flex: 1, gap: 6 },
  dedektorKart:           { flex: 1, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 16, padding: 16, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', gap: 6 },
  dedektorKartAktif:      { backgroundColor: 'rgba(157,140,239,0.15)', borderColor: '#9d8cef' },
  dedektorKartAktifKolik: { backgroundColor: 'rgba(74,222,128,0.1)', borderColor: '#4ade80' },
  dedektorKartIkon:       { fontSize: 30 },
  dedektorKartBaslik:     { color: 'white', fontSize: 13, fontWeight: 'bold', textAlign: 'center', lineHeight: 18 },
  dedektorKartAcik:       { color: 'rgba(255,255,255,0.4)', fontSize: 11, textAlign: 'center', lineHeight: 15 },
  sesBadge:               { backgroundColor: 'rgba(157,140,239,0.25)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, marginTop: 2 },
  sesBadgeKolik:          { backgroundColor: 'rgba(74,222,128,0.2)' },
  sesBadgeText:           { color: 'white', fontSize: 10 },
  aktifBadge:             { backgroundColor: 'rgba(157,140,239,0.3)', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  aktifBadgeKolik:        { backgroundColor: 'rgba(74,222,128,0.25)' },
  aktifBadgeText:         { color: '#b8a8f8', fontSize: 10, fontWeight: 'bold' },
  bolumBaslik:            { color: 'white', fontSize: 18, fontWeight: 'bold', marginBottom: 12, marginTop: 4 },
  bosKutu:                { alignItems: 'center', padding: 24, gap: 8, marginBottom: 12 },
  bosKutuIkon:            { fontSize: 32 },
  bosKutuYazi:            { color: 'rgba(255,255,255,0.4)', fontSize: 14 },
  arsivKilitKutu:         { backgroundColor: 'rgba(157,140,239,0.08)', borderRadius: 12, padding: 16, marginBottom: 8, borderWidth: 1, borderColor: 'rgba(157,140,239,0.2)', alignItems: 'center', gap: 6 },
  arsivKilitYazi:         { color: 'rgba(255,255,255,0.5)', fontSize: 13 },
  arsivKilitAlt:          { color: '#9d8cef', fontSize: 13, fontWeight: '700' },
  premiumKilitKutu:       { backgroundColor: 'rgba(157,140,239,0.08)', borderRadius: 16, padding: 24, marginBottom: 20, borderWidth: 1, borderColor: 'rgba(157,140,239,0.2)', alignItems: 'center', gap: 8 },
  premiumKilitIkon:       { fontSize: 36 },
  premiumKilitYazi:       { color: 'rgba(255,255,255,0.6)', fontSize: 14 },
  premiumKilitBtn:        { color: '#9d8cef', fontSize: 14, fontWeight: '700' },
  haftaGrubu:             { marginBottom: 12 },
  haftaBaslikRow:         { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'rgba(157,140,239,0.1)', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: 'rgba(157,140,239,0.2)' },
  haftaBaslikYazi:        { color: '#b8a8f8', fontSize: 14, fontWeight: 'bold' },
  haftaOk:                { color: '#b8a8f8', fontSize: 14 },
  geceRow:                { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: 14, marginTop: 6, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  geceRowSol:             { flex: 1 },
  geceTarih:              { color: 'white', fontSize: 14, fontWeight: 'bold' },
  geceSaat:               { color: 'rgba(255,255,255,0.5)', fontSize: 12, marginTop: 2 },
  geceRowSag:             { flexDirection: 'row', alignItems: 'center', gap: 8 },
  puanDaire:              { width: 42, height: 42, borderRadius: 21, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  puanYazi:               { fontSize: 13, fontWeight: 'bold' },
  geceOk:                 { color: 'rgba(255,255,255,0.4)', fontSize: 22 },
  rehberKart:             { backgroundColor: 'rgba(157,140,239,0.08)', borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: 'rgba(157,140,239,0.2)', gap: 10 },
  rehberBaslikRow:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rehberBaslik:           { color: '#b8a8f8', fontSize: 15, fontWeight: 'bold' },
  rehberOk:               { color: 'rgba(157,140,239,0.6)', fontSize: 20, fontWeight: '300' },
  rehberOkDaire:          { width: 28, height: 28, borderRadius: 14, backgroundColor: '#9d8cef', alignItems: 'center', justifyContent: 'center' },
  rehberOkIkon:           { color: 'white', fontSize: 18, fontWeight: 'bold', lineHeight: 22, marginTop: -1 },
  rehberUyari:            { color: 'rgba(255,255,255,0.45)', fontSize: 13, lineHeight: 20 },
  rehberSatir:            { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rehberEtiket:           { color: 'rgba(255,255,255,0.5)', fontSize: 13 },
  rehberDeger:            { color: 'white', fontSize: 14, fontWeight: 'bold' },
  rehberYesil:            { color: '#4ade80' },
  rehberSari:             { color: '#facc15' },
  rehberKirmizi:          { color: '#f87171' },
  rehberAltSatir:         { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 },
  rehberKisaIpucu:        { color: 'rgba(255,255,255,0.38)', fontSize: 11, flex: 1, lineHeight: 16 },
  rehberKapatBtn:         { backgroundColor: 'rgba(157,140,239,0.15)', borderRadius: 14, padding: 14, alignItems: 'center', marginTop: 12, borderWidth: 1, borderColor: 'rgba(157,140,239,0.3)' },
  rehberKapatBtnYazi:     { color: '#b8a8f8', fontSize: 15, fontWeight: '600' },
  rehberNotKutu:          { backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: 10 },
  rehberNotYazi:          { color: 'rgba(255,255,255,0.5)', fontSize: 12, lineHeight: 18 },
  rehberOverlay:          { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  rehberSheet:            { backgroundColor: '#0f1e33', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 40, gap: 4 },
  rehberSheetHandle:      { width: 40, height: 4, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 2, alignSelf: 'center', marginBottom: 12 },
  rehberSheetBaslik:      { color: 'white', fontSize: 18, fontWeight: 'bold', marginBottom: 8, textAlign: 'center' },
  rehberSheetBolum:       { backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 14, padding: 16, marginBottom: 12, gap: 8 },
  rehberSheetBolumBaslik: { color: '#b8a8f8', fontSize: 13, fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 0.5 },
  rehberSheetMetin:       { color: 'rgba(255,255,255,0.7)', fontSize: 14, lineHeight: 22 },
  rehberNavBtn:           { backgroundColor: 'rgba(157,140,239,0.15)', borderRadius: 12, padding: 13, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(157,140,239,0.25)' },
  rehberNavBtnYazi:       { color: '#b8a8f8', fontSize: 14, fontWeight: '600' },
  nasılCalisirLink:       { color: '#9d8cef', fontSize: 11, fontWeight: '600' },
  nasılCalisirNotKutu:    { backgroundColor: 'rgba(251,146,60,0.1)', borderRadius: 14, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: 'rgba(251,146,60,0.3)' },
  nasılCalisirNotYazi:    { color: 'rgba(251,200,100,0.9)', fontSize: 13, lineHeight: 20 },
  grafikKart:             { backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 16, padding: 16, marginBottom: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  grafikIcerik:           { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 16 },
  grafikSutun:            { flex: 1, alignItems: 'center', gap: 4 },
  grafikPuanText:         { fontSize: 9, fontWeight: 'bold', height: 14, textAlign: 'center' },
  grafikBarAlani:         { width: '100%', justifyContent: 'flex-end', alignItems: 'center' },
  grafikBar:              { width: '60%', borderRadius: 4 },
  grafikGun:              { color: 'rgba(255,255,255,0.5)', fontSize: 10, marginTop: 4 },
  grafikGunBugun:         { color: '#b8a8f8', fontWeight: 'bold' },
  grafikTarih:            { color: 'rgba(255,255,255,0.3)', fontSize: 9 },
  grafikAciklama:         { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)' },
  grafikAciklamaRow:      { flexDirection: 'row', alignItems: 'center', gap: 4 },
  grafikAciklamaNokta:    { width: 8, height: 8, borderRadius: 4 },
  grafikAciklamaYazi:     { color: 'rgba(255,255,255,0.4)', fontSize: 10 },
  // ── AĞLAMA YARDIMCISI ────────────────────────────────────────────────────────
  cryHelperKart:              { backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', gap: 12 },
  cryHelperBaslik:            { color: 'white', fontSize: 16, fontWeight: 'bold' },
  cryHelperAcik:              { color: 'rgba(255,255,255,0.55)', fontSize: 13, lineHeight: 18 },
  cryHelperBaslatBtn:         { backgroundColor: '#9d8cef', borderRadius: 12, padding: 14, alignItems: 'center', marginTop: 4 },
  cryHelperBaslatBtnYazi:     { color: 'white', fontSize: 15, fontWeight: 'bold' },
  cryHelperGecmisToggle:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)', marginTop: 4 },
  cryHelperGecmisToggleYazi:  { color: 'rgba(255,255,255,0.45)', fontSize: 12 },
  cryHelperGecmisToggleIkon:  { color: 'rgba(255,255,255,0.35)', fontSize: 11 },
  cryHelperGecmisItem:        { backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: 10, gap: 3 },
  cryHelperGecmisItemYazi:    { color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: '600' },
  cryHelperGecmisTarih:       { color: 'rgba(255,255,255,0.35)', fontSize: 11 },
  cryHelperProgressRow:       { flexDirection: 'row', gap: 6, justifyContent: 'center' },
  cryHelperProgressDot:       { width: 8, height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.12)' },
  cryHelperProgressDotTamamlandi: { backgroundColor: '#9d8cef' },
  cryHelperProgressDotAktif:  { backgroundColor: 'white', width: 20 },
  cryHelperSoruNo:            { color: 'rgba(157,140,239,0.8)', fontSize: 12, fontWeight: '600', textAlign: 'center' },
  cryHelperSoruMetin:         { color: 'white', fontSize: 16, fontWeight: 'bold', textAlign: 'center', lineHeight: 22 },
  cryHelperSecenekBtn:        { backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', alignItems: 'flex-start' },
  cryHelperSecenekYazi:       { color: 'white', fontSize: 14, lineHeight: 20 },
  cryHelperSonucBaslik:       { color: '#b8a8f8', fontSize: 14, fontWeight: 'bold', textAlign: 'center' },
  cryHelperSonucItem:         { backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 12, padding: 12, gap: 4 },
  cryHelperSonucItem1:        { backgroundColor: 'rgba(157,140,239,0.18)', borderColor: 'rgba(157,140,239,0.4)', borderWidth: 1 },
  cryHelperSonucKategori:     { color: 'rgba(255,255,255,0.7)', fontSize: 14, fontWeight: 'bold' },
  cryHelperSonucKategori1:    { color: '#b8a8f8', fontSize: 15 },
  cryHelperSonucOneri:        { color: 'rgba(255,255,255,0.55)', fontSize: 13, lineHeight: 18 },
  cryHelperSesBtn:            { backgroundColor: 'rgba(157,140,239,0.2)', borderRadius: 12, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(157,140,239,0.35)' },
  cryHelperSesBtnKolik:       { backgroundColor: 'rgba(74,222,128,0.12)', borderColor: 'rgba(74,222,128,0.3)' },
  cryHelperSesBtnYazi:        { color: 'white', fontSize: 14, fontWeight: '600' },
  cryHelperTekrarBtn:         { backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 12, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  cryHelperTekrarBtnYazi:     { color: 'rgba(255,255,255,0.55)', fontSize: 13 },
  yasSecici:              { flexDirection: 'row', gap: 8, marginBottom: 12, flexWrap: 'wrap' },
  yasBtn:                 { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  yasBtnAktif:            { backgroundColor: 'rgba(157,140,239,0.2)', borderColor: '#9d8cef' },
  yasBtnYazi:             { color: 'rgba(255,255,255,0.5)', fontSize: 13 },
  yasBtnYaziAktif:        { color: '#b8a8f8', fontWeight: 'bold' },
  ipucuKart:              { backgroundColor: 'rgba(157,140,239,0.08)', borderRadius: 14, padding: 16, borderWidth: 1, borderColor: 'rgba(157,140,239,0.15)', marginBottom: 8 },
  ipucuYazi:              { color: 'rgba(255,255,255,0.7)', fontSize: 13, lineHeight: 22 },
  modalArkaPlan:          { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'flex-end' },
  modalKutu:              { backgroundColor: '#0f1e33', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24 },
  modalKol:               { width: 40, height: 4, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 2, marginBottom: 20, alignSelf: 'center' },
  modalBaslik:            { color: 'white', fontSize: 20, fontWeight: 'bold', marginBottom: 4 },
  modalAltBaslik:         { color: 'rgba(255,255,255,0.5)', fontSize: 12, marginBottom: 20 },
  sesBtn:                 { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 14, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  sesBtnSecili:           { backgroundColor: 'rgba(157,140,239,0.2)', borderColor: '#9d8cef' },
  sesBtnAnne:             { backgroundColor: 'rgba(157,140,239,0.08)', borderColor: 'rgba(157,140,239,0.3)' },
  sesIkon:                { fontSize: 26 },
  sesAdi:                 { color: 'white', fontSize: 15, fontWeight: 'bold', flex: 1 },
  sesTik:                 { color: '#9d8cef', fontSize: 20, fontWeight: 'bold' },
  raporModalArkaPlan:     { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)' },
  raporModalKutu:         { backgroundColor: '#0f1e33', borderRadius: 24, padding: 24 },
  raporModalBaslik:       { color: 'white', fontSize: 22, fontWeight: 'bold', marginBottom: 4, textAlign: 'center' },
  raporModalTarih:        { color: '#b8a8f8', fontSize: 14, marginBottom: 20, textAlign: 'center' },
  raporModalBtn:          { backgroundColor: '#9d8cef', borderRadius: 14, padding: 16, width: '100%', alignItems: 'center' },
  raporModalBtnYazi:      { color: 'white', fontSize: 15, fontWeight: 'bold' },
  basitRaporKutu:         { backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', gap: 4 },
  basitRaporSatir:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10 },
  basitRaporEtiket:       { color: 'rgba(255,255,255,0.6)', fontSize: 14 },
  basitRaporDeger:        { color: 'white', fontSize: 15, fontWeight: 'bold' },
  basitRaporAyrac:        { height: 1, backgroundColor: 'rgba(255,255,255,0.06)' },
  detayKilitKutu:         { backgroundColor: 'rgba(157,140,239,0.08)', borderRadius: 12, padding: 16, borderWidth: 1, borderColor: 'rgba(157,140,239,0.2)', alignItems: 'center', gap: 6 },
  detayKilitYazi:         { color: 'rgba(255,255,255,0.5)', fontSize: 13, textAlign: 'center' },
  detayKilitAlt:          { color: 'rgba(255,255,255,0.35)', fontSize: 11, marginTop: 4, textAlign: 'center' },
  detayKilitBtn:          { color: '#9d8cef', fontSize: 14, fontWeight: '700', marginTop: 8 },
  puanDetayKutu:          { backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 12, padding: 12, marginTop: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)', gap: 8 },
  puanDetaySatir:         { flexDirection: 'row', alignItems: 'center', gap: 8 },
  puanDetayIkon:          { fontSize: 14, width: 20 },
  puanDetayYazi:          { color: 'rgba(255,255,255,0.6)', fontSize: 12, flex: 1 },
  puanDetayPuan:          { fontSize: 12, fontWeight: 'bold', width: 30, textAlign: 'right' },
  puanDetayBaslik:        { color: 'white', fontSize: 14, fontWeight: 'bold', marginBottom: 8 },
  skorDaireKutu:          { alignItems: 'center', marginVertical: 16 },
  skorDaire:              { width: 120, height: 120, borderRadius: 60, borderWidth: 4, alignItems: 'center', justifyContent: 'center' },
  skorDaireSayi:          { fontSize: 40, fontWeight: 'bold' },
  skorDaireEtiket:        { fontSize: 14, fontWeight: '600', marginTop: 2 },
  progressBg:             { height: 8, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 4, overflow: 'hidden', marginBottom: 6 },
  progressFill:           { height: 8, borderRadius: 4 },
  progressYazi:           { fontSize: 13, fontWeight: '600', textAlign: 'center', marginBottom: 16 },
  gridRow:                { flexDirection: 'row', gap: 10, marginBottom: 10 },
  gridKart:               { flex: 1, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 14, padding: 14, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  gridDeger:              { color: 'white', fontSize: 15, fontWeight: 'bold', textAlign: 'center' },
  gridEtiket:             { color: 'rgba(255,255,255,0.45)', fontSize: 11, marginTop: 4, textAlign: 'center' },
  analizYorumKutu:        { backgroundColor: 'rgba(157,140,239,0.08)', borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: 'rgba(157,140,239,0.15)' },
  analizYorumBaslik:      { color: '#b8a8f8', fontSize: 14, fontWeight: 'bold', marginBottom: 6 },
  analizYorumYazi:        { color: 'rgba(255,255,255,0.6)', fontSize: 13, lineHeight: 20 },
  karsilastirmaKutu:      { backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', gap: 10 },
  karsilastirmaBaslik:    { color: '#b8a8f8', fontSize: 14, fontWeight: 'bold', marginBottom: 4 },
  karsilastirmaSatir:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  karsilastirmaEtiket:    { color: 'rgba(255,255,255,0.5)', fontSize: 13 },
  karsilastirmaDeger:     { fontSize: 13, fontWeight: '600' },
  detayModalArkaPlan:     { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'flex-end' },
  detayModalKutu:         { backgroundColor: '#0f1e33', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, height: '92%' },
  premiumKilit:           { color: '#b8a8f8', fontSize: 10, fontWeight: 'bold' },

  // ── YENİ ÖZELLIK STİLLERİ ───────────────────────────────────────────────────

  // Gelişim sıçraması
  gelisimKart:            { backgroundColor: 'rgba(245,166,35,0.12)', borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: 'rgba(245,166,35,0.4)', gap: 6 },
  gelisimBaslik:          { color: '#F5A623', fontSize: 16, fontWeight: 'bold' },
  gelisimAcik:            { color: 'rgba(255,255,255,0.75)', fontSize: 13, lineHeight: 20 },
  gelisimAlt:             { color: 'rgba(245,166,35,0.7)', fontSize: 12, fontStyle: 'italic' },

  // Ses öğrenme
  sesOgrenmeKart:         { backgroundColor: 'rgba(157,140,239,0.1)', borderRadius: 14, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: 'rgba(157,140,239,0.25)', gap: 4 },
  sesOgrenmeBaslik:       { color: '#b8a8f8', fontSize: 14, fontWeight: 'bold' },
  sesOgrenmeOneri:        { color: 'rgba(255,255,255,0.7)', fontSize: 13 },

  // Yaşa göre karşılaştırma
  yasaGoreKart:           { backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', gap: 8 },
  yasaGoreBaslik:         { color: 'white', fontSize: 15, fontWeight: 'bold' },
  yasaGoreSatir:          { color: 'rgba(255,255,255,0.6)', fontSize: 13 },
  yasaGoreMesaj:          { color: '#4ade80', fontSize: 13, fontWeight: '600' },
  premiumKilitGenelYazi:  { color: 'rgba(255,255,255,0.45)', fontSize: 13 },
  premiumKilitGenelBtn:   { color: '#9d8cef', fontSize: 13, fontWeight: '700', marginTop: 4 },

  // Timeline (rapor modal içi)
  timelineKutu:           { backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 14, padding: 14, marginTop: 10, marginBottom: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)', gap: 8 },
  timelineBaslik:         { color: '#b8a8f8', fontSize: 14, fontWeight: 'bold' },
  timelineBar:            { height: 40, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 8, overflow: 'hidden' },
  timelineUyku:           { height: 40, backgroundColor: '#7F77DD', borderRadius: 8 },
  timelineEtiketler:      { flexDirection: 'row', justifyContent: 'space-between' },
  timelineEtiket:         { color: 'rgba(255,255,255,0.35)', fontSize: 10 },
  timelineLegend:         { flexDirection: 'row', gap: 12, marginTop: 4 },
  timelineLegendRow:      { flexDirection: 'row', alignItems: 'center', gap: 4 },
  timelineDot:            { width: 8, height: 8, borderRadius: 4 },
  timelineLegendYazi:     { color: 'rgba(255,255,255,0.45)', fontSize: 10 },

  // Haftalık trend (rapor modal içi)
  haftalikTrendKutu:      { backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)', gap: 10 },
  haftalikTrendBaslik:    { color: '#b8a8f8', fontSize: 14, fontWeight: 'bold', marginBottom: 4 },

  // Düzen analizi (rapor modal içi)
  duzenAnaliziKutu:       { backgroundColor: 'rgba(74,222,128,0.06)', borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: 'rgba(74,222,128,0.2)', gap: 6 },
  duzenAnaliziBaslik:     { color: '#4ade80', fontSize: 14, fontWeight: 'bold' },
  duzenAnaliziMetin:      { color: 'rgba(255,255,255,0.7)', fontSize: 13, lineHeight: 20 },
  duzenAnaliziNot:        { color: 'rgba(255,255,255,0.4)', fontSize: 11, fontStyle: 'italic' },

  // Uyku hafızası (rapor modal içi)
  uykuHafizasiKutu:       { backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)', gap: 6 },
  uykuHafizasiBaslik:     { color: '#b8a8f8', fontSize: 14, fontWeight: 'bold' },
  uykuHafizasiVardi:      { color: 'rgba(255,255,255,0.6)', fontSize: 13 },
  uykuHafizasiKarsi:      { fontSize: 13, fontWeight: '600' },

  // Ebeveyn notu (rapor modal içi)
  buGeceIcinKutu:         { backgroundColor: 'rgba(157,140,239,0.1)', borderRadius: 14, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: 'rgba(157,140,239,0.25)', alignItems: 'center', gap: 8 },
  buGeceIcinBaslik:       { color: '#b8a8f8', fontSize: 14, fontWeight: 'bold' },
  buGeceIcinMesaj:        { color: 'rgba(255,255,255,0.8)', fontSize: 14, lineHeight: 22, textAlign: 'center' },
});
