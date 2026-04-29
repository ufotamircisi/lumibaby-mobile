// ⚠️ Bu dosyada direkt Audio.Sound KULLANILMAZ — tüm ses işlemleri audioManager üzerinden yapılır.
import AdBanner from '@/components/AdBanner';
import { useLang } from '@/hooks/useLang';
import { usePremium } from '@/hooks/usePremium';
import * as audioManager from '@/services/audioManager';
import { isItemPremium } from '@/utils/permissions';
import { dismissFgNotification, showFgNotification } from '@/services/foregroundService';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

type KolikSes = { id: number; name: string; icon: string; desc: string; file: any };

const beyazGurultuTR: KolikSes[] = [
  { id: 1, name: 'Saç Kurutma Makinesi', icon: '💨', desc: 'Klasik beyaz gürültü',            file: require('../../assets/sounds/hairdryer.mp3')   },
  { id: 2, name: 'Elektrikli Süpürge',   icon: '🌀', desc: 'Düzenli ve sakinleştirici',       file: require('../../assets/sounds/vacuum.mp3')      },
  { id: 3, name: 'Piş Piş',              icon: '🫧', desc: 'Bebeği sakinleştiren klasik ses', file: require('../../assets/sounds/pispis.mp3')      },
  { id: 4, name: 'Fan Sesi',             icon: '🌬️', desc: 'Hafif ve sürekli',                file: require('../../assets/sounds/ac.mp3')          },
  { id: 5, name: 'Beyaz Gürültü',        icon: '🔊', desc: 'Sabit frekans, derin rahatlama',  file: require('../../assets/sounds/whitenoise.mp3')  },
];
const beyazGurultuEN: KolikSes[] = [
  { id: 1, name: 'Hair Dryer',     icon: '💨', desc: 'Classic white noise',           file: require('../../assets/sounds/hairdryer.mp3')   },
  { id: 2, name: 'Vacuum Cleaner', icon: '🌀', desc: 'Steady and soothing',           file: require('../../assets/sounds/vacuum.mp3')      },
  { id: 3, name: 'Shushing',       icon: '🫧', desc: 'Classic baby calming sound',    file: require('../../assets/sounds/pispis.mp3')      },
  { id: 4, name: 'Fan Sound',      icon: '🌬️', desc: 'Gentle and continuous',         file: require('../../assets/sounds/ac.mp3')          },
  { id: 5, name: 'White Noise',    icon: '🔊', desc: 'Steady frequency for deep calm', file: require('../../assets/sounds/whitenoise.mp3') },
];
const rahatlaticiTR: KolikSes[] = [
  { id: 20, name: 'Kedi Mırıltısı',  icon: '🐱', desc: 'Sakinleştirici kedi sesi',  file: require('../../assets/sounds/kedi_miriltisi.mp3')   },
  { id: 21, name: 'Kalp Atışı',      icon: '💗', desc: 'Anne karnındaki sıcak ses',  file: require('../../assets/sounds/heart.mp3')             },
  { id: 22, name: 'Nefes Egzersizi', icon: '🧘', desc: 'Sakinleştirici nefes ritmi', file: require('../../assets/sounds/nefes_egzersizi.mp3')   },
];
const rahatlaticiEN: KolikSes[] = [
  { id: 20, name: 'Cat Purring',        icon: '🐱', desc: 'Soothing cat purring sound', file: require('../../assets/sounds/kedi_miriltisi.mp3') },
  { id: 21, name: 'Heartbeat',          icon: '💗', desc: 'Warm sound from the womb',   file: require('../../assets/sounds/heart.mp3')          },
  { id: 22, name: 'Breathing Exercise', icon: '🧘', desc: 'Calming breathing rhythm',    file: require('../../assets/sounds/nefes_egzersizi.mp3') },
];
const dogaSesleriTR: KolikSes[] = [
  { id: 10, name: 'Yağmur Sesi',     icon: '🌧️', desc: 'Dingin yağmur damlaları',     file: require('../../assets/sounds/rain.mp3')    },
  { id: 11, name: 'Deniz Dalgaları', icon: '🌊', desc: 'Sahilin huzur veren sesi',    file: require('../../assets/sounds/waves.mp3')   },
  { id: 12, name: 'Orman Sesi',      icon: '🌲', desc: 'Kuş sesleri ve yapraklar',    file: require('../../assets/sounds/forest.mp3')  },
  { id: 13, name: 'Şelale',          icon: '💧', desc: 'Akan suyun rahatlatıcı sesi', file: require('../../assets/sounds/stream.mp3')  },
];
const dogaSesleriEN: KolikSes[] = [
  { id: 10, name: 'Rain Sound',    icon: '🌧️', desc: 'Peaceful rain drops',             file: require('../../assets/sounds/rain.mp3')    },
  { id: 11, name: 'Ocean Waves',   icon: '🌊', desc: 'Calming sounds of the shore',     file: require('../../assets/sounds/waves.mp3')   },
  { id: 12, name: 'Forest Sounds', icon: '🌲', desc: 'Bird songs and leaves',           file: require('../../assets/sounds/forest.mp3')  },
  { id: 13, name: 'Waterfall',     icon: '💧', desc: 'Relaxing sound of flowing water', file: require('../../assets/sounds/stream.mp3')  },
];

