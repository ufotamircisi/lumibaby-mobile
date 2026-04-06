import Paywall from '@/components/Paywall';
import { useLang } from '@/hooks/useLang';
import { usePremium } from '@/hooks/usePremium';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Audio } from 'expo-av';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

const masallarTR = [
  { id: 1, name: 'Ay Işığında Uyku',       desc: 'Küçük bir yıldızın uyku yolculuğu',      duration: '8 dk'  },
  { id: 2, name: 'Bulut Bebek',            desc: 'Pamuk bulutların arasında tatlı rüyalar', duration: '10 dk' },
  { id: 3, name: 'Orman Ninnicisi',        desc: 'Ormanın sakin seslerinde uyuyan tavşan',  duration: '12 dk' },
  { id: 4, name: 'Deniz Kızının Şarkısı',  desc: 'Dalgaların ritmiyle gelen uyku',          duration: '9 dk'  },
  { id: 5, name: 'Yıldız Toplayıcı',       desc: 'Geceleri yıldız toplayan küçük çocuk',    duration: '11 dk' },
];
const masallarEN = [
  { id: 1, name: 'Moonlight Sleep',        desc: 'A little star\'s journey to sleep',       duration: '8 min' },
  { id: 2, name: 'Cloud Baby',             desc: 'Sweet dreams among cotton clouds',         duration: '10 min'},
  { id: 3, name: 'Forest Lullaby',         desc: 'A bunny sleeping in the calm forest',      duration: '12 min'},
  { id: 4, name: 'Mermaid\'s Song',        desc: 'Sleep coming with the rhythm of the waves',duration: '9 min' },
  { id: 5, name: 'Star Collector',         desc: 'A little child collecting stars at night', duration: '11 min'},
];

