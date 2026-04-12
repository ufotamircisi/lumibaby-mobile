import Paywall from '@/components/Paywall';
import { useLang } from '@/hooks/useLang';
import { usePremium } from '@/hooks/usePremium';
import * as audioManager from '@/services/audioManager';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

type SesTip = { id: number; name: string; desc: string; tag: string; icon: string; file: any; premium: boolean; };

const sabitNinnilerTR: SesTip[] = [
  { id:  1, name: 'Dandini Dastana',        desc: 'Nesilden nesile aktarılan klasik Türk ninnisi',    tag: 'Anadolu',      icon: '⭐', file: require('../../assets/sounds/dandini_dastana_tr.mp3'),          premium: false },
  { id:  2, name: 'Uyusun da Büyüsün',     desc: 'Bebeğe büyümesi için söylenen geleneksel ninni',   tag: 'Geleneksel',   icon: '🌟', file: require('../../assets/sounds/uyusun_da_buyusun_ninni_tr.mp3'),  premium: false },
  { id:  3, name: 'Güzel Annem',           desc: 'Anneye duyulan sevgiyi anlatan sıcak ninni',       tag: 'Türkçe',       icon: '💜', file: require('../../assets/sounds/guzel_annem_tr.mp3'),              premium: false },
  { id:  4, name: 'Yağmur Ninnisi',        desc: 'Yağmur damlalarının ritmiyle hazırlanmış ninni',   tag: 'Doğa',         icon: '🌧️', file: require('../../assets/sounds/yagmur_ninnisi_tr.mp3'),            premium: false },
  { id:  5, name: 'Uyu Yavrum',            desc: 'Bebeğinizi yavaşça uyutacak sevgi dolu ninni',     tag: 'Türkçe',       icon: '🌙', file: require('../../assets/sounds/uyu_yavrum_tr.mp3'),               premium: false },
  { id:  6, name: 'Müzik Kutusu 1',        desc: 'Huzur veren hafif müzik kutusu melodisi',          tag: 'Melodi',       icon: '🎵', file: require('../../assets/sounds/muzik_kutusu_tr.mp3'),             premium: false },
  { id:  7, name: 'Müzik Kutusu 2',        desc: 'Nazik ve sakinleştirici ikinci melodi',            tag: 'Melodi',       icon: '🎶', file: require('../../assets/sounds/muzik_kutusu_2_tr.mp3'),           premium: false },
  { id:  8, name: 'Müzik Kutusu 3',        desc: 'Üçüncü müzik kutusu ninnisi',                     tag: 'Melodi',       icon: '🎼', file: require('../../assets/sounds/muzik_kutusu_3_tr.mp3'),           premium: false },
  { id:  9, name: 'Yumuşak Piyano Ninnisi', desc: 'Piyano ile çalınan yumuşak uyku melodisi',       tag: 'Piyano',       icon: '🎹', file: require('../../assets/sounds/yumusak_piyano_ninnisi_tr.mp3'),   premium: false },
  { id: 10, name: 'Enstrümantal Ninni',    desc: 'Sözsüz enstrümanlarla hazırlanmış ninni',          tag: 'Enstrümantal', icon: '🎻', file: require('../../assets/sounds/enstrumantal_ninni_tr.mp3'),       premium: false },
];
const sabitNinnilerEN: SesTip[] = [
  { id:  1, name: 'Little Star',          desc: 'A shining star guides baby to dreamland',           tag: 'Classic',      icon: '⭐', file: require('../../assets/sounds/star_in_the_sky_en.mp3'),          premium: false },
  { id:  2, name: 'Hush Now Baby',        desc: 'Gentle hush tones to ease baby into sleep',         tag: 'Soft',         icon: '🤫', file: require('../../assets/sounds/hush_now_baby_en.mp3'),            premium: false },
  { id:  3, name: 'Rock-a-Bye',           desc: 'The timeless cradle song for peaceful nights',      tag: 'Traditional',  icon: '🍃', file: require('../../assets/sounds/rock_a_bye_en.mp3'),               premium: false },
  { id:  4, name: 'Sleep Baby',           desc: 'Warm melodies for a cozy and restful sleep',        tag: 'Lullaby',      icon: '😴', file: require('../../assets/sounds/sleep_baby_en.mp3'),               premium: false },
  { id:  5, name: 'A Candle',             desc: 'Soft candlelight melodies for serene bedtimes',     tag: 'Ambient',      icon: '🕯️', file: require('../../assets/sounds/a_candle_en.mp3'),                 premium: false },
  { id:  6, name: 'Music Box 1',          desc: 'Delicate music box melody to drift off gently',     tag: 'Melody',       icon: '🎵', file: require('../../assets/sounds/music_box_en.mp3'),                premium: false },
  { id:  7, name: 'Music Box 2',          desc: 'Second soothing music box tune',                    tag: 'Melody',       icon: '🎶', file: require('../../assets/sounds/music_box_2_en.mp3'),              premium: false },
  { id:  8, name: 'Music Box 3',          desc: 'Third gentle music box lullaby',                    tag: 'Melody',       icon: '🎼', file: require('../../assets/sounds/music_box_3_en.mp3'),              premium: false },
  { id:  9, name: 'Soft Piano Lullaby',   desc: 'Tender piano notes for the sweetest dreams',        tag: 'Piano',        icon: '🎹', file: require('../../assets/sounds/soft_piano_lullaby_en.mp3'),       premium: false },
  { id: 10, name: 'Instrumental Lullaby', desc: 'Wordless instrumental tones for calm sleep',        tag: 'Instrumental', icon: '🎻', file: require('../../assets/sounds/instrumental_lullaby_en.mp3'),    premium: false },
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

  const scrollViewRef       = useRef<ScrollView>(null);
  const timerRef            = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerBitisTarihiRef = useRef<number | null>(null);

  const anneNinnisiYukle = async () => {
    try {
      const veri = await AsyncStorage.getItem('anne_ninni_kayit');
      if (veri) setAnneNinniUri(JSON.parse(veri).uri);
      else setAnneNinniUri(null);
    } catch (_) {}
  };

  useFocusEffect(useCallback(() => {
    anneNinnisiYukle();
    scrollViewRef.current?.scrollTo({ y: 0, animated: false });
  }, []));

  // Sync calananId with global audio state
  useEffect(() => {
    return audioManager.subscribe((id, tab) => {
      setCalananId(tab === 'ninniler' ? id : null);
    });
  }, []);

  const stopSes = useCallback(async () => {
    await audioManager.stop();
  }, []);

  const timerIptal = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    timerBitisTarihiRef.current = null;
    setTimerSaniye(null);
    setSecilenDk(null);
  }, []);

  useEffect(() => {
    const appStateSub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active' && timerBitisTarihiRef.current) {
        const kalan = Math.round((timerBitisTarihiRef.current - Date.now()) / 1000);
        if (kalan <= 0) { timerIptal(); stopSes(); } else setTimerSaniye(kalan);
      }
    });
    return () => {
      appStateSub.remove();
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
        if (audioManager.getState().tab === 'ninniler') stopSes();
      } else setTimerSaniye(kalan);
    };
    tick();
    timerRef.current = setInterval(tick, 1000);
  };

  const formatSure = (saniye: number) =>
    Math.floor(saniye / 60) + ':' + (saniye % 60).toString().padStart(2, '0');

  const toggleNinni = async (file: any, id: number) => {
    if (id === 999 && free) { setPaywallVisible(true); return; }
    if (calananId === id) {
      await audioManager.stop();
    } else {
      await audioManager.play(file, id, 'ninniler', { loop: true });
    }
  };

  return (
    <View style={styles.container}>
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
