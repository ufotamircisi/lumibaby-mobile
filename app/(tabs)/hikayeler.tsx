import Paywall from '@/components/Paywall';
import { useLang } from '@/hooks/useLang';
import { usePremium } from '@/hooks/usePremium';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Audio } from 'expo-av';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

type MasalTip = { id: number; name: string; desc: string; duration: string; file: any };

const masallarTR: MasalTip[] = [
  { id:  1, name: 'Küçük Deniz Kızının Huzur Koyu',     desc: 'Dalgaların arasında huzurlu bir uyku yolculuğu',          duration: '8 dk',  file: require('../../assets/sounds/kucuk_deniz_kizinin_huzur_koyu_tr.mp3')   },
  { id:  2, name: 'Kadife Tavşanın Sessiz Gecesi',       desc: 'Yumuşacık tüylerin arasında tatlı rüyalar',               duration: '10 dk', file: require('../../assets/sounds/kadife_tavsanin_sessiz_gecesi_tr.mp3')     },
  { id:  3, name: 'Ayın Altındaki Küçük Tilki',         desc: 'Ay ışığında ormanın sakin seslerinde uyuyan tilki',        duration: '9 dk',  file: require('../../assets/sounds/ayin_altindaki_kucuk_tilki_tr.mp3')       },
  { id:  4, name: 'Yağmur Şarkısı',                     desc: 'Yağmur damlalarının melodisiyle gelen dingin uyku',        duration: '7 dk',  file: require('../../assets/sounds/yagmur_sarkisi_tr.mp3')                   },
  { id:  5, name: 'Bulutların Çobanı',                  desc: 'Pamuk bulutları güden küçük çobanın uyku masalı',          duration: '11 dk', file: require('../../assets/sounds/bulutlarin_cobani_tr.mp3')                 },
  { id:  6, name: 'Küçük Deniz Atı',                    desc: 'Okyanusun derinliklerinde sürüklenen uyku masalı',         duration: '8 dk',  file: require('../../assets/sounds/kucuk_deniz_ati_tr.mp3')                  },
  { id:  7, name: 'Küçük Ayının Yıldız Sayısı',         desc: 'Geceleri gökyüzündeki yıldızları sayan küçük ayı',        duration: '10 dk', file: require('../../assets/sounds/kucuk_ayinin_yildiz_sayisi_tr.mp3')        },
  { id:  8, name: 'Tırtılın Sıcak Kozası',              desc: 'Sıcacık bir kozanın içinde derinlemesine uyuyan tırtıl',  duration: '9 dk',  file: require('../../assets/sounds/tirtilin_sicak_kozasi_tr.mp3')             },
  { id:  9, name: 'Küçük Fenerci Balık',                desc: 'Karanlık okyanusta ışık saçan küçük balığın masalı',      duration: '8 dk',  file: require('../../assets/sounds/kucuk_fenerci_balik_tr.mp3')              },
  { id: 10, name: 'Küçük Kaplumbağanın Uzun Gecesi',   desc: 'Yavaş yavaş yürüyerek uykuya yolculuk eden kaplumbağa',  duration: '11 dk', file: require('../../assets/sounds/kucuk_kaplumbaganin_uzun_gecesi_tr.mp3')  },
];
const masallarEN: MasalTip[] = [
  { id:  1, name: 'The Velveteen Rabbit\'s Quiet Night',       desc: 'A soft toy finds peace in the stillness of night',         duration: '10 min', file: require('../../assets/sounds/the_velveteen_rabbit_quiet_night_en.mp3')     },
  { id:  2, name: 'Thumbelina Finds Her Bed',                  desc: 'Tiny Thumbelina searches for the coziest place to sleep',  duration: '9 min',  file: require('../../assets/sounds/thumbelina_finds_her_bed_en.mp3')             },
  { id:  3, name: 'Little Red Riding Hood\'s Sleepy Evening',  desc: 'A calm evening walk through the forest toward dreamland',  duration: '8 min',  file: require('../../assets/sounds/little_red_riding_hood_sleepy_evening_en.mp3') },
  { id:  4, name: 'The Moonbeam That Couldn\'t Sleep',         desc: 'A little moonbeam wanders the sky looking for rest',       duration: '7 min',  file: require('../../assets/sounds/the_moonbeam_that_couldnt_sleep_en.mp3')      },
  { id:  5, name: 'The Tortoise and the Bedtime',              desc: 'Slow and steady, the tortoise finds the perfect sleep',    duration: '11 min', file: require('../../assets/sounds/the_tortoise_and_the_bedtime_en.mp3')          },
  { id:  6, name: 'Goldilocks and the Softest Bed',            desc: 'Goldilocks finally finds the bed that\'s just right',      duration: '9 min',  file: require('../../assets/sounds/goldilocks_and_the_softest_bed_en.mp3')        },
  { id:  7, name: 'The Ugly Duckling\'s Peaceful Lake',        desc: 'The little duckling drifts off by the shimmering lake',    duration: '8 min',  file: require('../../assets/sounds/the_ugly_duckling_peaceful_lake_en.mp3')       },
  { id:  8, name: 'The Snow Queen\'s Lullaby',                 desc: 'Snowflakes and silence bring the deepest of sleeps',       duration: '10 min', file: require('../../assets/sounds/the_snow_queen_lullaby_en.mp3')               },
  { id:  9, name: 'The Little Mermaid\'s Lullaby Cove',        desc: 'Gentle waves and soft singing from the deep blue sea',     duration: '8 min',  file: require('../../assets/sounds/the_little_mermaid_lullaby_cove_en.mp3')      },
  { id: 10, name: 'Cinderella\'s Quiet Night',                 desc: 'After the ball, Cinderella drifts into peaceful sleep',    duration: '9 min',  file: require('../../assets/sounds/cinderella_quiet_night_en.mp3')               },
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
    const masal = sabitMasallar.find(m => m.id === id);
    if (!masal?.file) return;
    await stopSes();
    try {
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true, staysActiveInBackground: true });
      const { sound } = await Audio.Sound.createAsync(masal.file, { shouldPlay: true });
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
