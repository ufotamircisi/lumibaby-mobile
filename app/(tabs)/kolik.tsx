import Paywall from '@/components/Paywall';
import { useLang } from '@/hooks/useLang';
import { usePremium } from '@/hooks/usePremium';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Audio } from 'expo-av';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

type KolikSes = { id: number; name: string; icon: string; desc: string; file: any };

const beyazGurultuTR: KolikSes[] = [
  { id: 1, name: 'Saç Kurutma Makinesi', icon: '💨', desc: 'Klasik beyaz gürültü',            file: require('../../assets/sounds/hairdryer.mp3') },
  { id: 2, name: 'Elektrikli Süpürge',   icon: '🌀', desc: 'Düzenli ve sakinleştirici',       file: require('../../assets/sounds/vacuum.mp3')    },
  { id: 3, name: 'Piş Piş',              icon: '🫧', desc: 'Bebeği sakinleştiren klasik ses', file: require('../../assets/sounds/pispis.mp3')    },
  { id: 4, name: 'Fan Sesi',             icon: '🌬️', desc: 'Hafif ve sürekli',                file: require('../../assets/sounds/ac.mp3')        },
];
const beyazGurultuEN: KolikSes[] = [
  { id: 1, name: 'Hair Dryer',     icon: '💨', desc: 'Classic white noise',          file: require('../../assets/sounds/hairdryer.mp3') },
  { id: 2, name: 'Vacuum Cleaner', icon: '🌀', desc: 'Steady and soothing',          file: require('../../assets/sounds/vacuum.mp3')    },
  { id: 3, name: 'Shushing',       icon: '🫧', desc: 'Classic baby calming sound',   file: require('../../assets/sounds/pispis.mp3')    },
  { id: 4, name: 'Fan Sound',      icon: '🌬️', desc: 'Gentle and continuous',        file: require('../../assets/sounds/ac.mp3')        },
];
const dogaSesleriTR: KolikSes[] = [
  { id: 10, name: 'Yağmur Sesi',    icon: '🌧️', desc: 'Dingin yağmur damlaları',       file: require('../../assets/sounds/rain.mp3')   },
  { id: 11, name: 'Deniz Dalgaları',icon: '🌊', desc: 'Sahilin huzur veren sesi',      file: require('../../assets/sounds/waves.mp3')  },
  { id: 12, name: 'Orman Sesi',     icon: '🌲', desc: 'Kuş sesleri ve yapraklar',      file: require('../../assets/sounds/forest.mp3') },
  { id: 13, name: 'Şelale',         icon: '💧', desc: 'Akan suyun rahatlatıcı sesi',   file: require('../../assets/sounds/stream.mp3') },
];
const dogaSesleriEN: KolikSes[] = [
  { id: 10, name: 'Rain Sound',     icon: '🌧️', desc: 'Peaceful rain drops',              file: require('../../assets/sounds/rain.mp3')   },
  { id: 11, name: 'Ocean Waves',    icon: '🌊', desc: 'Calming sounds of the shore',      file: require('../../assets/sounds/waves.mp3')  },
  { id: 12, name: 'Forest Sounds',  icon: '🌲', desc: 'Bird songs and leaves',            file: require('../../assets/sounds/forest.mp3') },
  { id: 13, name: 'Waterfall',      icon: '💧', desc: 'Relaxing sound of flowing water',  file: require('../../assets/sounds/stream.mp3') },
];
const rahatlaticiTR: KolikSes[] = [
  { id: 21, name: 'Kalp Atışı',   icon: '💗', desc: 'Anne karnındaki sıcak ses',      file: require('../../assets/sounds/heart.mp3')      },
  { id: 22, name: 'Beyaz Gürültü',icon: '🔊', desc: 'Sabit frekans, derin rahatlama', file: require('../../assets/sounds/whitenoise.mp3') },
];
const rahatlaticiEN: KolikSes[] = [
  { id: 21, name: 'Heartbeat',    icon: '💗', desc: 'Warm sound from the womb',         file: require('../../assets/sounds/heart.mp3')      },
  { id: 22, name: 'White Noise',  icon: '🔊', desc: 'Steady frequency for deep calm',   file: require('../../assets/sounds/whitenoise.mp3') },
];