export default function Kolik() {
  const { isPremium, isTrial } = usePremium();
  const { lang, t } = useLang();
  const router = useRouter();
  const free = !isPremium && !isTrial;

  const beyazGurultu = lang === 'en' ? beyazGurultuEN : beyazGurultuTR;
  const dogaSesleri  = lang === 'en' ? dogaSesleriEN  : dogaSesleriTR;
  const rahatlatici  = lang === 'en' ? rahatlaticiEN  : rahatlaticiTR;

  const [annePisPisUri, setAnnePisPisUri] = useState<string | null>(null);
  const [calananId, setCalananId]         = useState<number | null>(null);
  const [timerAcik, setTimerAcik]         = useState(false);
  const [timerSaniye, setTimerSaniye]     = useState<number | null>(null);
  const [secilenDk, setSecilenDk]         = useState<number | null>(null);

  const scrollViewRef       = useRef<ScrollView>(null);
  const timerRef            = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerBitisTarihiRef = useRef<number | null>(null);

  const annePisPisYukle = async () => {
    try {
      const veri = await AsyncStorage.getItem('anne_pispis_kayit');
      if (veri) setAnnePisPisUri(JSON.parse(veri).uri);
      else setAnnePisPisUri(null);
    } catch (_) {}
  };

  useFocusEffect(useCallback(() => {
    annePisPisYukle();
    scrollViewRef.current?.scrollTo({ y: 0, animated: false });
  }, []));

  // Sync calananId with global audio state
  useEffect(() => {
    return audioManager.subscribe((id, tab) => {
      setCalananId(tab === 'kolik' ? id : null);
    });
  }, []);

  const timerIptal = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    timerBitisTarihiRef.current = null;
    setTimerSaniye(null);
    setSecilenDk(null);
    AsyncStorage.removeItem('timer_end_kolik').catch(() => {});
    dismissFgNotification().catch(() => {});
  }, []);

  useEffect(() => {
    const appStateSub = AppState.addEventListener('change', async (nextState) => {
      if (nextState !== 'active') return;
      let endTime = timerBitisTarihiRef.current;
      if (!endTime) {
        const stored = await AsyncStorage.getItem('timer_end_kolik');
        if (stored) endTime = Number(stored);
      }
      if (!endTime) return;
      const kalan = Math.round((endTime - Date.now()) / 1000);
      if (kalan <= 0) {
        timerIptal();
        if (audioManager.getState().tab === 'kolik') audioManager.stop();
      } else {
        timerBitisTarihiRef.current = endTime;
        setTimerSaniye(kalan);
      }
    });
    return () => {
      appStateSub.remove();
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [timerIptal]);

  const timerBaslat = (dk: number) => {
    if (timerRef.current) clearInterval(timerRef.current);
    setSecilenDk(dk); setTimerAcik(false);
    const endTime = Date.now() + dk * 60 * 1000;
    timerBitisTarihiRef.current = endTime;
    AsyncStorage.setItem('timer_end_kolik', String(endTime)).catch(() => {});
    showFgNotification('audio', lang).catch(() => {});
    const tick = () => {
      const kalan = Math.round((timerBitisTarihiRef.current! - Date.now()) / 1000);
      if (kalan <= 0) {
        clearInterval(timerRef.current!);
        timerRef.current = null;
        timerBitisTarihiRef.current = null;
        setTimerSaniye(null);
        setSecilenDk(null);
        AsyncStorage.removeItem('timer_end_kolik').catch(() => {});
        dismissFgNotification().catch(() => {});
        if (audioManager.getState().tab === 'kolik') audioManager.stop();
      } else setTimerSaniye(kalan);
    };
    tick();
    timerRef.current = setInterval(tick, 1000);
  };

  const formatSure = (saniye: number) =>
    Math.floor(saniye / 60) + ':' + (saniye % 60).toString().padStart(2, '0');

  const toggleSes = async (file: any, id: number) => {
    if (free && isItemPremium({ id })) { router.push('/paywall'); return; }
    if (!file) return;
    if (calananId === id) {
      await audioManager.stop();
      return;
    }
    await audioManager.play(file, id, 'kolik', { loop: true });
  };

  const SesKart = ({ ses, id }: { ses: KolikSes; id: number }) => (
    <TouchableOpacity
      style={[styles.sesCard, calananId === id && styles.sesCardActive, !ses.file && styles.sesCardDisabled]}
      onPress={() => toggleSes(ses.file, id)}
    >
      <View style={styles.sesIconBox}><Text style={styles.sesIcon}>{ses.icon}</Text></View>
      <View style={styles.sesInfo}>
        <Text style={styles.sesTitle}>{ses.name}</Text>
        <Text style={styles.sesDesc}>{ses.desc}</Text>
      </View>
      <Text style={styles.playBtn}>{!ses.file ? '🔜' : calananId === id ? '⏹' : '▶️'}</Text>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      {free && <AdBanner />}
      <ScrollView ref={scrollViewRef} style={styles.scroll} contentContainerStyle={styles.scrollContent}>

        {/* Zamanlayıcı */}
        <TouchableOpacity style={styles.timerBtn} onPress={() => setTimerAcik(!timerAcik)}>
          <Text style={styles.timerBtnText}>{t.zamanlayici}</Text>
        </TouchableOpacity>
        {timerAcik && (
          <View style={styles.timerPicker}>
            <Text style={styles.timerPickerTitle}>{t.neZamanDursun}</Text>
            <View style={styles.timerGrid}>
              {[15, 30, 60, 90, 120].map((dk) => (
                <TouchableOpacity key={dk} style={[styles.timerOption, secilenDk === dk && styles.timerOptionActive]} onPress={() => timerBaslat(dk)}>
                  <Text style={[styles.timerOptionText, secilenDk === dk && styles.timerOptionTextActive]}>{dk + (lang === 'en' ? ' min' : ' dk')}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}
        {timerSaniye !== null && (
          <View style={styles.miniTimer}>
            <Text style={styles.miniTimerText}>{t.sonraKapanacak(formatSure(timerSaniye))}</Text>
            <TouchableOpacity onPress={timerIptal}>
              <Text style={styles.miniTimerIptal}>{t.iptal}</Text>
            </TouchableOpacity>
          </View>
        )}
        {calananId && (() => {
          const ses = calananId === 999
            ? { name: t.anneSesiPisPis, icon: '💜' }
            : [...beyazGurultu, ...rahatlatici, ...dogaSesleri].find(s => s.id === calananId) ?? null;
          if (!ses) return null;
          return (
            <View style={styles.nowPlaying}>
              <Text style={styles.npText}>{ses.icon + ' ' + ses.name}</Text>
              <Text style={styles.npSub}>{t.donguAktif}</Text>
            </View>
          );
        })()}

        {/* Anne Sesi */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{t.anneSesiPisPis}</Text>
          {free && (
            <View style={styles.premiumBadge}>
              <Text style={styles.premiumBadgeText}>{t.premiumBadge}</Text>
            </View>
          )}
        </View>

        {annePisPisUri ? (
          <TouchableOpacity
            style={[styles.sesCard, styles.sesCardAnne, calananId === 999 && styles.sesCardActive, free && styles.sesCardKilitli]}
            disabled={free}
            onPress={() => toggleSes({ uri: annePisPisUri }, 999)}
          >
            <View style={[styles.sesIconBox, styles.sesIconBoxAnne]}>
              <Text style={styles.sesIcon}>💜</Text>
            </View>
            <View style={styles.sesInfo}>
              <Text style={styles.sesTitle}>{t.anneSesiPisPis}</Text>
              <Text style={styles.sesDesc}>{lang === 'en' ? 'Your voice recording' : 'Sizin sesinizle'}</Text>
              <View style={styles.tagRow}>
                <View style={styles.anneTag}><Text style={styles.anneTagText}>{t.anneSesiTag}</Text></View>
              </View>
            </View>
            <Text style={styles.playBtn}>{free ? '🔒' : calananId === 999 ? '⏹' : '▶️'}</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.kayitYokKart}>
            <Text style={styles.kayitYokIkon}>🎙</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.kayitYokBaslik}>{t.anneSesiKayitYok}</Text>
              <Text style={styles.kayitYokAcik}>{free ? t.annePisPisPremAcik : t.annePisPisKayitAcik}</Text>
            </View>
          </View>
        )}

        {/* Beyaz Gürültü */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{t.beyazGurultu}</Text>
          {free && (
            <View style={styles.freeBadge}>
              <Text style={styles.freeBadgeText}>{t.ucretsizibaresi}</Text>
            </View>
          )}
        </View>
        {beyazGurultu.map((ses) => <SesKart key={ses.id} ses={ses} id={ses.id} />)}

        {/* Rahatlatıcı Sesler */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{t.rahatlaticiSesler}</Text>
          {free && (
            <View style={styles.freeBadge}>
              <Text style={styles.freeBadgeText}>{t.ucretsizibaresi}</Text>
            </View>
          )}
        </View>
        {rahatlatici.map((ses) => <SesKart key={ses.id} ses={ses} id={ses.id} />)}

        {/* Doğa Sesleri */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{t.dogaSesleri}</Text>
          {free && (
            <View style={styles.freeBadge}>
              <Text style={styles.freeBadgeText}>{t.ucretsizibaresi}</Text>
            </View>
          )}
        </View>
        {dogaSesleri.map((ses) => <SesKart key={ses.id} ses={ses} id={ses.id} />)}

      </ScrollView>

    </View>
  );
}

const styles = StyleSheet.create({
  container:             { flex: 1, backgroundColor: '#07101e' },
  scroll:                { flex: 1 },
  scrollContent:         { padding: 16, paddingTop: 16, paddingBottom: 30 },
  timerBtn:              { backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 12, padding: 14, alignItems: 'center', marginBottom: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  timerBtnText:          { color: 'white', fontSize: 14 },
  timerPicker:           { backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 14, padding: 16, marginBottom: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  timerPickerTitle:      { color: 'rgba(255,255,255,0.6)', fontSize: 13, marginBottom: 12 },
  timerGrid:             { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  timerOption:           { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  timerOptionActive:     { backgroundColor: 'rgba(157,140,239,0.3)', borderColor: '#9d8cef' },
  timerOptionText:       { color: 'rgba(255,255,255,0.6)', fontSize: 14 },
  timerOptionTextActive: { color: '#b8a8f8', fontWeight: 'bold' },
  miniTimer:             { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'rgba(157,140,239,0.1)', borderRadius: 12, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: 'rgba(157,140,239,0.2)' },
  miniTimerText:         { color: '#b8a8f8', fontSize: 13 },
  miniTimerIptal:        { color: 'rgba(255,255,255,0.5)', fontSize: 13 },
  nowPlaying:            { backgroundColor: 'rgba(157,140,239,0.15)', borderRadius: 14, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: 'rgba(157,140,239,0.3)' },
  npText:                { color: 'white', fontSize: 15, fontWeight: 'bold' },
  npSub:                 { color: '#b8a8f8', fontSize: 12, marginTop: 4 },
  sectionHeader:         { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12, marginTop: 8 },
  sectionTitle:          { color: 'white', fontSize: 18, fontWeight: 'bold' },
  freeBadge:             { backgroundColor: '#4ade80', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  freeBadgeText:         { color: '#07101e', fontSize: 11, fontWeight: 'bold' },
  premiumBadge:          { backgroundColor: 'rgba(157,140,239,0.2)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: 'rgba(157,140,239,0.4)' },
  premiumBadgeText:      { color: '#b8a8f8', fontSize: 11, fontWeight: 'bold' },
  sesCard:               { backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 14, padding: 14, flexDirection: 'row', alignItems: 'center', marginBottom: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', gap: 12 },
  sesCardAnne:           { borderColor: 'rgba(157,140,239,0.3)', backgroundColor: 'rgba(157,140,239,0.08)' },
  sesCardActive:         { borderColor: '#9d8cef', backgroundColor: 'rgba(157,140,239,0.15)' },
  sesCardKilitli:        { opacity: 0.7 },
  sesCardDisabled:       { opacity: 0.4 },
  sesIconBox:            { width: 46, height: 46, backgroundColor: 'rgba(74,222,128,0.1)', borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  sesIconBoxAnne:        { backgroundColor: 'rgba(157,140,239,0.2)' },
  sesIcon:               { fontSize: 22 },
  sesInfo:               { flex: 1 },
  sesTitle:              { color: 'white', fontSize: 15, fontWeight: 'bold' },
  sesDesc:               { color: 'rgba(255,255,255,0.5)', fontSize: 12, marginTop: 2 },
  tagRow:                { flexDirection: 'row', gap: 6, marginTop: 4 },
  anneTag:               { backgroundColor: 'rgba(157,140,239,0.15)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  anneTagText:           { color: '#b8a8f8', fontSize: 11 },
  playBtn:               { fontSize: 24 },
  kayitYokKart:          { backgroundColor: 'rgba(157,140,239,0.06)', borderRadius: 14, padding: 16, flexDirection: 'row', alignItems: 'center', marginBottom: 12, borderWidth: 1, borderColor: 'rgba(157,140,239,0.15)', gap: 12 },
  kayitYokIkon:          { fontSize: 28 },
  kayitYokBaslik:        { color: 'rgba(255,255,255,0.6)', fontSize: 14, fontWeight: 'bold' },
  kayitYokAcik:          { color: 'rgba(255,255,255,0.35)', fontSize: 11, marginTop: 3, lineHeight: 16 },
});
