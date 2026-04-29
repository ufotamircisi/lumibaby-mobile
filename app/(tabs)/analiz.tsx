// ⚠️ Bu dosyada direkt Audio.Sound KULLANILMAZ — playback için audioManager, kayıt için Audio.Recording kullanılır.
import AdBanner from '@/components/AdBanner';
import Paywall from '@/components/Paywall';
import { useLang } from '@/hooks/useLang';
import { usePremium } from '@/hooks/usePremium';
import { showInterstitialIfReady, showRewarded } from '@/services/adMob';
import * as audioManager from '@/services/audioManager';
import { dismissFgNotification, showFgNotification } from '@/services/foregroundService';
import { CONFIDENCE_THRESHOLD, CryDetectionEngine, WAV_RECORDING_OPTIONS, type SensitivityLevel } from '@/services/cryDetectionEngine';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Audio } from 'expo-av';
import * as Notifications from 'expo-notifications';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { Alert, Animated, AppState, Modal, PanResponder, ScrollView, StyleSheet, Text, TouchableOpacity, Vibration, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { sendAlertToAll } from './_layout';
import { hesaplaSleepScore, type PuanDetayItem, type SleepScoreInput } from '@/utils/sleepScore';
import {
  canStartDetector, markDetectorSessionStart, markDetectorSessionEnd,
  loadDetectorState, detectorKalanSaniye, isDetectorSessionActive,
  canUseAnalysis, markAnalysisUsed,
  isItemPremium, canViewDetailedReport,
} from '@/utils/permissions';

// ── STORAGE KEYS ─────────────────────────────────────────────────────────────
const SES_OGRENME_KEY          = 'lumibaby_ses_ogrenme';
const GECE_RAPORLARI_KEY       = 'lumibaby_gece_raporlari';
const WAKE_WINDOW_BILDIRIM_KEY = 'lumibaby_wake_window_bildirim';
const SLEEP_START_KEY          = 'lumibaby_sleep_start';
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
  uykuKalitesi: number; puanDetay: PuanDetayItem[];
  // yeni alanlar (eski kayıtlarda bulunmayabilir)
  yorumEmoji?: string;
  yorumMesaj?: string;
  ozetCumle?: string;
  buGeceIcin?: string;
  enBuyukEtki?: { baslik: string; penalty?: number; potansiyelKazanc: number } | null;
  aksiyonlar?: string[];
};

const BAR_MAX_HEIGHT = 160;
const HASSASIYET_KEY  = 'lumibaby_hassasiyet';
type DedektorTip = 'aglama' | 'kolik';

function kaliteRenk(puan: number): string {
  if (puan >= 85) return '#4ade80';
  if (puan >= 70) return '#facc15';
  if (puan >= 50) return '#fb923c';
  return '#f87171';
}

function skorRenk(puan: number): string {
  if (puan >= 85) return '#4CAF50';
  if (puan >= 70) return '#8BC34A';
  if (puan >= 50) return '#FFC107';
  if (puan >= 30) return '#FF9800';
  return '#F44336';
}

function skorGradient(puan: number | null): [string, string] {
  if (puan === null) return ['#2a2a4a', '#2a2a4a'];
  if (puan >= 85) return ['#22c55e', '#16a34a'];
  if (puan >= 70) return ['#86efac', '#4ade80'];
  if (puan >= 50) return ['#fb923c', '#f97316'];
  return ['#f87171', '#ef4444'];
}

function barRenk(puan: number): string {
  if (puan >= 85) return '#237804';
  if (puan >= 70) return '#73D13D';
  if (puan >= 50) return '#FFC53D';
  return '#FF4D4F';
}

function _isGunduzRapor(r: GeceRaporu): boolean {
  const h = new Date(r.baslangic).getHours();
  return h >= 5 && h < 18 && r.toplamUyku / 3600 <= 3;
}