export default function Kolik() {
  const { isPremium, isTrial, premiumAktifEt } = usePremium();
  const { lang, t } = useLang();
  const free = !isPremium && !isTrial;
  const [paywallVisible, setPaywallVisible] = useState(false);

  const beyazGurultu = lang === 'en' ? beyazGurultuEN : beyazGurultuTR;
  const dogaSesleri  = lang === 'en' ? dogaSesleriEN  : dogaSesleriTR;
  const rahatlatici  = lang === 'en' ? rahatlaticiEN  : rahatlaticiTR;

  const [annePisPisUri, setAnnePisPisUri] = useState<string | null>(null);
  const [calananId, setCalananId]         = useState<number | null>(null);
  const soundRef = useRef<Audio.Sound | null>(null);

  const annePisPisYukle = async () => {
    try {
      const veri = await AsyncStorage.getItem('anne_pispis_kayit');
      if (veri) setAnnePisPisUri(JSON.parse(veri).uri);
      else setAnnePisPisUri(null);
    } catch (_) {}
  };

  useFocusEffect(useCallback(() => {
    annePisPisYukle();
    return () => { soundRef.current?.unloadAsync(); };
  }, []));

  const toggleSes = async (file: any, id: number) => {
    if (id === 999 && free) { setPaywallVisible(true); return; }
    if (!file) return;
    if (calananId === id) {
      try { await soundRef.current?.stopAsync(); await soundRef.current?.unloadAsync(); } catch (_) {}
      soundRef.current = null; setCalananId(null); return;
    }
    if (soundRef.current) {
      try { await soundRef.current.stopAsync(); await soundRef.current.unloadAsync(); } catch (_) {}
      soundRef.current = null;
    }
    try {
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true, staysActiveInBackground: true });
      const { sound } = await Audio.Sound.createAsync(file, { shouldPlay: true, isLooping: true });
      soundRef.current = sound; setCalananId(id);
    } catch (e) { console.log('Ses hatası:', e); }
  };

  const SesKart = ({ ses, id }: { ses: KolikSes; id: number }) => (
    <TouchableOpacity
      style={[styles.sesCard, calananId === id && styles.sesCardActive]}
      onPress={() => toggleSes(ses.file, id)}
    >
      <View style={styles.sesIconBox}><Text style={styles.sesIcon}>{ses.icon}</Text></View>
      <View style={styles.sesInfo}>
        <Text style={styles.sesTitle}>{ses.name}</Text>
        <Text style={styles.sesDesc}>{ses.desc}</Text>
      </View>
      <Text style={styles.playBtn}>{calananId === id ? '⏹' : '▶️'}</Text>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>

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

      </ScrollView>

      <Paywall
        visible={paywallVisible}
        onClose={() => setPaywallVisible(false)}
        onPremium={() => { setPaywallVisible(false); premiumAktifEt(); }}
        baslik={t.paywallPisPisBaslik}
        aciklama={t.paywallPisPisAcik}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container:           { flex: 1, backgroundColor: '#07101e' },
  scroll:              { flex: 1 },
  scrollContent:       { padding: 16, paddingTop: 16, paddingBottom: 30 },
  sectionHeader:       { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12, marginTop: 8 },
  sectionTitle:        { color: 'white', fontSize: 18, fontWeight: 'bold' },
  freeBadge:           { backgroundColor: '#4ade80', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  freeBadgeText:       { color: '#07101e', fontSize: 11, fontWeight: 'bold' },
  premiumBadge:        { backgroundColor: 'rgba(157,140,239,0.2)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: 'rgba(157,140,239,0.4)' },
  premiumBadgeText:    { color: '#b8a8f8', fontSize: 11, fontWeight: 'bold' },
  sesCard:             { backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 14, padding: 14, flexDirection: 'row', alignItems: 'center', marginBottom: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', gap: 12 },
  sesCardAnne:         { borderColor: 'rgba(157,140,239,0.3)', backgroundColor: 'rgba(157,140,239,0.08)' },
  sesCardActive:       { borderColor: '#9d8cef', backgroundColor: 'rgba(157,140,239,0.15)' },
  sesCardKilitli:      { opacity: 0.7 },
  sesIconBox:          { width: 46, height: 46, backgroundColor: 'rgba(74,222,128,0.1)', borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  sesIconBoxAnne:      { backgroundColor: 'rgba(157,140,239,0.2)' },
  sesIcon:             { fontSize: 22 },
  sesInfo:             { flex: 1 },
  sesTitle:            { color: 'white', fontSize: 15, fontWeight: 'bold' },
  sesDesc:             { color: 'rgba(255,255,255,0.5)', fontSize: 12, marginTop: 2 },
  tagRow:              { flexDirection: 'row', gap: 6, marginTop: 4 },
  anneTag:             { backgroundColor: 'rgba(157,140,239,0.15)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  anneTagText:         { color: '#b8a8f8', fontSize: 11 },
  playBtn:             { fontSize: 24 },
  kayitYokKart:        { backgroundColor: 'rgba(157,140,239,0.06)', borderRadius: 14, padding: 16, flexDirection: 'row', alignItems: 'center', marginBottom: 12, borderWidth: 1, borderColor: 'rgba(157,140,239,0.15)', gap: 12 },
  kayitYokIkon:        { fontSize: 28 },
  kayitYokBaslik:      { color: 'rgba(255,255,255,0.6)', fontSize: 14, fontWeight: 'bold' },
  kayitYokAcik:        { color: 'rgba(255,255,255,0.35)', fontSize: 11, marginTop: 3, lineHeight: 16 },
});
