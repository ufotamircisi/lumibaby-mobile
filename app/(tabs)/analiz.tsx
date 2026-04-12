import AdBanner from '@/components/AdBanner';
import Paywall from '@/components/Paywall';
import { useLang } from '@/hooks/useLang';
import { usePremium } from '@/hooks/usePremium';
import { showInterstitialIfReady } from '@/services/adMob';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Audio } from 'expo-av';
import * as Notifications from 'expo-notifications';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { sendAlertToAll } from './_layout';

const CLAUDE_API_KEY = process.env.EXPO_PUBLIC_CLAUDE_API_KEY;

type SesTip   = { id: number; name: string; icon: string; file: any; };
type UykuKaydi = { id: number; baslangic: number; bitis: number | null; };
type AnalizSonuc = { aclik: number; gaz: number; uyku: number; bez: number; diger: number; };
type GeceRaporu = {
  id: number; tarih: string; toplamUyku: number; aglamaSayisi: number;
  baslangic: number; bitis: number; uykulaDalma: number; enUzunUyku: number;
  uykuKalitesi: number; puanDetay: { baslik: string; puan: number; pozitif: boolean }[];
};

const BAR_MAX_HEIGHT    = 80;
const AGLAMA_ESIGI_DB   = -20;
const AGLAMA_COUNT_ESIGI = 5;
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

const sabitNinniListesi: SesTip[] = [
  { id: 1, name: 'Dandini Dastana',   icon: '⭐', file: require('../../assets/sounds/dandini_dastana_tr.mp3')          },
  { id: 2, name: 'Uyu Yavrum',        icon: '🌙', file: require('../../assets/sounds/uyu_yavrum_tr.mp3')               },
  { id: 3, name: 'Uyusun da Büyüsün', icon: '🌟', file: require('../../assets/sounds/uyusun_da_buyusun_ninni_tr.mp3')  },
  { id: 4, name: 'Müzik Kutusu',      icon: '🎵', file: require('../../assets/sounds/muzik_kutusu_tr.mp3')             },
];

const sabitKolikListesi: SesTip[] = [
  { id: 1, name: 'Beyaz Gürültü',        icon: '🔊', file: require('../../assets/sounds/whitenoise.mp3') },
  { id: 2, name: 'Yağmur Sesi',          icon: '🌧️', file: require('../../assets/sounds/rain.mp3')       },
  { id: 3, name: 'Saç Kurutma Makinesi', icon: '💨', file: require('../../assets/sounds/hairdryer.mp3')  },
  { id: 4, name: 'Fan Sesi',             icon: '🌬️', file: require('../../assets/sounds/ac.mp3')         },
];