export default function Hikayeler() {
  const { isPremium, isTrial, premiumAktifEt } = usePremium();
  const { lang, t } = useLang();
  const free = !isPremium && !isTrial;

  const sabitMasallar = lang === 'en' ? masallarEN : masallarTR;

  const [paywallVisible, setPaywallVisible]   = useState(false);
  const [paywallSinirMi, setPaywallSinirMi]   = useState(false);
  const [anneHikayeUri, setAnneHikayeUri]     = useState<string | null>(null);
  const [anneHikayeSure, setAnneHikayeSure]   = useState<number>(0);
  const [calananId, setCalananId]             = useState<number | null>(null);
  const [kalanSure, setKalanSure]             = useState<number | null>(null);

  const soundRef       = useRef<Audio.Sound | null>(null);
  const sinirTimerRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const sinirSayacRef  = useRef<number>(0);

  const anneHikayesiYukle = async () => {
    try {
      const veri = await AsyncStorage.getItem('anne_hikaye_kayit');
      if (veri) {
        const kayit = JSON.parse(veri);
        setAnneHikayeUri(kayit.uri);
        setAnneHikayeSure(kayit.sure || 0);
      } else { setAnneHikayeUri(null); setAnneHikayeSure(0); }
    } catch (_) {}
  };

  useFocusEffect(useCallback(() => {
    anneHikayesiYukle();
    return () => {
      soundRef.current?.unloadAsync();
      if (sinirTimerRef.current) clearInterval(sinirTimerRef.current);
    };
  }, []));

  const stopSes = useCallback(async () => {
    if (sinirTimerRef.current) { clearInterval(sinirTimerRef.current); sinirTimerRef.current = null; }
    sinirSayacRef.current = 0; setKalanSure(null);
    try { await soundRef.current?.stopAsync(); await soundRef.current?.unloadAsync(); } catch (_) {}
    soundRef.current = null; setCalananId(null);
  }, []);

  const sinirBaslat = useCallback(() => {
    sinirSayacRef.current = 60; setKalanSure(60);
    if (sinirTimerRef.current) clearInterval(sinirTimerRef.current);
    sinirTimerRef.current = setInterval(() => {
      sinirSayacRef.current -= 1; setKalanSure(sinirSayacRef.current);
      if (sinirSayacRef.current <= 0) {
        clearInterval(sinirTimerRef.current!); sinirTimerRef.current = null;
        stopSes(); setPaywallSinirMi(true); setPaywallVisible(true);
      }
    }, 1000);
  }, [stopSes]);

  const toggleMasal = async (id: number) => {
    if (calananId === id) { await stopSes(); return; }
    await stopSes();
    try {
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true, staysActiveInBackground: true });
      const { sound } = await Audio.Sound.createAsync(require('../../assets/sounds/dandini.mp3'), { shouldPlay: true });
      soundRef.current = sound; setCalananId(id);
      sound.setOnPlaybackStatusUpdate((s) => { if (s.isLoaded && s.didJustFinish) { stopSes(); } });
      if (free) sinirBaslat();
    } catch (e) { console.log('Ses hatası:', e); }
  };

  const toggleAnneHikaye = async () => {
    if (free) { setPaywallSinirMi(false); setPaywallVisible(true); return; }
    if (!anneHikayeUri) return;
    if (calananId === 999) { await stopSes(); return; }
    await stopSes();
    try {
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true, staysActiveInBackground: true });
      const { sound } = await Audio.Sound.createAsync({ uri: anneHikayeUri }, { shouldPlay: true });
      soundRef.current = sound; setCalananId(999);
      sound.setOnPlaybackStatusUpdate((s) => { if (s.isLoaded && s.didJustFinish) { stopSes(); } });
    } catch (e) { console.log('Ses hatası:', e); }
  };

  const formatSure = (s: number) => {
    const dk = Math.floor(s / 60);
    if (lang === 'en') return dk > 0 ? dk + ' min' : s + ' sec';
    return dk > 0 ? dk + ' dk' : s + ' sn';
  };

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>

        {/* Çalınan hikaye */}
        {calananId && (
          <View style={styles.nowPlaying}>
            <Text style={styles.npText}>
              {t.npCaliniyor(calananId === 999 ? t.anneSesiHikayeBaslik : sabitMasallar.find(m => m.id === calananId)?.name ?? '')}
            </Text>
            {kalanSure !== null && (
              <Text style={styles.npSinir}>{t.kalanSaniye(kalanSure)}</Text>
            )}
          </View>
        )}

        {/* Anne Sesiyle Hikaye */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{t.anneSesiHikaye}</Text>
          {free && (
            <View style={styles.premiumBadge}>
              <Text style={styles.premiumBadgeText}>{t.premiumBadge}</Text>
            </View>
          )}
        </View>

        {anneHikayeUri ? (
          <TouchableOpacity
            style={[styles.masalCard, styles.masalCardAnne, calananId === 999 && styles.masalCardActive, free && styles.masalCardKilitli]}
            onPress={toggleAnneHikaye}
          >
            <View style={[styles.masalIconBox, styles.masalIconBoxAnne]}>
              <Text style={styles.masalIcon}>💜</Text>
            </View>
            <View style={styles.masalInfo}>
              <Text style={styles.masalTitle}>{t.anneSesiHikaye}</Text>
              <Text style={styles.masalDesc}>{lang === 'en' ? 'Your voice recording' : 'Sizin ses kaydınız'}</Text>
              <View style={styles.tagRow}>
                <View style={styles.tag}><Text style={styles.tagText}>{'⏱ ' + formatSure(anneHikayeSure)}</Text></View>
                <View style={styles.anneTag}><Text style={styles.anneTagText}>{t.anneSesiTag}</Text></View>
                {free && <View style={styles.premiumTag}><Text style={styles.premiumTagText}>{t.premiumBadge}</Text></View>}
              </View>
            </View>
            <Text style={styles.playBtn}>{free ? '🔒' : calananId === 999 ? '⏹' : '▶️'}</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.kayitYokKart}>
            <Text style={styles.kayitYokIkon}>🎙</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.kayitYokBaslik}>{t.anneSesiKayitYok}</Text>
              <Text style={styles.kayitYokAcik}>{free ? t.anneSesiHikayePrem : t.anneSesiHikayeKayit}</Text>
            </View>
          </View>
        )}

        {/* Uyku Masalları */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{t.uyku_masallari}</Text>
          {free && (
            <View style={styles.premiumBadge}>
              <Text style={styles.premiumBadgeText}>{lang === 'en' ? '👑 1 min free' : '👑 İlk 1 dk ücretsiz'}</Text>
            </View>
          )}
        </View>

        {sabitMasallar.map((masal) => (
          <TouchableOpacity
            key={masal.id}
            style={[styles.masalCard, calananId === masal.id && styles.masalCardActive]}
            onPress={() => toggleMasal(masal.id)}
          >
            <View style={styles.masalIconBox}>
              <Text style={styles.masalIcon}>📚</Text>
            </View>
            <View style={styles.masalInfo}>
              <Text style={styles.masalTitle}>{masal.name}</Text>
              <Text style={styles.masalDesc}>{masal.desc}</Text>
              <View style={styles.tagRow}>
                <View style={styles.tag}><Text style={styles.tagText}>{'⏱ ' + masal.duration}</Text></View>
                {free && <View style={styles.sinirTag}><Text style={styles.sinirTagText}>{t.ilkBirDk}</Text></View>}
              </View>
            </View>
            <Text style={styles.playBtn}>{calananId === masal.id ? '⏹' : '▶️'}</Text>
          </TouchableOpacity>
        ))}

      </ScrollView>

      <Paywall
        visible={paywallVisible}
        onClose={() => setPaywallVisible(false)}
        onPremium={() => { setPaywallVisible(false); premiumAktifEt(); }}
        baslik={paywallSinirMi ? t.sinirBitti : t.premiumBadge}
        aciklama={paywallSinirMi ? t.sinirBittiAcik : t.paywallHikayePremAcik}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container:        { flex: 1, backgroundColor: '#07101e' },
  scroll:           { flex: 1 },
  scrollContent:    { padding: 16, paddingTop: 16, paddingBottom: 30 },
  sectionHeader:    { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12, marginTop: 8 },
  sectionTitle:     { color: 'white', fontSize: 20, fontWeight: 'bold' },
  premiumBadge:     { backgroundColor: 'rgba(157,140,239,0.2)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: 'rgba(157,140,239,0.4)' },
  premiumBadgeText: { color: '#b8a8f8', fontSize: 11, fontWeight: 'bold' },
  nowPlaying:       { backgroundColor: 'rgba(157,140,239,0.15)', borderRadius: 14, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: 'rgba(157,140,239,0.3)' },
  npText:           { color: 'white', fontSize: 15, fontWeight: 'bold' },
  npSinir:          { color: '#fb923c', fontSize: 12, marginTop: 4 },
  masalCard:        { backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 14, padding: 14, flexDirection: 'row', alignItems: 'center', marginBottom: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', gap: 12 },
  masalCardAnne:    { borderColor: 'rgba(157,140,239,0.3)', backgroundColor: 'rgba(157,140,239,0.08)' },
  masalCardActive:  { borderColor: '#9d8cef', backgroundColor: 'rgba(157,140,239,0.15)' },
  masalCardKilitli: { opacity: 0.7 },
  masalIconBox:     { width: 48, height: 48, backgroundColor: 'rgba(157,140,239,0.15)', borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  masalIconBoxAnne: { backgroundColor: 'rgba(157,140,239,0.25)' },
  masalIcon:        { fontSize: 24 },
  masalInfo:        { flex: 1 },
  masalTitle:       { color: 'white', fontSize: 15, fontWeight: 'bold' },
  masalDesc:        { color: 'rgba(255,255,255,0.5)', fontSize: 12, marginTop: 2 },
  tagRow:           { flexDirection: 'row', gap: 6, marginTop: 6, flexWrap: 'wrap' },
  tag:              { backgroundColor: 'rgba(255,255,255,0.08)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  tagText:          { color: 'rgba(255,255,255,0.5)', fontSize: 11 },
  premiumTag:       { backgroundColor: 'rgba(157,140,239,0.15)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  premiumTagText:   { color: '#b8a8f8', fontSize: 11 },
  sinirTag:         { backgroundColor: 'rgba(251,146,60,0.15)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  sinirTagText:     { color: '#fb923c', fontSize: 11 },
  anneTag:          { backgroundColor: 'rgba(157,140,239,0.15)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  anneTagText:      { color: '#b8a8f8', fontSize: 11 },
  playBtn:          { fontSize: 24 },
  kayitYokKart:     { backgroundColor: 'rgba(157,140,239,0.06)', borderRadius: 14, padding: 16, flexDirection: 'row', alignItems: 'center', marginBottom: 16, borderWidth: 1, borderColor: 'rgba(157,140,239,0.15)', gap: 12 },
  kayitYokIkon:     { fontSize: 28 },
  kayitYokBaslik:   { color: 'rgba(255,255,255,0.6)', fontSize: 14, fontWeight: 'bold' },
  kayitYokAcik:     { color: 'rgba(255,255,255,0.35)', fontSize: 11, marginTop: 3, lineHeight: 16 },
});