function son7GunHazirla(raporlar: GeceRaporu[], gunIsimleri: string[]) {
  const bugun = new Date();
  const gunler = [];
  for (let i = 6; i >= 0; i--) {
    const gun = new Date(bugun);
    gun.setDate(bugun.getDate() - i);
    const gunBaslangic = new Date(gun.getFullYear(), gun.getMonth(), gun.getDate()).getTime();
    const gunBitis = gunBaslangic + 86400000;
    const raporlarGun = raporlar.filter(r => r.baslangic >= gunBaslangic && r.baslangic < gunBitis);
    const gunduz = raporlarGun.find(r => _isGunduzRapor(r));
    const gece = raporlarGun.find(r => !_isGunduzRapor(r));
    let puan: number | null = null;
    let etiket: 'G+N' | 'G' | 'N' | null = null;
    if (gunduz && gece) {
      puan = Math.round((gunduz.uykuKalitesi + gece.uykuKalitesi) / 2);
      etiket = 'G+N';
    } else if (gunduz) {
      puan = gunduz.uykuKalitesi;
      etiket = 'G';
    } else if (gece) {
      puan = gece.uykuKalitesi;
      etiket = 'N';
    }
    gunler.push({ gun: gunIsimleri[gun.getDay()], tarih: gun.getDate(), puan, etiket, bugun: i === 0 });
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
  const { isTrial, canAccessPremium, premiumAktifEt } = usePremium();
  const router = useRouter();
  const { lang, t } = useLang();
  const free = !canAccessPremium;

  const [paywallVisible, setPaywallVisible] = useState(false);
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
  const [detAdUsed, setDetAdUsed]           = useState(false);
  const [detFreeUsed, setDetFreeUsed]       = useState(false);
  const [sureDolduVisible, setSureDolduVisible] = useState(false);
  const [analizDolduVisible, setAnalizDolduVisible] = useState(false);
  const [analizAdUsed, setAnalizAdUsed]     = useState(false);
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
  const [gecmisThumbH, setGecmisThumbH]           = useState(40);
  // Yeni özellikler
  const [sesOgrenmeKayitlar, setSesOgrenmeKayitlar] = useState<SesOgrenmeKayit[]>([]);
  const sesCalmaBaslangicRef = useRef<number>(0);
  const scrollRef           = useRef<ScrollView>(null);
  const gecmisOffsetRef     = useRef<number>(0);
  const grafikOffsetRef     = useRef<number>(0);
  const bildirimIdRef           = useRef<string | null>(null);
  const wakeWindowNotifIdRef    = useRef<string | null>(null);
  const gecmisScrollRef     = useRef<ScrollView>(null);
  const gecmisThumbAnim     = useRef(new Animated.Value(0)).current;
  const barAnimValues       = useRef(Array.from({ length: 7 }, () => new Animated.Value(0))).current;
  const gecmisContentH      = useRef(0);
  const gecmisContainerH    = useRef(0);
  const gecmisPanStartThumb = useRef(0);
  const gecmisPanResponder  = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder:  () => true,
      onPanResponderGrant: () => {
        gecmisPanStartThumb.current = (gecmisThumbAnim as any)._value ?? 0;
      },
      onPanResponderMove: (_, gs) => {
        const c = gecmisContainerH.current;
        const h = gecmisContentH.current;
        if (h <= c) return;
        const thumbH = Math.max(40, (c / h) * c);
        const maxT   = c - thumbH;
        const newY   = Math.max(0, Math.min(maxT, gecmisPanStartThumb.current + gs.dy));
        gecmisThumbAnim.setValue(newY);
        if (maxT > 0) gecmisScrollRef.current?.scrollTo({ y: (newY / maxT) * (h - c), animated: false });
      },
    })
  ).current;
  const { height: screenHeight, width: screenWidth } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const tlBarW = screenWidth - 116; // ScrollView pad 40 + modal pad 48 + kutu pad 28

  const timerRef           = useRef<ReturnType<typeof setInterval> | null>(null);
  const detektorTimerRef   = useRef<ReturnType<typeof setInterval> | null>(null);
  const detSessionStartRef = useRef<number | null>(null);
  const detektorKritikRef  = useRef(false);
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

  // hassasiyet state değişince ref + engine'i güncelle
  useEffect(() => {
    hassasiyetRef.current = hassasiyet;
    cryEngineRef.current.configure(hassasiyet);
  }, [hassasiyet]);

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
    AsyncStorage.getItem('anne_ninni_kayit').then(v => { if (v) { try { setAnneNinniUri(JSON.parse(v).uri); } catch (e) { console.warn('anne_ninni_kayit parse hatası:', e); } } });
    AsyncStorage.getItem('anne_pispis_kayit').then(v => { if (v) { try { setAnnePisPisUri(JSON.parse(v).uri); } catch (e) { console.warn('anne_pispis_kayit parse hatası:', e); } } });
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
        cryEngineRef.current.configure(v);
      }
    });
    cryEngineRef.current.loadPatterns().catch(() => {});
    AsyncStorage.getItem(GECE_RAPORLARI_KEY).then(v => {
      if (v) {
        try {
          const parsed: GeceRaporu[] = JSON.parse(v);
          const temiz = parsed.filter(r =>
            r.baslangic > 1000000000000 &&
            r.bitis > r.baslangic &&
            r.toplamUyku > 0 &&
            r.toplamUyku <= 86400,
          );
          setGeceRaporlari(temiz);
          if (temiz.length !== parsed.length) {
            AsyncStorage.setItem(GECE_RAPORLARI_KEY, JSON.stringify(temiz)).catch(() => {});
          }
        } catch {}
      }
    });
    // Uygulama öldürülüp yeniden açılırsa devam eden uykuyu geri yükle
    AsyncStorage.getItem(SLEEP_START_KEY).then(v => {
      if (!v) return;
      const savedStart = parseInt(v, 10);
      const now = Date.now();
      // Geçersiz: NaN, sıfır veya negatif, gelecekte, ya da 24 saatten eski
      if (isNaN(savedStart) || savedStart <= 0 || savedStart > now || now - savedStart > 86_400_000) {
        AsyncStorage.removeItem(SLEEP_START_KEY).catch(() => {});
        return;
      }
      geceBaslangicRef.current = savedStart;
      setUyuyorMu(true);
      setSure(Math.min(Math.floor((now - savedStart) / 1000), 24 * 3600));
      timerRef.current = setInterval(() => {
        const elapsed = Date.now() - geceBaslangicRef.current;
        setSure(Math.min(Math.floor(elapsed / 1000), 24 * 3600));
      }, 1000);
    });

    // Dedektör günlük limit durumunu yükle; aktif oturum varsa sayacı geri yükle
    loadDetectorState().then(state => {
      if (state.freeUsed) setDetFreeUsed(true);
      if (state.adUsed) setDetAdUsed(true);
      if (isDetectorSessionActive(state)) {
        setDetektorSure(detectorKalanSaniye(state));
        bashlatDetektorTimer(state.sessionStart!);
      }
    }).catch(() => {});
  }, []);

  // AppState: arka plandan geri dönünce sayaçları hemen güncelle
  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      if (nextState !== 'active') return;
      if (geceBaslangicRef.current > 0) {
        setSure(Math.min(Math.floor((Date.now() - geceBaslangicRef.current) / 1000), 24 * 3600));
      }
      if (detSessionStartRef.current) {
        setDetektorSure(detectorKalanSaniye({ sessionStart: detSessionStartRef.current }));
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
  // 06:00–19:59 → gündüz (nap); 20:00–05:59 → gece.
  // 5 saatten uzun "gündüz" kaydı otomatik gece olarak sınıflandırılır.
  // 05:00–18:59 → gündüz (05:00-06:59 erken sabah dahil)
  // 03:00–04:59 ve 19:00–02:59 → gece (exploit koruması scoring'de)
  const raporGunduMu = useCallback((baslangic: number, _toplamUyku = 0) => {
    const saat = new Date(baslangic).getHours();
    return saat >= 5 && saat < 19;
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
    return 'yetersiz';
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


  const kaydiDurdur = async () => {
    if (pollIntervalRef.current) { clearTimeout(pollIntervalRef.current as unknown as ReturnType<typeof setTimeout>); pollIntervalRef.current = null; }
    if (recordingRef.current) { try { await recordingRef.current.stopAndUnloadAsync(); } catch (_) {} recordingRef.current = null; }
  };
  const probeTimerTemizle = () => { if (probeTimerRef.current) { clearTimeout(probeTimerRef.current); probeTimerRef.current = null; } };
  const herSeyiDurdur = async () => {
    dinlemeRef.current = false; caliyorRef.current = false;
    if (timerRef.current) clearInterval(timerRef.current);
    if (detektorTimerRef.current) { clearInterval(detektorTimerRef.current); detektorTimerRef.current = null; }
    if (cooldownTimerRef.current) { clearInterval(cooldownTimerRef.current); cooldownTimerRef.current = null; }
    probeTimerTemizle();
    await kaydiDurdur();
    if (audioManager.getState().tab === 'analiz') await audioManager.stop();
    cryEngineRef.current.reset();
    setConfidenceScore(0);
    setCooldownKalan(0);
    AsyncStorage.removeItem(SLEEP_START_KEY).catch(() => {});
    dismissFgNotification().catch(() => {});
  };

  const bashlatDetektorTimer = (sessionStart: number) => {
    if (detektorTimerRef.current) { clearInterval(detektorTimerRef.current); detektorTimerRef.current = null; }
    detSessionStartRef.current = sessionStart;
    detektorKritikRef.current = false;
    const tick = () => {
      const kalan = detectorKalanSaniye({ sessionStart });
      setDetektorSure(kalan);
      if (kalan > 0 && kalan <= 600 && !detektorKritikRef.current) {
        detektorKritikRef.current = true;
        Vibration.vibrate([0, 200, 100, 200]);
      }
      if (kalan <= 0) {
        if (detektorTimerRef.current) clearInterval(detektorTimerRef.current);
        detektorTimerRef.current = null;
        detSessionStartRef.current = null;
        markDetectorSessionEnd().catch(() => {});
        herSeyiDurdur();
        setSeciliDetektor(null);
        setSureDolduVisible(true);
      }
    };
    tick();
    detektorTimerRef.current = setInterval(tick, 500);
  };

  const handleDetektorReklam = async () => {
    const adResult = await showRewarded();
    if (adResult === 'unavailable') {
      Alert.alert(lang === 'en' ? 'Ad unavailable, please try again' : 'Reklam şu an yüklenemedi, lütfen tekrar deneyin');
      return;
    }
    if (adResult !== 'earned') return;
    const sessionStart = await markDetectorSessionStart();
    setDetAdUsed(true);
    setSureDolduVisible(false);
    bashlatDetektorTimer(sessionStart);
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

  const handleAnalizReklam = async () => {
    const adResult = await showRewarded();
    if (adResult === 'unavailable') {
      Alert.alert(lang === 'en' ? 'Ad unavailable, please try again' : 'Reklam şu an yüklenemedi, lütfen tekrar deneyin');
      return;
    }
    if (adResult !== 'earned') return;
    await markAnalysisUsed();
    setAnalizDolduVisible(false);
    setCryCevaplar([]); setCrySonuc([]); setCryHelperAdim('soru');
  };

  const cryHelperBaslat = useCallback(async () => {
    const result = await canUseAnalysis(canAccessPremium);
    if (result === 'need_ad') {
      setAnalizAdUsed(false);
      setAnalizDolduVisible(true);
      return;
    }
    if (result === 'denied') {
      setAnalizAdUsed(true);
      setAnalizDolduVisible(true);
      return;
    }
    await markAnalysisUsed();
    setCryCevaplar([]); setCrySonuc([]); setCryHelperAdim('soru');
  }, [canAccessPremium]);

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

  const bebekUyudu = async () => {
    // canManualTrack() → her zaman true; premium kontrolü yok
    // Önceki uyanma penceresi bildirimi varsa iptal et (bebek tekrar uyudu)
    if (wakeWindowNotifIdRef.current) {
      await Notifications.cancelScheduledNotificationAsync(wakeWindowNotifIdRef.current).catch(() => {});
      wakeWindowNotifIdRef.current = null;
    }
    const yeniKayit: UykuKaydi = { id: Date.now(), baslangic: Date.now(), bitis: null };
    setAktifKayit(yeniKayit); aktifKayitRef.current = yeniKayit;
    setUyuyorMu(true); setSure(0); setDetektorSure(0);
    const simdi = Date.now();
    geceBaslangicRef.current = simdi; aglamaSayisiRef.current = 0; ilkAglamaZamaniRef.current = null; setAglamaSayisi(0);
    AsyncStorage.setItem(SLEEP_START_KEY, String(simdi)).catch(() => {});
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
      const canStart = await canStartDetector(false);
      if (canStart === 'need_ad') {
        setDetAdUsed(false);
        setSureDolduVisible(true);
        return;
      }
      if (canStart === 'denied') {
        setDetAdUsed(true);
        setSureDolduVisible(true);
        return;
      }
      // 'allowed' — aktif oturum varsa aynı sessionStart'ı kullan, yoksa yeni hak tüket
      const state = await loadDetectorState();
      let sessionStart: number;
      if (isDetectorSessionActive(state)) {
        sessionStart = state.sessionStart!;
      } else {
        sessionStart = await markDetectorSessionStart();
        setDetFreeUsed(true);
      }
      bashlatDetektorTimer(sessionStart);
    }
    const izin = await Audio.requestPermissionsAsync();
    if (!izin.granted) { alert(t.mikrofonIzni); return; }
    modalTipRef.current = tip; setModalTip(tip); setSesListeModal(true);
  };

  const sesSecildi = async (ses: SesTip) => {
    const tip = modalTipRef.current;
    if (!tip) { console.warn('sesSecildi: modalTipRef null'); return; }
    if (free && isItemPremium(ses)) {
      setSesListeModal(false);
      router.push('/paywall');
      return;
    }
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
    let kalRec: Audio.Recording | null = null;
    try {
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true, staysActiveInBackground: true, shouldDuckAndroid: false });
      const { recording } = await Audio.Recording.createAsync({ ...Audio.RecordingOptionsPresets.HIGH_QUALITY, isMeteringEnabled: true });
      kalRec = recording;
      const ornekler: number[] = [];
      const interval = setInterval(async () => {
        try { const st = await recording.getStatusAsync(); const db = (st as any).metering ?? -160; if (db > -160) { ornekler.push(db); cryEngineRef.current.lastDb = db; } } catch (_) {}
      }, 200);
      await new Promise(res => setTimeout(res, KALIBRASYON_SURE_MS));
      clearInterval(interval);
      await kalRec.stopAndUnloadAsync();
      kalRec = null;
      cryEngineRef.current.calibrate(ornekler);
      console.log('[CryEngine] Kalibrasyon bitti, ambientDb:', (cryEngineRef.current as any).ambientDb);
    } catch (_) {
      if (kalRec) { try { await kalRec.stopAndUnloadAsync(); } catch (__) {} }
      cryEngineRef.current.calibrate([-50]);
      console.log('[CryEngine] Kalibrasyon hata, ambientDb: -50');
    }
  };

  const dinlemeBaslat = async (_ses: SesTip) => {
    if (dinlemeRef.current) return;
    dinlemeRef.current = true; setDinleniyor(true);
    showFgNotification('detector', lang).catch(() => {});
    cryEngineRef.current.reset();
    await kalibrasyonYap();

    const engine = cryEngineRef.current;

    // YAMNet burst döngüsü: 975ms WAV kaydı → inferFromWav → eşik kontrolü → tekrar
    const burstLoop = async (): Promise<void> => {
      if (!dinlemeRef.current || caliyorRef.current) return;

      if (engine.isCoolingDown()) {
        setCooldownKalan(Math.ceil(engine.cooldownRemaining() / 1000));
        setConfidenceScore(0);
        pollIntervalRef.current = setTimeout(burstLoop, 500) as unknown as ReturnType<typeof setInterval>;
        return;
      }
      setCooldownKalan(0);

      let rec: Audio.Recording | null = null;
      try {
        await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true, staysActiveInBackground: true, shouldDuckAndroid: false });
        const { recording } = await Audio.Recording.createAsync(WAV_RECORDING_OPTIONS as any);
        rec = recording;
        recordingRef.current = rec;

        // Tam 975ms = 16000 × 0.975 = 15600 örnek
        await new Promise<void>(res => setTimeout(res, 975));

        if (!dinlemeRef.current) { await rec.stopAndUnloadAsync(); recordingRef.current = null; return; }

        await rec.stopAndUnloadAsync();
        const uri = rec.getURI();
        rec = null; recordingRef.current = null;

        if (uri) {
          // 0-24 → sessizlik / 25-59 → şüpheli / 60+ → kesin ağlama
          const yamnetScore = await engine.inferFromWav(uri);
          const finalScore  = yamnetScore > 0 ? yamnetScore : engine.getAmplitudeScore();
          setConfidenceScore(finalScore);

          if (finalScore >= engine.yamnetThreshold) {
            engine.triggerDetected();
            setConfidenceScore(0);
            const g = aktifSesRef.current;
            if (g) sesCaldir(g);
            return;
          }
        }
      } catch (e) {
        console.error('[YAMNet] burstLoop hatası:', e);
        if (rec) { try { await rec.stopAndUnloadAsync(); } catch (__) {} recordingRef.current = null; }
      }

      if (dinlemeRef.current && !caliyorRef.current) {
        pollIntervalRef.current = setTimeout(burstLoop, 50) as unknown as ReturnType<typeof setInterval>;
      }
    };

    try {
      burstLoop();
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
    if (geceBaslangicRef.current <= 0) return;
    if (bildirimIdRef.current) {
      await Notifications.cancelScheduledNotificationAsync(bildirimIdRef.current).catch(() => {});
      bildirimIdRef.current = null;
    }
    await markDetectorSessionEnd().catch(() => {});
    detSessionStartRef.current = null;
    await herSeyiDurdur();
    // Wake Window bildirimini OS seviyesinde planla (setTimeout Android'de arka planda çalışmaz)
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

        const { status: wakeStatus } = await Notifications.getPermissionsAsync();
        if (wakeStatus === 'granted') {
          const bugun = new Date().toDateString();
          const data  = await AsyncStorage.getItem(WAKE_WINDOW_BILDIRIM_KEY);
          const obj   = data ? JSON.parse(data) : {};
          const bugunSayisi = obj[bugun] || 0;
          if (bugunSayisi < 3) {
            const wakeId = await Notifications.scheduleNotificationAsync({
              content: {
                title: lang === 'en' ? '⏰ Wake Window' : '⏰ Uyanma Penceresi',
                body:  t.wakeWindowAcik(wakeWindowDk),
                sound: true,
              },
              trigger: {
                seconds: wakeWindowDk * 60,
                type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
                channelId: 'wake-window',
              },
            });
            wakeWindowNotifIdRef.current = wakeId;
            obj[bugun] = bugunSayisi + 1;
            await AsyncStorage.setItem(WAKE_WINDOW_BILDIRIM_KEY, JSON.stringify(obj));
          }
        }
      }
    } catch {}

    const bitis = Date.now(), baslangic = geceBaslangicRef.current;
    // Bozuk kayıt: başlangıç yok, gelecekte veya 24 saatten uzun
    if (baslangic <= 0 || baslangic > bitis || bitis - baslangic > 86_400_000) {
      AsyncStorage.removeItem(SLEEP_START_KEY).catch(() => {});
      aktifKayitRef.current = null; setAktifKayit(null); setUyuyorMu(false); setSure(0);
      geceBaslangicRef.current = 0;
      Alert.alert(
        lang === 'en' ? 'Invalid Record' : 'Geçersiz Kayıt',
        lang === 'en' ? 'Sleep record was corrupted and has been cleared.' : 'Uyku kaydı bozulmuş ve temizlendi.',
      );
      return;
    }
    const toplamUyku  = Math.max(0, Math.min(Math.floor((bitis - baslangic) / 1000), 24 * 3600));
    const uykulaDalma = ilkAglamaZamaniRef.current ? Math.max(120, Math.floor((ilkAglamaZamaniRef.current - baslangic) / 1000)) : Math.max(120, Math.floor(toplamUyku * 0.05));
    const enUzunUyku  = aglamaSayisiRef.current === 0 ? toplamUyku : Math.floor(toplamUyku / (aglamaSayisiRef.current + 1));
    const isGunduz    = raporGunduMu(baslangic, toplamUyku);
    const skorInput: SleepScoreInput = {
      toplamUyku, baslangicTs: baslangic, isGunduz,
      bebekHaftasi: bebekHaftasiHesapla(),
      aglamaSayisi: aglamaSayisiRef.current,
      lang,
    };
    const skorSonuc   = hesaplaSleepScore(skorInput);
    const tarihStr    = formatTarih(baslangic);
    const rapor: GeceRaporu = {
      id: Date.now(), tarih: tarihStr, toplamUyku,
      aglamaSayisi: aglamaSayisiRef.current,
      baslangic, bitis, uykulaDalma, enUzunUyku,
      uykuKalitesi: skorSonuc.toplam,
      puanDetay: skorSonuc.detaylar,
      yorumEmoji: skorSonuc.yorumEmoji,
      yorumMesaj: skorSonuc.yorumMesaj,
      ozetCumle:  skorSonuc.ozetCumle,
      buGeceIcin: skorSonuc.buGeceIcin,
      enBuyukEtki: skorSonuc.enBuyukEtki,
      aksiyonlar: skorSonuc.aksiyonlar,
    };
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
    if (!canViewDetailedReport(canAccessPremium)) { router.push('/paywall'); return; }
    setSeciliRapor(rapor); setDetayModal(true);
  };

  const haftalikGruplar  = haftayaGoreGrupla(geceRaporlari);
  const haftaAnahtarlari = Object.keys(haftalikGruplar);
  const son7Gun          = useMemo(() => son7GunHazirla(geceRaporlari, t.grafikGunler), [geceRaporlari, t.grafikGunler]);
  useEffect(() => {
    barAnimValues.forEach(v => v.setValue(0));
    Animated.parallel(
      son7Gun.map((g, i) => Animated.timing(barAnimValues[i], {
        toValue: g.puan !== null ? Math.max(4, (g.puan / 100) * BAR_MAX_HEIGHT) : 0,
        duration: 600,
        useNativeDriver: false,
      }))
    ).start();
  }, [son7Gun]);
  const son4Hafta        = Array.from({ length: 4 }, (_, i) => haftaKeyGetir(Date.now() - i * 7 * 24 * 3600 * 1000));
  const haftaEtiketleri  = lang === 'en'
    ? ['This Week', 'Last Week', '2 Weeks Ago', '3 Weeks Ago']
    : ['Bu Hafta', 'Geçen Hafta', '2 Hafta Önce', '3 Hafta Önce'];

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
            <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
              {free && (
                <TouchableOpacity
                  style={styles.premiumMiniRozet}
                  onPress={() => setPaywallVisible(true)}
                >
                  <Text style={{ fontSize: 12 }}>👑</Text>
                  <Text style={styles.premiumMiniRozetYazi}>{t.gecePremiumSinirsiz}</Text>
                </TouchableOpacity>
              )}
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
              {free && detektorSure > 0 && <Text style={[styles.sureBilgi, detektorSure <= 600 && styles.sureBilgiKritik]}>{t.kalanSure(formatSayac(detektorSure))}</Text>}
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
            {free && detektorSure === 0 && (
              <View style={styles.hakBilgi}>
                <Text style={styles.hakBilgiYazi}>{t.bugunDetektor(
                  (detFreeUsed ? 0 : 1) + (detAdUsed ? 0 : 1)
                )}</Text>
              </View>
            )}
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

        {/* GEÇMİŞ UYKULAR + 7 GÜNLÜK UYKU SKORU — alt alta, tam genişlik */}
        <View
          style={{ gap: 12, marginBottom: 16 }}
          onLayout={e => { gecmisOffsetRef.current = e.nativeEvent.layout.y; }}
        >
          {/* KART 1: Geçmiş Uykular — accordion, 4 hafta sabit */}
          <View style={[styles.tekliKart, { width: screenWidth - 32 }]}>
            <Text style={styles.tekliKartBaslik}>{t.gecmisGeceler}</Text>
            {free ? (
              <TouchableOpacity style={styles.kilitAlani} onPress={() => { router.push('/paywall'); }}>
                <Text style={styles.arsivKilitYazi}>{t.arsivKilit}</Text>
                <Text style={styles.arsivKilitAlt}>{t.arsivKilitAlt}</Text>
              </TouchableOpacity>
            ) : geceRaporlari.length === 0 ? (
              <View style={styles.bosKutu}>
                <Text style={styles.bosKutuIkon}>📊</Text>
                <Text style={styles.bosKutuYazi}>{t.bosRapor}</Text>
              </View>
            ) : (
              <View>
                {son4Hafta.map((hafta, i) => {
                  const raporlar = haftalikGruplar[hafta] ?? [];
                  const acik     = acikHafta === hafta;
                  return (
                    <View key={hafta} style={i > 0 ? { marginTop: 6 } : undefined}>
                      <TouchableOpacity
                        style={[styles.haftaHeaderRow, acik && styles.haftaHeaderRowAcik]}
                        onPress={() => setAcikHafta(acik ? null : hafta)}
                        activeOpacity={0.75}
                      >
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <Text style={styles.haftaHeaderEmoji}>📅</Text>
                          <Text style={styles.haftaHeaderYazi}>{haftaEtiketleri[i]}</Text>
                          {raporlar.length > 0 && (
                            <View style={styles.haftaSayisiBadge}>
                              <Text style={styles.haftaSayisiYazi}>{raporlar.length}</Text>
                            </View>
                          )}
                        </View>
                        <Text style={styles.haftaHeaderOk}>{acik ? '▲' : '▼'}</Text>
                      </TouchableOpacity>

                      {acik && (
                        raporlar.length === 0 ? (
                          <View style={styles.haftaBosAlan}>
                            <Text style={styles.haftaBosYazi}>{lang === 'en' ? 'No records this week' : 'Bu hafta kayıt yok'}</Text>
                          </View>
                        ) : (
                          <View style={[styles.accordionBody, { flexDirection: 'row' }]}>
                            <ScrollView
                              ref={gecmisScrollRef}
                              showsVerticalScrollIndicator={false}
                              style={{ flex: 1 }}
                              onContentSizeChange={(_, h) => {
                                gecmisContentH.current = h;
                                const c = gecmisContainerH.current;
                                if (c > 0) setGecmisThumbH(Math.max(36, h > c ? (c / h) * c : c));
                              }}
                              onLayout={(e) => {
                                gecmisContainerH.current = e.nativeEvent.layout.height;
                                const h = gecmisContentH.current;
                                const c = e.nativeEvent.layout.height;
                                setGecmisThumbH(Math.max(36, h > c ? (c / h) * c : c));
                              }}
                              onScroll={(e) => {
                                const c = gecmisContainerH.current;
                                const h = gecmisContentH.current;
                                if (h <= c) return;
                                const thumbH = Math.max(36, (c / h) * c);
                                const maxT   = c - thumbH;
                                gecmisThumbAnim.setValue(maxT > 0 ? (e.nativeEvent.contentOffset.y / (h - c)) * maxT : 0);
                              }}
                              scrollEventThrottle={16}
                            >
                              {raporlar.map((r) => (
                                <TouchableOpacity key={r.id} style={styles.accordionGeceRow} onPress={() => raporDetayAc(r)}>
                                  <View style={{ flex: 1 }}>
                                    <Text style={styles.accordionGeceTarih} numberOfLines={1}>{formatTarihGuzel(r.baslangic)}</Text>
                                    <Text style={styles.accordionGeceSaat} numberOfLines={1}>{formatSaat(r.baslangic) + ' › ' + formatSure(r.toplamUyku)}</Text>
                                  </View>
                                  <View style={[styles.puanDaire, { borderColor: kaliteRenk(r.uykuKalitesi), width: 36, height: 36, borderRadius: 18 }]}>
                                    <Text style={[styles.puanYazi, { color: kaliteRenk(r.uykuKalitesi), fontSize: 12 }]}>{r.uykuKalitesi}</Text>
                                  </View>
                                </TouchableOpacity>
                              ))}
                            </ScrollView>
                            <View style={styles.scrollTrack}>
                              <Animated.View
                                style={[styles.scrollThumb, { height: gecmisThumbH, transform: [{ translateY: gecmisThumbAnim }] }]}
                                {...gecmisPanResponder.panHandlers}
                              />
                            </View>
                          </View>
                        )
                      )}
                    </View>
                  );
                })}
              </View>
            )}
          </View>

          {/* KART 2: 7 Günlük Uyku Skoru */}
          <View
            style={[styles.tekliKart, { width: screenWidth - 32, padding: 20 }]}
            onLayout={e => { grafikOffsetRef.current = e.nativeEvent.layout.y; }}
          >
            {/* Header */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <Text style={{ color: 'white', fontSize: 16, fontWeight: 'bold' }}>{t.yedıGunGrafik}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <View style={{ backgroundColor: 'rgba(99,102,241,0.18)', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: 'rgba(99,102,241,0.35)' }}>
                  <Text style={{ color: '#a5b4fc', fontSize: 11, fontWeight: '600' }}>
                    {lang === 'tr' ? '🎯 Hedef: 70+' : '🎯 Goal: 70+'}
                  </Text>
                </View>
                <Text style={{ color: 'rgba(255,255,255,0.3)', fontSize: 14 }}>ℹ️</Text>
              </View>
            </View>

            {free ? (
              <TouchableOpacity style={styles.kilitAlani} onPress={() => { router.push('/paywall'); }}>
                <Text style={{ fontSize: 28 }}>📊</Text>
                <Text style={styles.premiumKilitYazi}>{t.grafikKilit}</Text>
                <Text style={styles.premiumKilitBtn}>{t.arsivKilitAlt}</Text>
              </TouchableOpacity>
            ) : (
              <>
                {/* Chart: Y-axis + bars */}
                <View style={{ flexDirection: 'row' }}>
                  {/* Y-axis labels — marginTop: 20 to align with bars area (skip score label row) */}
                  <View style={{ width: 26, marginTop: 20 }}>
                    <View style={{ height: BAR_MAX_HEIGHT, position: 'relative' }}>
                      {[100, 85, 70, 50, 30, 0].map(v => (
                        <Text
                          key={v}
                          style={{
                            position: 'absolute',
                            right: 2,
                            top: (1 - v / 100) * BAR_MAX_HEIGHT - 5,
                            fontSize: 9,
                            color: v === 70 ? 'rgba(99,102,241,0.8)' : 'rgba(255,255,255,0.28)',
                            fontWeight: v === 70 ? '700' : 'normal',
                          }}
                        >{v}</Text>
                      ))}
                    </View>
                  </View>

                  {/* Right: score labels + bars area */}
                  <View style={{ flex: 1 }}>
                    {/* Score labels above bars */}
                    <View style={{ flexDirection: 'row', height: 20 }}>
                      {son7Gun.map((g, i) => (
                        <View key={i} style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-end' }}>
                          {g.puan !== null && (
                            <Text style={{ fontSize: 10, fontWeight: 'bold', color: barRenk(g.puan) }}>
                              {g.puan}
                            </Text>
                          )}
                        </View>
                      ))}
                    </View>

                    {/* Bars area */}
                    <View style={{ height: BAR_MAX_HEIGHT, position: 'relative' }}>
                      {/* Dashed horizontal grid lines */}
                      {[100, 85, 50, 30].map(v => (
                        <View
                          key={v}
                          pointerEvents="none"
                          style={{
                            position: 'absolute', left: 0, right: 0,
                            bottom: (v / 100) * BAR_MAX_HEIGHT,
                            height: 0,
                            borderTopWidth: 1,
                            borderTopColor: 'rgba(255,255,255,0.06)',
                            borderStyle: 'dashed',
                          }}
                        />
                      ))}

                      {/* Target line at 70 — dashed blue */}
                      <View
                        pointerEvents="none"
                        style={{
                          position: 'absolute', left: 0, right: 0,
                          bottom: (70 / 100) * BAR_MAX_HEIGHT,
                          height: 0,
                          borderTopWidth: 1,
                          borderTopColor: 'rgba(99,102,241,0.65)',
                          borderStyle: 'dashed',
                          zIndex: 2,
                        }}
                      />

                      {/* 70+ pill badge */}
                      <View
                        pointerEvents="none"
                        style={{
                          position: 'absolute',
                          right: 0,
                          bottom: (70 / 100) * BAR_MAX_HEIGHT + 3,
                          backgroundColor: '#4338ca',
                          borderRadius: 6,
                          paddingHorizontal: 5,
                          paddingVertical: 1,
                          zIndex: 3,
                        }}
                      >
                        <Text style={{ color: 'white', fontSize: 8, fontWeight: '700' }}>70+</Text>
                      </View>

                      {/* Bars */}
                      <View style={{ flexDirection: 'row', height: BAR_MAX_HEIGHT }}>
                        {son7Gun.map((g, i) => (
                          <View key={i} style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-end', height: BAR_MAX_HEIGHT }}>
                            {g.puan !== null ? (
                              <Animated.View style={[
                                {
                                  height: barAnimValues[i],
                                  width: '78%',
                                  borderTopLeftRadius: 8,
                                  borderTopRightRadius: 8,
                                  backgroundColor: barRenk(g.puan),
                                },
                                g.bugun
                                  ? { borderWidth: 1.5, borderColor: '#9d8cef' }
                                  : { opacity: 0.82 },
                              ]} />
                            ) : (
                              <View style={{
                                width: '78%',
                                height: 0,
                                borderTopWidth: 3,
                                borderTopColor: 'rgba(255,255,255,0.18)',
                                borderStyle: 'dashed',
                                marginBottom: 4,
                              }} />
                            )}
                          </View>
                        ))}
                      </View>
                    </View>
                  </View>
                </View>

                {/* X-axis labels */}
                <View style={{ flexDirection: 'row', marginTop: 6, marginLeft: 26 }}>
                  {son7Gun.map((g, i) => (
                    <View key={i} style={{ flex: 1, alignItems: 'center' }}>
                      <Text style={{
                        fontSize: 11,
                        color: g.bugun ? 'white' : 'rgba(255,255,255,0.45)',
                        fontWeight: g.bugun ? '700' : 'normal',
                      }}>{g.gun}</Text>
                      {g.bugun && (
                        <View style={{ height: 2.5, width: '55%', backgroundColor: '#9d8cef', borderRadius: 2, marginTop: 2, marginBottom: 1 }} />
                      )}
                      <Text style={{
                        fontSize: 10,
                        color: g.bugun ? '#a5b4fc' : 'rgba(255,255,255,0.28)',
                        fontWeight: g.bugun ? '600' : 'normal',
                      }}>{g.tarih}</Text>
                    </View>
                  ))}
                </View>

                {/* Legend */}
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 16 }}>
                  {[
                    { color: '#237804', label: t.grafikAciklama[0] },
                    { color: '#73D13D', label: t.grafikAciklama[1] },
                    { color: '#FFC53D', label: t.grafikAciklama[2] },
                    { color: '#FF4D4F', label: t.grafikAciklama[3] },
                  ].map((item, idx) => (
                    <View key={idx} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: item.color }} />
                      <Text style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)' }}>{item.label}</Text>
                    </View>
                  ))}
                </View>

                {/* Info text */}
                <Text style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', marginTop: 10, lineHeight: 15 }}>
                  {lang === 'tr'
                    ? 'ⓘ Uyku skoru; uyku süresi, düzeni, uyanma sıklığı ve kalite gibi faktörlere göre hesaplanır.'
                    : 'ⓘ Sleep score is calculated based on duration, consistency, wake frequency, and quality.'}
                </Text>
              </>
            )}
          </View>
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
              <TouchableOpacity onPress={() => { router.push('/paywall'); }}>
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
                const secili = modalTip === 'aglama' ? seciliNinni?.id === ses.id : seciliKolik?.id === ses.id;
                const kilitli = free && isItemPremium(ses);
                return (
                  <TouchableOpacity
                    key={ses.id}
                    style={[styles.sesBtn, secili && styles.sesBtnSecili, isItemPremium(ses) && styles.sesBtnAnne, kilitli && { opacity: 0.45 }]}
                    disabled={kilitli}
                    onPress={() => sesSecildi(ses)}
                  >
                    <Text style={styles.sesIkon}>{ses.icon}</Text>
                    <Text style={styles.sesAdi}>{ses.name}</Text>
                    {kilitli ? <Text style={styles.sesTik}>🔒</Text> : secili && <Text style={styles.sesTik}>✓</Text>}
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
                  {raporGunduMu(sonRapor.baslangic, sonRapor.toplamUyku) ? t.gunduzRaporuBaslik : t.geceRaporuTamBaslik}
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
                    <TouchableOpacity style={styles.detayKilitKutu} onPress={() => { setRaporModal(false); router.push('/paywall'); }}>
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
                      {(() => {
                        let minP = 0, enBuyukIdx = -1;
                        sonRapor.puanDetay.forEach((d, i) => { if (d.puan < minP) { minP = d.puan; enBuyukIdx = i; } });
                        return sonRapor.puanDetay.map((d, i) => (
                          <View key={i} style={styles.puanDetaySatir}>
                            <Text style={styles.puanDetayIkon}>{d.puan < 0 ? '⚠️' : '✅'}</Text>
                            <View style={{ flex: 1 }}>
                              <Text style={[styles.puanDetayYazi, { flex: 0 }]}>{d.baslik}</Text>
                              {i === enBuyukIdx && <Text style={styles.enBuyukEtiket}>{t.enBuyukEtki}</Text>}
                            </View>
                            <Text style={[styles.puanDetayPuan, { color: d.puan > 0 ? '#4ade80' : d.puan < 0 ? '#f87171' : 'rgba(255,255,255,0.4)' }]}>
                              {d.puan > 0 ? '+' + d.puan : '' + d.puan}
                            </Text>
                          </View>
                        ));
                      })()}
                    </View>
                    <View style={styles.analizYorumKutu}>
                      <Text style={styles.analizYorumBaslik}>{t.analizYorumBaslik}</Text>
                      <Text style={styles.analizYorumYazi}>{t.analizYorum(sonRapor.uykuKalitesi, sonRapor.toplamUyku, sonRapor.aglamaSayisi, sonRapor.puanDetay)}</Text>
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
                  {raporGunduMu(seciliRapor.baslangic, seciliRapor.toplamUyku) ? t.gunduzRaporuBaslik : t.geceRaporuTamBaslik}
                </Text>
                <Text style={styles.modalAltBaslik}>{formatTarihGuzel(seciliRapor.baslangic)}</Text>
                <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 20 }} showsVerticalScrollIndicator={false}>

                  {/* 1. Dinamik özet cümle */}
                  {seciliRapor.ozetCumle ? (
                    <View style={styles.yorumBanner}>
                      <Text style={styles.yorumBannerText}>{seciliRapor.ozetCumle}</Text>
                    </View>
                  ) : seciliRapor.yorumEmoji ? (
                    <View style={styles.yorumBanner}>
                      <Text style={styles.yorumBannerText}>{seciliRapor.yorumEmoji}  {seciliRapor.yorumMesaj}</Text>
                    </View>
                  ) : null}

                  {/* 2. Skor dairesi + yorum mesajı */}
                  <View style={styles.skorDaireKutu}>
                    <View style={[styles.skorDaire, { borderColor: kaliteRenk(seciliRapor.uykuKalitesi) }]}>
                      <Text style={[styles.skorDaireSayi, { color: kaliteRenk(seciliRapor.uykuKalitesi) }]}>{seciliRapor.uykuKalitesi}</Text>
                      <Text style={[styles.skorDaireEtiket, { color: kaliteRenk(seciliRapor.uykuKalitesi) }]}>{kaliteEtiket(seciliRapor.uykuKalitesi)}</Text>
                    </View>
                  </View>
                  <View style={styles.progressBg}>
                    <View style={[styles.progressFill, { width: (seciliRapor.uykuKalitesi + '%') as any, backgroundColor: kaliteRenk(seciliRapor.uykuKalitesi) }]} />
                  </View>
                  {seciliRapor.yorumMesaj ? (
                    <Text style={[styles.progressYazi, { color: kaliteRenk(seciliRapor.uykuKalitesi) }]}>
                      {seciliRapor.yorumEmoji}  {seciliRapor.yorumMesaj}
                    </Text>
                  ) : (
                    <Text style={[styles.progressYazi, { color: kaliteRenk(seciliRapor.uykuKalitesi) }]}>
                      {'%' + seciliRapor.uykuKalitesi + ' — ' + kaliteEtiket(seciliRapor.uykuKalitesi)}
                    </Text>
                  )}

                  {/* 3. En büyük etki kartı */}
                  {seciliRapor.enBuyukEtki ? (
                    <View style={styles.enBuyukEtkiKart}>
                      <Text style={styles.enBuyukEtkiKartBaslik}>
                        {lang === 'en' ? '✨ Biggest impact' : '✨ En büyük etki'}
                      </Text>
                      <Text style={styles.enBuyukEtkiKartMetin} numberOfLines={2}>{seciliRapor.enBuyukEtki.baslik}</Text>
                      <Text style={styles.enBuyukEtkiKartPuan}>
                        {lang === 'en'
                          ? `~+${seciliRapor.enBuyukEtki.potansiyelKazanc} pts potential gain`
                          : `~+${seciliRapor.enBuyukEtki.potansiyelKazanc} puan potansiyel kazanç`}
                      </Text>
                    </View>
                  ) : null}

                  {/* 4. İstatistik kartları */}
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

                  {/* 5. Puan detayı */}
                  <View style={styles.puanDetayKutu}>
                    <Text style={styles.puanDetayBaslik}>{t.puanDetayBaslik}</Text>
                    {seciliRapor.puanDetay.map((d, i) => (
                      <View key={i} style={styles.puanDetaySatir}>
                        <Text style={styles.puanDetayIkon}>{d.puan < 0 ? '⚠️' : d.puan > 0 ? '✅' : '•'}</Text>
                        <Text style={[styles.puanDetayYazi, { flex: 1 }]}>{d.baslik}</Text>
                        <Text style={[styles.puanDetayPuan, { color: d.puan > 0 ? '#4ade80' : d.puan < 0 ? '#f87171' : 'rgba(255,255,255,0.4)' }]}>
                          {d.puan !== 0 ? (d.puan > 0 ? '+' + d.puan : '' + d.puan) : '—'}
                        </Text>
                      </View>
                    ))}
                  </View>

                  {/* 6. Ne yapmalıyım? */}
                  {seciliRapor.aksiyonlar && seciliRapor.aksiyonlar.length > 0 ? (
                    <View style={styles.aksiyonlarKutu}>
                      <Text style={styles.aksiyonlarBaslik}>
                        {lang === 'en' ? '💡 What to do next?' : '💡 Ne yapmalıyım?'}
                      </Text>
                      {seciliRapor.aksiyonlar.map((a, i) => (
                        <Text key={i} style={styles.aksiyonMetin}>{a}</Text>
                      ))}
                    </View>
                  ) : null}

                  {/* 7. Bu gece için */}
                  {seciliRapor.buGeceIcin ? (
                    <View style={styles.buGeceIcinKutu}>
                      <Text style={styles.buGeceIcinBaslik}>
                        {lang === 'en' ? '🌙 Tonight' : '🌙 Bu gece için'}
                      </Text>
                      <Text style={styles.buGeceIcinMetin}>{seciliRapor.buGeceIcin}</Text>
                    </View>
                  ) : null}

                  {/* 8. Dedektör hatırlatıcısı */}
                  <View style={styles.detektorHatirlatici}>
                    <Text style={styles.detektorHatirlaticiMetin}>
                      {lang === 'en'
                        ? '🎙 Use the cry detector during sleep for more accurate scoring.'
                        : '🎙 Daha doğru puanlama için uyku sırasında ağlama dedektörünü kullanın.'}
                    </Text>
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
        baslik={t.paywallPremiumBaslik}
        aciklama={t.paywallPremiumAcik}
      />

      {/* DEDEKTÖR SÜRE DOLDU MODAL */}
      <Paywall
        visible={sureDolduVisible}
        onClose={() => setSureDolduVisible(false)}
        onPremium={() => { setSureDolduVisible(false); router.push('/paywall'); }}
        onReklam={!detAdUsed ? handleDetektorReklam : undefined}
        baslik={t.detSureDoldu}
        aciklama={!detAdUsed ? t.detReklamKazan : t.detGunlukBitti}
      />

      {/* ANALİZ LİMİT DOLDU MODAL */}
      <Paywall
        visible={analizDolduVisible}
        onClose={() => setAnalizDolduVisible(false)}
        onPremium={() => { setAnalizDolduVisible(false); router.push('/paywall'); }}
        onReklam={!analizAdUsed ? handleAnalizReklam : undefined}
        baslik={t.analizDolduBaslik}
        aciklama={!analizAdUsed ? t.analizReklamKazan : t.analizDolduAcik}
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
  sureBilgiKritik:        { color: '#ef4444', fontSize: 13 },
  confidenceRow:          { alignItems: 'center', gap: 4, width: '100%', paddingHorizontal: 8, marginTop: 4 },
  confidenceBarBg:        { width: '100%', height: 6, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 3, overflow: 'hidden' },
  confidenceBarFill:      { height: '100%', borderRadius: 3 },
  confidenceText:         { color: 'rgba(255,255,255,0.45)', fontSize: 11 },
  cooldownText:           { color: 'rgba(251,146,60,0.8)', fontSize: 12 },
  sleepBtn:               { backgroundColor: 'rgba(157,140,239,0.25)', paddingHorizontal: 28, paddingVertical: 14, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(157,140,239,0.4)', width: '100%', alignItems: 'center' },
  sleepBtnUyaniyor:       { backgroundColor: 'rgba(74,222,128,0.2)', borderColor: 'rgba(74,222,128,0.4)' },
  sleepBtnText:           { color: 'white', fontSize: 16, fontWeight: 'bold' },
  premiumMiniRozet:       { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(157,140,239,0.15)', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: 'rgba(157,140,239,0.3)' },
  premiumMiniRozetYazi:   { color: '#b8a8f8', fontSize: 11, fontWeight: '600' },
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
  enBuyukEtiket:          { color: '#f59e0b', fontSize: 10, fontWeight: 'bold', marginTop: 2 },
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

  // Tekli kart (Geçmiş Uykular + 7 Günlük Uyku Skoru — tam genişlik, alt alta)
  tekliKart:              { backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', overflow: 'hidden' },
  tekliKartBaslik:        { color: 'white', fontSize: 15, fontWeight: 'bold', marginBottom: 12 },
  kilitAlani:             { alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 20 },
  haftaHeaderRow:         { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11, borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)' },
  haftaHeaderRowAcik:     { backgroundColor: 'rgba(157,140,239,0.1)', borderColor: 'rgba(157,140,239,0.25)' },
  haftaHeaderEmoji:       { fontSize: 14 },
  haftaHeaderYazi:        { color: 'white', fontSize: 13, fontWeight: '600' },
  haftaHeaderOk:          { color: 'rgba(255,255,255,0.4)', fontSize: 12 },
  haftaSayisiBadge:       { backgroundColor: 'rgba(157,140,239,0.25)', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 1 },
  haftaSayisiYazi:        { color: '#b8a8f8', fontSize: 10, fontWeight: 'bold' },
  haftaBosAlan:           { paddingVertical: 12, paddingHorizontal: 4, alignItems: 'center' },
  haftaBosYazi:           { color: 'rgba(255,255,255,0.35)', fontSize: 12 },
  accordionBody:          { marginTop: 6, maxHeight: 220, borderRadius: 8, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.03)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  accordionGeceRow:       { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)', gap: 10 },
  accordionGeceTarih:     { color: 'white', fontSize: 13, fontWeight: '600' },
  accordionGeceSaat:      { color: 'rgba(255,255,255,0.45)', fontSize: 11, marginTop: 2 },
  scrollTrack:            { width: 8, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 4, marginLeft: 4, overflow: 'hidden' },
  scrollThumb:            { width: 8, backgroundColor: 'rgba(157,140,239,0.5)', borderRadius: 4 },
  // Artık kullanılmayan ama bırakılan eski stiller (hata vermez)
  ikiliKart:              { backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 16, padding: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', overflow: 'hidden' },
  ikiliKartBaslik:        { color: 'white', fontSize: 13, fontWeight: 'bold', marginBottom: 10 },
  ikiliGeceRow:           { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' },
  ikiliGeceTarih:         { color: 'white', fontSize: 12, fontWeight: '600' },
  ikiliGeceSure:          { color: 'rgba(255,255,255,0.5)', fontSize: 11, marginTop: 1 },
  ikiliPuanCizgi:         { width: 3, height: 12, borderRadius: 1.5 },
  ikiliPuanYazi:          { fontSize: 11, fontWeight: 'bold' },

  // ── YENİ RAPOR MODAL STİLLERİ ────────────────────────────────────────────────
  yorumBanner:            { backgroundColor: 'rgba(157,140,239,0.12)', borderRadius: 12, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: 'rgba(157,140,239,0.25)', alignItems: 'center' },
  yorumBannerText:        { color: 'white', fontSize: 15, fontWeight: '600', textAlign: 'center' },
  enBuyukEtkiKart:        { backgroundColor: 'rgba(245,166,35,0.1)', borderRadius: 12, padding: 12, marginBottom: 10, borderWidth: 1, borderColor: 'rgba(245,166,35,0.3)', gap: 4 },
  enBuyukEtkiKartBaslik:  { color: '#F5A623', fontSize: 12, fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 0.5 },
  enBuyukEtkiKartMetin:   { color: 'rgba(255,255,255,0.75)', fontSize: 13, lineHeight: 18 },
  enBuyukEtkiKartPuan:    { color: '#4ade80', fontSize: 12, fontWeight: '600' },
  aksiyonlarKutu:         { backgroundColor: 'rgba(74,222,128,0.06)', borderRadius: 12, padding: 12, marginTop: 8, borderWidth: 1, borderColor: 'rgba(74,222,128,0.15)', gap: 6 },
  aksiyonlarBaslik:       { color: '#4ade80', fontSize: 13, fontWeight: 'bold', marginBottom: 4 },
  aksiyonSatir:           { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  aksiyonOk:              { color: '#4ade80', fontSize: 13, fontWeight: 'bold', lineHeight: 20 },
  aksiyonMetin:           { color: 'rgba(255,255,255,0.75)', fontSize: 13, lineHeight: 20 },
  buGeceIcinKutu:         { backgroundColor: 'rgba(157,140,239,0.08)', borderRadius: 12, padding: 12, marginTop: 8, borderWidth: 1, borderColor: 'rgba(157,140,239,0.2)' },
  buGeceIcinBaslik:       { color: '#b8a8f8', fontSize: 13, fontWeight: 'bold', marginBottom: 6 },
  buGeceIcinMetin:        { color: 'rgba(255,255,255,0.7)', fontSize: 13, lineHeight: 20 },
  detektorHatirlatici:    { backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 10, padding: 10, marginTop: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  detektorHatirlaticiMetin: { color: 'rgba(255,255,255,0.35)', fontSize: 11, textAlign: 'center', lineHeight: 16 },
});
