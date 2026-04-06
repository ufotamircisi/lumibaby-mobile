import Paywall from '@/components/Paywall';
import { useLang } from '@/hooks/useLang';
import { usePremium } from '@/hooks/usePremium';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Audio } from 'expo-av';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

const beyazGurultuTR = [
  { id: 1, name: 'Saç Kurutma Makinesi', icon: '💨', desc: 'Klasik beyaz gürültü' },
  { id: 2, name: 'Elektrikli Süpürge',   icon: '🌀', desc: 'Düzenli ve sakinleştirici' },
  { id: 3, name: 'Piş Piş',              icon: '🫧', desc: 'Bebeği sakinleştiren klasik ses' },
  { id: 4, name: 'Fan Sesi',             icon: '🌬️', desc: 'Hafif ve sürekli' },
];
const beyazGurultuEN = [
  { id: 1, name: 'Hair Dryer',    icon: '💨', desc: 'Classic white noise' },
  { id: 2, name: 'Vacuum Cleaner',icon: '🌀', desc: 'Steady and soothing' },
  { id: 3, name: 'Shushing',      icon: '🫧', desc: 'Classic baby calming sound' },
  { id: 4, name: 'Fan Sound',     icon: '🌬️', desc: 'Gentle and continuous' },
];
const dogaSesleriTR = [
  { id: 10, name: 'Yağmur Sesi',    icon: '🌧️', desc: 'Dingin yağmur damlaları' },
  { id: 11, name: 'Deniz Dalgaları',icon: '🌊', desc: 'Sahilin huzur veren sesi' },
  { id: 12, name: 'Orman Sesi',     icon: '🌲', desc: 'Kuş sesleri ve yapraklar' },
  { id: 13, name: 'Şelale',         icon: '💧', desc: 'Akan suyun rahatlatıcı sesi' },
];
const dogaSesleriEN = [
  { id: 10, name: 'Rain Sound',    icon: '🌧️', desc: 'Peaceful rain drops' },
  { id: 11, name: 'Ocean Waves',   icon: '🌊', desc: 'Calming sounds of the shore' },
  { id: 12, name: 'Forest Sounds', icon: '🌲', desc: 'Bird songs and leaves' },
  { id: 13, name: 'Waterfall',     icon: '💧', desc: 'Relaxing sound of flowing water' },
];
const rahatlaticiTR = [
  { id: 20, name: 'Kedi Mırıltısı',  icon: '🐱', desc: 'Huzur veren kedi sesi' },
  { id: 21, name: 'Kalp Atışı',      icon: '💗', desc: 'Anne karnındaki sıcak ses' },
  { id: 22, name: 'Nefes Egzersizi', icon: '🧘', desc: 'Sakinleştirici nefes ritmi' },
];
const rahatlaticiEN = [
  { id: 20, name: 'Cat Purring',     icon: '🐱', desc: 'Peaceful cat sound' },
  { id: 21, name: 'Heartbeat',       icon: '💗', desc: 'Warm sound from the womb' },
  { id: 22, name: 'Breathing Exercise',icon: '🧘', desc: 'Calming breath rhythm' },
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

  const SesKart = ({ ses, id }: { ses: { name: string; icon: string; desc: string }; id: number }) => (
    <TouchableOpacity
      style={[styles.sesCard, calananId === id && styles.sesCardActive]}
      onPress={() => toggleSes(require('../../assets/sounds/dandini.mp3'), id)}
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
