import Paywall from '@/components/Paywall';
import { useLang } from '@/hooks/useLang';
import { usePremium } from '@/hooks/usePremium';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Audio } from 'expo-av';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

type SesTip = { id: number; name: string; desc: string; tag: string; icon: string; file: any; premium: boolean; };

const sabitNinnilerTR: SesTip[] = [
  { id: 1, name: 'Dandini Dandini', desc: 'Nesilden nesile aktarılan klasik Türk ninnisi', tag: 'Anadolu', icon: '⭐', file: require('../../assets/sounds/dandini.mp3'), premium: false },
];
const sabitNinnilerEN: SesTip[] = [
  { id: 1, name: 'Dandini Dandini', desc: 'A classic Turkish lullaby passed down through generations', tag: 'Traditional', icon: '⭐', file: require('../../assets/sounds/dandini.mp3'), premium: false },
];

export default function Ninniler() {
  const { isPremium, isTrial, premiumAktifEt } = usePremium();
  const { lang, t } = useLang();
  const free = !isPremium && !isTrial;
  const sabitNinniler = lang === 'en' ? sabitNinnilerEN : sabitNinnilerTR;
  const [paywallVisible, setPaywallVisible] = useState(false);

  const [anneNinniUri, setAnneNinniUri]   = useState<string | null>(null);
  const [calananId, setCalananId]         = useState<number | null>(null);
  const [timerAcik, setTimerAcik]         = useState(false);
  const [timerSaniye, setTimerSaniye]     = useState<number | null>(null);
  const [secilenDk, setSecilenDk]         = useState<number | null>(null);

  const soundRef            = useRef<Audio.Sound | null>(null);
  const isLoadingRef        = useRef(false);
  const timerRef            = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerBitisTarihiRef = useRef<number | null>(null);

  const anneNinnisiYukle = async () => {
    try {
      const veri = await AsyncStorage.getItem('anne_ninni_kayit');
      if (veri) setAnneNinniUri(JSON.parse(veri).uri);
      else setAnneNinniUri(null);
    } catch (_) {}
  };

  useFocusEffect(useCallback(() => { anneNinnisiYukle(); }, []));

  const stopSes = useCallback(async () => {
    try {
      if (soundRef.current) {
        await soundRef.current.stopAsync();
        await soundRef.current.unloadAsync();
        soundRef.current = null;
      }
    } catch (e) {}
    setCalananId(null);
  }, []);

  const timerIptal = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    timerBitisTarihiRef.current = null;
    setTimerSaniye(null);
    setSecilenDk(null);
  }, []);

  useEffect(() => {
    Audio.setAudioModeAsync({ allowsRecordingIOS: false, staysActiveInBackground: true, playsInSilentModeIOS: true, shouldDuckAndroid: true });
    const appStateSub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active' && timerBitisTarihiRef.current) {
        const kalan = Math.round((timerBitisTarihiRef.current - Date.now()) / 1000);
        if (kalan <= 0) { timerIptal(); stopSes(); } else setTimerSaniye(kalan);
      }
    });
    return () => {
      appStateSub.remove();
      soundRef.current?.unloadAsync();
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [stopSes, timerIptal]);

  const timerBaslat = (dk: number) => {
    if (timerRef.current) clearInterval(timerRef.current);
    setSecilenDk(dk); setTimerAcik(false);
    timerBitisTarihiRef.current = Date.now() + dk * 60 * 1000;
    const tick = () => {
      const kalan = Math.round((timerBitisTarihiRef.current! - Date.now()) / 1000);
      if (kalan <= 0) {
        clearInterval(timerRef.current!);
        timerRef.current = null;
        timerBitisTarihiRef.current = null;
        setTimerSaniye(null);
        setSecilenDk(null);
        stopSes();
      } else setTimerSaniye(kalan);
    };
    tick();
    timerRef.current = setInterval(tick, 1000);
  };

  const formatSure = (saniye: number) =>
    Math.floor(saniye / 60) + ':' + (saniye % 60).toString().padStart(2, '0');

  const toggleNinni = async (file: any, id: number) => {
    if (isLoadingRef.current) return;
    if (id === 999 && free) { setPaywallVisible(true); return; }
    isLoadingRef.current = true;
    try {
      if (calananId === id) { await stopSes(); }
      else {
        await stopSes();
        const { sound } = await Audio.Sound.createAsync(file, { shouldPlay: true, isLooping: true });
        soundRef.current = sound; setCalananId(id);
      }
    } catch (e) { console.log('Ses hatası:', e); }
    finally { isLoadingRef.current = false; }
  };

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>

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
        {calananId && (
          <View style={styles.nowPlaying}>
            <Text style={styles.npText}>
              {'🎵 ' + (calananId === 999 ? t.anneSesiNinni : sabitNinniler.find(n => n.id === calananId)?.name ?? '')}
            </Text>
            <Text style={styles.npSub}>{t.donguAktif}</Text>
          </View>
        )}

        {/* Anne Sesiyle Ninni */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{t.anneSesiNinni}</Text>
          {free && (
            <View style={styles.premiumBadge}>
              <Text style={styles.premiumBadgeText}>{t.premiumBadge}</Text>
            </View>
          )}
        </View>

        {anneNinniUri ? (
          <TouchableOpacity
            style={[styles.ninniCard, styles.ninniCardAnne, calananId === 999 && styles.ninniCardActive, free && styles.ninniCardKilitli]}
            onPress={() => toggleNinni({ uri: anneNinniUri }, 999)}
          >
            <Text style={styles.ninniIcon}>💜</Text>
            <View style={styles.ninniInfo}>
              <Text style={styles.ninniTitle}>{t.anneSesiNinni}</Text>
              <Text style={styles.ninniDesc}>{t.anneSesiKayitYok}</Text>
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
              <Text style={styles.kayitYokAcik}>{free ? t.anneSesiPremiumAcik : t.anneSesiKayitAcik}</Text>
            </View>
          </View>
        )}

        {/* Ninniler */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{t.turkNinniler}</Text>
          {free && (
            <View style={styles.freeBadge}>
              <Text style={styles.freeBadgeText}>{t.ucretsizibaresi}</Text>
            </View>
          )}
        </View>
        {sabitNinniler.map((ninni) => (
          <TouchableOpacity
            key={ninni.id}
            style={[styles.ninniCard, calananId === ninni.id && styles.ninniCardActive]}
            onPress={() => toggleNinni(ninni.file, ninni.id)}
          >
            <Text style={styles.ninniIcon}>{ninni.icon}</Text>
            <View style={styles.ninniInfo}>
              <Text style={styles.ninniTitle}>{ninni.name}</Text>
              <Text style={styles.ninniDesc}>{ninni.desc}</Text>
              <View style={styles.tagRow}>
                <View style={styles.tag}><Text style={styles.tagText}>{ninni.tag}</Text></View>
              </View>
            </View>
            <Text style={styles.playBtn}>{calananId === ninni.id ? '⏹' : '▶️'}</Text>
          </TouchableOpacity>
        ))}

      </ScrollView>

      <Paywall
        visible={paywallVisible}
        onClose={() => setPaywallVisible(false)}
        onPremium={() => { setPaywallVisible(false); premiumAktifEt(); }}
        baslik={t.paywallAnneNinniBaslik}
        aciklama={t.paywallAnneNinniAcik}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container:             { flex: 1, backgroundColor: '#07101e' },
  scroll:                { flex: 1 },
  scrollContent:         { padding: 16, paddingBottom: 30 },
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
  ninniCard:             { backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 14, padding: 14, flexDirection: 'row', alignItems: 'center', marginBottom: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  ninniCardAnne:         { borderColor: 'rgba(157,140,239,0.3)', backgroundColor: 'rgba(157,140,239,0.08)' },
  ninniCardActive:       { borderColor: '#9d8cef', backgroundColor: 'rgba(157,140,239,0.15)' },
  ninniCardKilitli:      { opacity: 0.7 },
  ninniIcon:             { fontSize: 28, marginRight: 12 },
  ninniInfo:             { flex: 1 },
  ninniTitle:            { color: 'white', fontSize: 15, fontWeight: 'bold' },
  ninniDesc:             { color: 'rgba(255,255,255,0.5)', fontSize: 12, marginTop: 2 },
  tagRow:                { flexDirection: 'row', gap: 6, marginTop: 6 },
  tag:                   { backgroundColor: 'rgba(255,255,255,0.08)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  tagText:               { color: 'rgba(255,255,255,0.5)', fontSize: 11 },
  anneTag:               { backgroundColor: 'rgba(157,140,239,0.15)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  anneTagText:           { color: '#b8a8f8', fontSize: 11 },
  playBtn:               { fontSize: 26 },
  kayitYokKart:          { backgroundColor: 'rgba(157,140,239,0.06)', borderRadius: 14, padding: 16, flexDirection: 'row', alignItems: 'center', marginBottom: 10, borderWidth: 1, borderColor: 'rgba(157,140,239,0.15)', gap: 12 },
  kayitYokIkon:          { fontSize: 28 },
  kayitYokBaslik:        { color: 'rgba(255,255,255,0.6)', fontSize: 14, fontWeight: 'bold' },
  kayitYokAcik:          { color: 'rgba(255,255,255,0.35)', fontSize: 11, marginTop: 3, lineHeight: 16 },
});