export default function Analiz() {
  const { isPremium, isTrial, detektorHak, analizHak, detektorKullan, analizKullan, reklamIzleDetektor, reklamIzleAnaliz, premiumAktifEt } = usePremium();
  const { lang, t } = useLang();
  const free = !isPremium && !isTrial;

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
  const [analizYapiliyor, setAnalizYapiliyor] = useState(false);
  const [analizSonuc, setAnalizSonuc]       = useState<AnalizSonuc | null>(null);
  const [analizHata, setAnalizHata]         = useState<string | null>(null);
  const [kayitYapiliyor, setKayitYapiliyor] = useState(false);
  const [geriSayim, setGeriSayim]           = useState<number | null>(null);
  const [detektorSure, setDetektorSure]     = useState(0);
  const [dogumTarihi, setDogumTarihi]       = useState<string>('');
  const [rehberModal, setRehberModal]       = useState(false);
  const [nasılCalisirModal, setNasılCalisirModal] = useState(false);
  const scrollRef           = useRef<ScrollView>(null);
  const gecmisOffsetRef     = useRef<number>(0);
  const grafikOffsetRef     = useRef<number>(0);
  const bildirimIdRef       = useRef<string | null>(null);
  const aglamaEsigiRef      = useRef<number>(AGLAMA_ESIGI_DB);
  const { height: screenHeight } = useWindowDimensions();

  const timerRef           = useRef<ReturnType<typeof setInterval> | null>(null);
  const detektorTimerRef   = useRef<ReturnType<typeof setInterval> | null>(null);
  const soundRef           = useRef<Audio.Sound | null>(null);
  const dinlemeRef         = useRef(false);
  const caliyorRef         = useRef(false);
  const geceBaslangicRef   = useRef<number>(0);
  const aglamaSayisiRef    = useRef(0);
  const aktifSesRef        = useRef<SesTip | null>(null);
  const modalTipRef        = useRef<DedektorTip | null>(null);
  const aktifDedektorRef   = useRef<DedektorTip | null>(null);
  const ilkAglamaZamaniRef = useRef<number | null>(null);
  const aktifKayitRef      = useRef<UykuKaydi | null>(null);
  const geriSayimRef       = useRef<ReturnType<typeof setInterval> | null>(null);
  const aglamaCountRef     = useRef(0);
  const recordingRef       = useRef<Audio.Recording | null>(null);
  const analizRecordingRef = useRef<Audio.Recording | null>(null);
  const probeTimerRef      = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollIntervalRef    = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => { return () => { herSeyiDurdur(); }; }, []);

  useFocusEffect(useCallback(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, []));

  useEffect(() => {
    AsyncStorage.getItem('anne_ninni_kayit').then(v => { if (v) setAnneNinniUri(JSON.parse(v).uri); });
    AsyncStorage.getItem('anne_pispis_kayit').then(v => { if (v) setAnnePisPisUri(JSON.parse(v).uri); });
    AsyncStorage.getItem('bebek_adi').then(v => { if (v) setBebekAdi(v); });
    AsyncStorage.getItem('bebek_dogum_tarihi').then(v => { if (v) setDogumTarihi(v); });
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

  const kaydiDurdur = async () => {
    if (pollIntervalRef.current) { clearInterval(pollIntervalRef.current); pollIntervalRef.current = null; }
    if (recordingRef.current) { try { await recordingRef.current.stopAndUnloadAsync(); } catch (_) {} recordingRef.current = null; }
  };
  const probeTimerTemizle = () => { if (probeTimerRef.current) { clearTimeout(probeTimerRef.current); probeTimerRef.current = null; } };
  const herSeyiDurdur = async () => {
    dinlemeRef.current = false; caliyorRef.current = false; aglamaCountRef.current = 0;
    if (timerRef.current) clearInterval(timerRef.current);
    if (detektorTimerRef.current) clearInterval(detektorTimerRef.current);
    probeTimerTemizle();
    await kaydiDurdur();
    if (soundRef.current) { try { await soundRef.current.stopAsync(); await soundRef.current.unloadAsync(); } catch (_) {} soundRef.current = null; }
  };

  const analizBaslat = async () => {
    if (!isPremium && !isTrial) {
      if (analizHak <= 0) { setPaywallTip('analiz'); setPaywallVisible(true); return; }
    }
    if (!isPremium && !isTrial) {
      const hakKullanildi = await analizKullan();
      if (!hakKullanildi) { setPaywallTip('analiz'); setPaywallVisible(true); return; }
    }
    if (!CLAUDE_API_KEY) {
      setAnalizHata(lang === 'en' ? 'API key not configured. Check your .env.local file.' : 'API anahtarı bulunamadı. .env.local dosyasını kontrol edin.');
      return;
    }
    try {
      const izin = await Audio.requestPermissionsAsync();
      if (!izin.granted) { alert(t.mikrofonIzni); return; }
      setAnalizSonuc(null); setAnalizHata(null); setKayitYapiliyor(true); setGeriSayim(10);
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true, staysActiveInBackground: true, shouldDuckAndroid: false });
      const { recording } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      analizRecordingRef.current = recording;
      let kalan = 10;
      geriSayimRef.current = setInterval(() => {
        kalan -= 1; setGeriSayim(kalan);
        if (kalan <= 0) { if (geriSayimRef.current) clearInterval(geriSayimRef.current); geriSayimRef.current = null; }
      }, 1000);
      setTimeout(async () => {
        if (geriSayimRef.current) clearInterval(geriSayimRef.current);
        geriSayimRef.current = null; setGeriSayim(null);
        try {
          setKayitYapiliyor(false); setAnalizYapiliyor(true);
          if (analizRecordingRef.current) { await analizRecordingRef.current.stopAndUnloadAsync(); analizRecordingRef.current = null; }
          const prompt = lang === 'en'
            ? 'You are a baby cry analysis expert. Estimate percentages for each category (total must be 100). Reply ONLY with JSON: {"aclik": 0, "gaz": 0, "uyku": 0, "bez": 0, "diger": 0}'
            : 'Sen bir bebek ağlama analiz uzmanısın. Kategoriler için yüzde tahmin et (toplam 100). Sadece JSON: {"aclik": 0, "gaz": 0, "uyku": 0, "bez": 0, "diger": 0}';

          const claudeFetch = async (): Promise<AnalizSonuc> => {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 15000);
            try {
              const response = await fetch('https://api.anthropic.com/v1/messages', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-api-key': CLAUDE_API_KEY || '', 'anthropic-version': '2023-06-01' },
                body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 200, messages: [{ role: 'user', content: prompt }] }),
                signal: controller.signal,
              });
              clearTimeout(timeoutId);
              if (!response.ok) {
                if (response.status === 401) throw new Error('API key invalid (401)');
                throw new Error(`HTTP ${response.status}`);
              }
              const data = await response.json();
              const rawText = data.content?.[0]?.text ?? '';
              const match = rawText.match(/\{[\s\S]*\}/);
              if (!match) throw new Error('No JSON in response');
              return JSON.parse(match[0]) as AnalizSonuc;
            } catch (err: any) {
              clearTimeout(timeoutId);
              throw err;
            }
          };

          const isNetworkError = (err: any) =>
            err instanceof TypeError || err?.message?.includes('Network') || err?.message?.includes('Failed to fetch');

          let sonuc: AnalizSonuc | null = null;
          let lastErr: any = null;
          const MAX_RETRY = 2;
          for (let attempt = 0; attempt <= MAX_RETRY; attempt++) {
            try {
              sonuc = await claudeFetch();
              break;
            } catch (err: any) {
              lastErr = err;
              if (attempt < MAX_RETRY) await new Promise(res => setTimeout(res, 2000));
            }
          }

          if (sonuc) {
            setAnalizSonuc(sonuc);
          } else {
            setAnalizHata(isNetworkError(lastErr) ? t.analizInternetHata : t.analizHataMesaji);
          }
        } catch (e) {
          setAnalizHata(t.analizHataMesaji);
        } finally { setAnalizYapiliyor(false); }
      }, 10000);
    } catch (e) {
      setKayitYapiliyor(false); setGeriSayim(null);
      if (geriSayimRef.current) clearInterval(geriSayimRef.current);
      setAnalizHata(t.analizHataMesaji);
    }
  };

  const bebekUyudu = () => {
    const yeniKayit: UykuKaydi = { id: Date.now(), baslangic: Date.now(), bitis: null };
    setAktifKayit(yeniKayit); aktifKayitRef.current = yeniKayit;
    setUyuyorMu(true); setSure(0); setDetektorSure(0);
    geceBaslangicRef.current = Date.now(); aglamaSayisiRef.current = 0; ilkAglamaZamaniRef.current = null; setAglamaSayisi(0);
    timerRef.current = setInterval(() => setSure(s => s + 1), 1000);

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
    if (!isPremium && !isTrial) {
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
    setSeciliDetektor(tip); aktifSesRef.current = ses; aktifDedektorRef.current = tip; aglamaCountRef.current = 0;
    if (dinlemeRef.current) {
      dinlemeRef.current = false; caliyorRef.current = false; probeTimerTemizle(); await kaydiDurdur();
      if (soundRef.current) { try { await soundRef.current.stopAsync(); await soundRef.current.unloadAsync(); } catch (_) {} soundRef.current = null; }
      setCaliniyor(false); setDinleniyor(false);
    }
    setTimeout(() => dinlemeBaslat(ses), 400);
  };

  const kalibrasyonYap = async (): Promise<number> => {
    const KALIBRASYON_SURE_MS = 3000;
    const OFFSET_DB = 15;
    const MIN_ESIK = -35;
    const MAX_ESIK = -10;
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
      if (ornekler.length === 0) throw new Error('no samples');
      const ort = ornekler.reduce((a, b) => a + b, 0) / ornekler.length;
      const esik = Math.min(MAX_ESIK, Math.max(MIN_ESIK, ort + OFFSET_DB));
      await AsyncStorage.setItem('lumibaby_noise_threshold', String(esik));
      return esik;
    } catch (_) {
      if (kalRec) { try { await kalRec.stopAndUnloadAsync(); } catch (__) {} }
      return AGLAMA_ESIGI_DB;
    } finally {
      setKalibrasyon(false);
    }
  };

  const dinlemeBaslat = async (ses: SesTip) => {
    if (dinlemeRef.current) return;
    dinlemeRef.current = true; setDinleniyor(true); aglamaCountRef.current = 0;
    aglamaEsigiRef.current = await kalibrasyonYap();
    try {
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true, staysActiveInBackground: true, shouldDuckAndroid: false });
      const { recording } = await Audio.Recording.createAsync({ ...Audio.RecordingOptionsPresets.HIGH_QUALITY, isMeteringEnabled: true });
      recordingRef.current = recording;
      pollIntervalRef.current = setInterval(async () => {
        if (!dinlemeRef.current || caliyorRef.current) { if (pollIntervalRef.current) { clearInterval(pollIntervalRef.current); pollIntervalRef.current = null; } return; }
        try {
          const status = await recording.getStatusAsync();
          const db = (status as any).metering ?? -160;
          if (db > aglamaEsigiRef.current) {
            aglamaCountRef.current += 1;
            if (aglamaCountRef.current >= AGLAMA_COUNT_ESIGI) {
              aglamaCountRef.current = 0;
              if (pollIntervalRef.current) { clearInterval(pollIntervalRef.current); pollIntervalRef.current = null; }
              const g = aktifSesRef.current;
              if (g) sesCaldir(g);
            }
          } else { aglamaCountRef.current = 0; }
        } catch (_) {}
      }, 500);
    } catch (e) { dinlemeRef.current = false; setDinleniyor(false); }
  };

  const sessizlikProbeBaslat = (ses: SesTip) => {
    probeTimerTemizle();
    probeTimerRef.current = setTimeout(async () => {
      if (!dinlemeRef.current || !caliyorRef.current) return;
      if (soundRef.current) { try { await soundRef.current.setVolumeAsync(0); } catch (_) {} }
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
        sendAlertToAll('silence').catch(() => {});
        if (soundRef.current) { try { await soundRef.current.stopAsync(); await soundRef.current.unloadAsync(); } catch (_) {} soundRef.current = null; }
        caliyorRef.current = false; setCaliniyor(false); aglamaCountRef.current = 0;
        dinlemeRef.current = false; setDinleniyor(false);
        setTimeout(() => dinlemeBaslat(ses), 300);
      } else {
        if (soundRef.current) { try { await soundRef.current.setVolumeAsync(1.0); } catch (_) {} }
        sessizlikProbeBaslat(ses);
      }
    }, 60000);
  };

  const sesCaldir = async (ses: SesTip) => {
    if (caliyorRef.current) return;
    caliyorRef.current = true; setCaliniyor(true);
    aglamaSayisiRef.current += 1; setAglamaSayisi(aglamaSayisiRef.current);
    if (!ilkAglamaZamaniRef.current) ilkAglamaZamaniRef.current = Date.now();
    const bildirimTip = aktifDedektorRef.current === 'kolik' ? 'colic' : 'crying';
    sendAlertToAll(bildirimTip).catch(() => {});
    try {
      await kaydiDurdur();
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true, staysActiveInBackground: true, shouldDuckAndroid: false });
      if (soundRef.current) { try { await soundRef.current.unloadAsync(); } catch (_) {} soundRef.current = null; }
      const { sound } = await Audio.Sound.createAsync(ses.file, { shouldPlay: true, isLooping: true, volume: 1.0 });
      soundRef.current = sound;
      sessizlikProbeBaslat(ses);
    } catch (e) { caliyorRef.current = false; setCaliniyor(false); }
  };

  const bebekUyandi = async () => {
    if (bildirimIdRef.current) {
      await Notifications.cancelScheduledNotificationAsync(bildirimIdRef.current).catch(() => {});
      bildirimIdRef.current = null;
    }
    await herSeyiDurdur();
    const bitis = Date.now(), baslangic = geceBaslangicRef.current;
    const toplamUyku  = Math.floor((bitis - baslangic) / 1000);
    const uykulaDalma = ilkAglamaZamaniRef.current ? Math.max(120, Math.floor((ilkAglamaZamaniRef.current - baslangic) / 1000)) : Math.max(120, Math.floor(toplamUyku * 0.05));
    const enUzunUyku  = aglamaSayisiRef.current === 0 ? toplamUyku : Math.floor(toplamUyku / (aglamaSayisiRef.current + 1));
    const skorSonuc   = uykuSkoruHesapla(toplamUyku, aglamaSayisiRef.current, baslangic, t);
    const tarihStr    = formatTarih(baslangic);
    const rapor: GeceRaporu = { id: Date.now(), tarih: tarihStr, toplamUyku, aglamaSayisi: aglamaSayisiRef.current, baslangic, bitis, uykulaDalma, enUzunUyku, uykuKalitesi: skorSonuc.toplam, puanDetay: skorSonuc.detaylar };
    setGeceRaporlari(prev => { const yeni = [rapor, ...prev]; setSonRapor(rapor); return yeni; });
    setRaporModal(true);
    aktifKayitRef.current = null; setAktifKayit(null); setUyuyorMu(false); setSure(0);
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

  const sesList = modalTip === 'aglama'
    ? [...(anneNinniUri  ? [{ id: 999, name: lang === 'en' ? "Mom's Lullaby 👑" : 'Anne Sesi Ninnisi 👑', icon: '💜', file: { uri: anneNinniUri  } }] : []), ...sabitNinniListesi]
    : [...(annePisPisUri ? [{ id: 998, name: lang === 'en' ? "Mom's Shush 👑"    : 'Anne Sesi Pış Pış 👑',  icon: '💜', file: { uri: annePisPisUri } }] : []), ...sabitKolikListesi];

  const oneriGetir = (sonuc: AnalizSonuc) => {
    const en = (['aclik', 'gaz', 'uyku', 'bez', 'diger'] as const).reduce((a, b) => sonuc[a] >= sonuc[b] ? a : b);
    return t.oneriGetir(en);
  };

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
        <TouchableOpacity activeOpacity={0.85} onPress={() => { free ? (setPaywallTip('premium'), setPaywallVisible(true)) : setRehberModal(true); }} style={styles.rehberKart}>
          <View style={styles.rehberBaslikRow}>
            <Text style={styles.rehberBaslik}>{t.uykuRehberiBaslik}</Text>
            <Text style={styles.rehberOk}>›</Text>
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
              <View style={styles.rehberNotKutu}>
                <Text style={styles.rehberNotYazi}>💡 {t.uykuRehberiNotlar[rehberSonuc.ritim]}</Text>
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

        {/* AĞLAMA ANALİZİ */}
        <View style={styles.aglamaAnalizKart}>
          <View style={styles.aglamaAnalizUst}>
            <Text style={styles.aglamaAnalizBaslik}>{t.aglamaAnalizBaslik}</Text>
            {free && <View style={styles.premiumMiniRozet}><Text style={styles.premiumMiniRozetYazi}>{t.premiumKilit}</Text></View>}
          </View>
          <Text style={styles.aglamaAnalizAcik}>{t.aglamaAnalizAcik}</Text>
          {!isPremium && !isTrial && (
            <View style={styles.hakBilgi}>
              <Text style={styles.hakBilgiYazi}>{t.bugunAnalizHak(analizHak)}</Text>
            </View>
          )}
          <TouchableOpacity
            style={[styles.aglamaAnalizBtn, (kayitYapiliyor || analizYapiliyor) && styles.aglamaAnalizBtnDisabled]}
            onPress={analizBaslat}
            disabled={kayitYapiliyor || analizYapiliyor}
          >
            {kayitYapiliyor ? (
              <View style={styles.aglamaAnalizRow}>
                <Text style={styles.aglamaAnalizBtnYazi}>{t.analizDinleniyor}</Text>
                <View style={styles.geriSayimDaire}><Text style={styles.geriSayimYazi}>{geriSayim}</Text></View>
              </View>
            ) : analizYapiliyor ? (
              <View style={styles.aglamaAnalizRow}><ActivityIndicator color="white" size="small" /><Text style={styles.aglamaAnalizBtnYazi}>{t.analizEdiliyor}</Text></View>
            ) : (
              <Text style={styles.aglamaAnalizBtnYazi}>{t.analizBtn}</Text>
            )}
          </TouchableOpacity>
          {analizHata && (
            <View style={styles.analizHataBox}>
              <Text style={styles.analizHataYazi}>⚠️ {analizHata}</Text>
            </View>
          )}
          {analizSonuc && (
            <View style={styles.sonucBox}>
              {t.analizSonuclar.map((item, i) => {
                const keys = ['aclik', 'gaz', 'uyku', 'bez', 'diger'] as const;
                const value = analizSonuc[keys[i]];
                return (
                  <View key={item.label} style={styles.sonucRow}>
                    <Text style={styles.sonucLabel}>{item.label}</Text>
                    <View style={styles.barBg}><View style={[styles.barFill, { width: (value + '%') as any, backgroundColor: item.color }]} /></View>
                    <Text style={styles.sonucYuzde}>{'%' + value}</Text>
                  </View>
                );
              })}
              {(() => { const o = oneriGetir(analizSonuc); return (
                <View style={styles.oneriKart}>
                  <Text style={styles.oneriIkon}>{o.ikon}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.oneriBaslik}>{o.baslik}</Text>
                    {o.kucuk ? <Text style={styles.oneriKucuk}>{o.kucuk}</Text> : null}
                  </View>
                </View>
              ); })()}
            </View>
          )}
          <Text style={styles.disclaimer}>{t.disclaimer}</Text>
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
          <View style={styles.modalKutu}>
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
          <ScrollView contentContainerStyle={{ padding: 20 }}>
            {sonRapor && (
              <View style={styles.raporModalKutu}>
                <Text style={styles.raporModalBaslik}>{t.geceRaporuBaslik}</Text>
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
          <View style={styles.detayModalKutu}>
            <View style={styles.modalKol} />
            {seciliRapor && (
              <View style={{ flex: 1 }}>
                <Text style={styles.modalBaslik}>{t.geceRaporuBaslik}</Text>
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
        <View style={[styles.rehberSheet, { maxHeight: screenHeight * 0.82 }]}>
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

      {/* UYKU REHBERİ BOTTOM SHEET */}
      <Modal visible={rehberModal} transparent animationType="slide" onRequestClose={() => setRehberModal(false)}>
        <TouchableOpacity style={styles.rehberOverlay} activeOpacity={1} onPress={() => setRehberModal(false)} />
        <View style={[styles.rehberSheet, { maxHeight: screenHeight * 0.75 }]}>
          <View style={styles.rehberSheetHandle} />
          <Text style={styles.rehberSheetBaslik}>{t.uykuRehberiModalBaslik}</Text>
          <ScrollView showsVerticalScrollIndicator={false}>

            {/* BÖLÜM 1 */}
            <View style={styles.rehberSheetBolum}>
              <Text style={styles.rehberSheetBolumBaslik}>{t.uykuRehberiBolum1Baslik}</Text>
              <Text style={styles.rehberSheetMetin}>{t.uykuRehberiBolum1Metin(bebekIsmi)}</Text>
            </View>

            {/* BÖLÜM 2 — dinamik not */}
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

            {/* BÖLÜM 3 — navigasyon butonlar */}
            <View style={styles.rehberSheetBolum}>
              <Text style={styles.rehberSheetBolumBaslik}>{t.uykuRehberiBolum3Baslik}</Text>
              <TouchableOpacity style={styles.rehberNavBtn} onPress={() => {
                setRehberModal(false);
                setTimeout(() => scrollRef.current?.scrollTo({ y: gecmisOffsetRef.current, animated: true }), 150);
              }}>
                <Text style={styles.rehberNavBtnYazi}>{t.uykuRehberiGecmiseGit}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.rehberNavBtn} onPress={() => {
                setRehberModal(false);
                setTimeout(() => scrollRef.current?.scrollTo({ y: grafikOffsetRef.current, animated: true }), 150);
              }}>
                <Text style={styles.rehberNavBtnYazi}>{t.uykuRehberiGrafigeGit}</Text>
              </TouchableOpacity>
            </View>

          </ScrollView>
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
  rehberUyari:            { color: 'rgba(255,255,255,0.45)', fontSize: 13, lineHeight: 20 },
  rehberSatir:            { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rehberEtiket:           { color: 'rgba(255,255,255,0.5)', fontSize: 13 },
  rehberDeger:            { color: 'white', fontSize: 14, fontWeight: 'bold' },
  rehberYesil:            { color: '#4ade80' },
  rehberSari:             { color: '#facc15' },
  rehberKirmizi:          { color: '#f87171' },
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
  aglamaAnalizKart:       { backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  aglamaAnalizUst:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  aglamaAnalizBaslik:     { color: 'white', fontSize: 16, fontWeight: 'bold', flex: 1 },
  aglamaAnalizAcik:       { color: 'rgba(255,255,255,0.6)', fontSize: 13, marginBottom: 14 },
  aglamaAnalizBtn:        { backgroundColor: '#9d8cef', borderRadius: 12, padding: 14, alignItems: 'center' },
  aglamaAnalizBtnDisabled:{ backgroundColor: 'rgba(157,140,239,0.5)' },
  aglamaAnalizRow:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  aglamaAnalizBtnYazi:    { color: 'white', fontSize: 15, fontWeight: 'bold' },
  geriSayimDaire:         { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.25)', alignItems: 'center', justifyContent: 'center', marginLeft: 6 },
  geriSayimYazi:          { color: 'white', fontSize: 16, fontWeight: 'bold' },
  analizHataBox:          { marginTop: 12, backgroundColor: 'rgba(229,115,115,0.1)', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: 'rgba(229,115,115,0.25)' },
  analizHataYazi:         { color: '#E57373', fontSize: 13, lineHeight: 18, textAlign: 'center' },
  sonucBox:               { marginTop: 14, gap: 8 },
  sonucRow:               { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sonucLabel:             { color: 'white', fontSize: 12, width: 110 },
  barBg:                  { flex: 1, height: 8, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 4, overflow: 'hidden' },
  barFill:                { height: 8, borderRadius: 4 },
  sonucYuzde:             { color: 'white', fontSize: 12, width: 35, textAlign: 'right' },
  oneriKart:              { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: 'rgba(157,140,239,0.15)', borderRadius: 14, padding: 14, marginTop: 14, borderWidth: 1, borderColor: 'rgba(157,140,239,0.3)' },
  oneriIkon:              { fontSize: 32 },
  oneriBaslik:            { color: 'white', fontSize: 14, fontWeight: 'bold', lineHeight: 20 },
  oneriKucuk:             { color: 'rgba(255,255,255,0.45)', fontSize: 11, marginTop: 4 },
  disclaimer:             { color: 'rgba(255,255,255,0.35)', fontSize: 11, marginTop: 10, lineHeight: 16 },
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
});
