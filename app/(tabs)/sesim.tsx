// ⚠️ Bu dosyada direkt Audio.Sound KULLANILMAZ — tüm ses işlemleri audioManager üzerinden yapılır.
import Paywall from '@/components/Paywall';
import { useLang } from '@/hooks/useLang';
import { usePremium } from '@/hooks/usePremium';
import * as audioManager from '@/services/audioManager';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AudioModule, RecordingPresets, useAudioRecorder } from 'expo-audio';
import { useFocusEffect } from 'expo-router';
import { Audio } from 'expo-av';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

type KayitTip = 'ninni' | 'hikaye' | 'pispis';
type KayitBilgi = { uri: string; sure: number; tarih: string; };

const KAYIT_KEYS: Record<KayitTip, string> = {
  ninni:  'anne_ninni_kayit',
  hikaye: 'anne_hikaye_kayit',
  pispis: 'anne_pispis_kayit',
};
const SESIM_IDS: Record<KayitTip, number> = { ninni: 2001, hikaye: 2002, pispis: 2003 };
const ID_TO_TIP: Record<number, KayitTip> = { 2001: 'ninni', 2002: 'hikaye', 2003: 'pispis' };

export default function Sesim() {
  const { isPremium, isTrial, premiumAktifEt } = usePremium();
  const { t } = useLang();
  const free = !isPremium && !isTrial;
  const [paywallVisible, setPaywallVisible] = useState(false);

  const [aktifKayit, setAktifKayit]   = useState<KayitTip | null>(null);
  const [kayitSure, setKayitSure]     = useState(0);
  const [kayitlar, setKayitlar]       = useState<Partial<Record<KayitTip, KayitBilgi>>>({});
  const [calananTip, setCalananTip]   = useState<KayitTip | null>(null);

  const scrollViewRef = useRef<ScrollView>(null);
  const timerRef      = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);

  useFocusEffect(useCallback(() => {
    scrollViewRef.current?.scrollTo({ y: 0, animated: false });
  }, []));

  useEffect(() => {
    kayitlariYukle();
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (audioManager.getState().tab === 'sesim') audioManager.stop();
    };
  }, []);

  // audioManager'dan calananTip'i takip et
  useEffect(() => {
    return audioManager.subscribe((id, tab) => {
      if (tab === 'sesim' && id !== null) setCalananTip(ID_TO_TIP[id] ?? null);
      else setCalananTip(null);
    });
  }, []);

  const kayitlariYukle = async () => {
    try {
      const tipler: KayitTip[] = ['ninni', 'hikaye', 'pispis'];
      const yeni: Partial<Record<KayitTip, KayitBilgi>> = {};
      for (const tip of tipler) {
        const veri = await AsyncStorage.getItem(KAYIT_KEYS[tip]);
        if (veri) yeni[tip] = JSON.parse(veri);
      }
      setKayitlar(yeni);
    } catch (_) {}
  };

  const formatSure = (s: number) => {
    const m = Math.floor(s / 60);
    const sn = s % 60;
    return m + ':' + sn.toString().padStart(2, '0');
  };

  const formatTarih = (ts: string) => {
    const d = new Date(ts);
    return d.getDate() + '.' + (d.getMonth() + 1) + '.' + d.getFullYear() + ' ' +
      d.getHours().toString().padStart(2, '0') + ':' + d.getMinutes().toString().padStart(2, '0');
  };

  const kayitBaslat = async (tip: KayitTip) => {
    if (free) { setPaywallVisible(true); return; }
    const izin = await AudioModule.requestRecordingPermissionsAsync();
    if (!izin.granted) { Alert.alert(t.mikrofonIzniBaslik, t.mikrofonIzni); return; }
    if (audioManager.getState().tab !== null) await audioManager.stop();
    try {
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      await audioRecorder.prepareToRecordAsync();
      audioRecorder.record();
      setAktifKayit(tip); setKayitSure(0);
      timerRef.current = setInterval(() => setKayitSure(s => s + 1), 1000);
    } catch (e) { Alert.alert(t.kayitBaslatilamadi); }
  };

  const kayitDurdur = async () => {
    if (!aktifKayit) return;
    if (timerRef.current) clearInterval(timerRef.current);
    try {
      await audioRecorder.stop();
      const uri = audioRecorder.uri;
      if (!uri) { setAktifKayit(null); setKayitSure(0); return; }
      const bilgi: KayitBilgi = { uri, sure: kayitSure, tarih: new Date().toISOString() };
      await AsyncStorage.setItem(KAYIT_KEYS[aktifKayit], JSON.stringify(bilgi));
      setKayitlar(prev => ({ ...prev, [aktifKayit]: bilgi }));
      setAktifKayit(null); setKayitSure(0);
      Alert.alert('✅', t.kayitKaydedildi(t.kayitTipleri[aktifKayit].baslik));
    } catch (e) {
      Alert.alert(t.kayitKaydedilemedi);
      setAktifKayit(null); setKayitSure(0);
    }
  };

  const kayitCal = async (tip: KayitTip) => {
    const kayit = kayitlar[tip];
    if (!kayit) return;
    if (calananTip === tip) {
      await audioManager.stop();
      return;
    }
    try {
      await audioManager.play({ uri: kayit.uri }, SESIM_IDS[tip], 'sesim', { loop: false });
    } catch (_) { Alert.alert(t.sesCalHata); }
  };

  const kayitSil = (tip: KayitTip) => {
    Alert.alert(t.kayitSil, t.kayitSilOnay(t.kayitTipleri[tip].baslik), [
      { text: t.iptal, style: 'cancel' },
      { text: t.sil, style: 'destructive', onPress: async () => {
        await AsyncStorage.removeItem(KAYIT_KEYS[tip]);
        setKayitlar(prev => { const yeni = { ...prev }; delete yeni[tip]; return yeni; });
        if (calananTip === tip) await audioManager.stop();
      }},
    ]);
  };

  const tipler: KayitTip[] = ['ninni', 'hikaye', 'pispis'];

  return (
    <View style={styles.container}>
      <ScrollView ref={scrollViewRef} style={styles.scroll} contentContainerStyle={styles.scrollContent}>

        <View style={styles.headerKart}>
          <Text style={styles.headerIkon}>💜</Text>
          <Text style={styles.headerBaslik}>{t.sesimHeaderBaslik}</Text>
          <Text style={styles.headerAcik}>{t.sesimHeaderAcik}</Text>
          {free && (
            <View style={styles.premiumBanner}>
              <Text style={styles.premiumBannerYazi}>{t.sesimPremiumBanner}</Text>
              <TouchableOpacity style={styles.premiumBannerBtn} onPress={() => setPaywallVisible(true)}>
                <Text style={styles.premiumBannerBtnYazi}>{t.sesimPremiumBtn}</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {tipler.map((tip) => {
          const bilgi              = t.kayitTipleri[tip];
          const kayit              = kayitlar[tip];
          const buKayitYapiliyor   = aktifKayit === tip;
          const buCaliniyor        = calananTip === tip;
          const herhangiYapiliyor  = aktifKayit !== null;

          return (
            <View key={tip} style={[styles.kayitKart, free && styles.kayitKartKilitli]}>
              <View style={styles.kayitKartUst}>
                <Text style={styles.kayitIkon}>{bilgi.ikon}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.kayitBaslik}>{bilgi.baslik}</Text>
                  <Text style={styles.kayitAcik}>{bilgi.aciklama}</Text>
                </View>
                {kayit && !free ? (
                  <View style={styles.kayitliRozet}><Text style={styles.kayitliRozetYazi}>{t.kayitliRozet}</Text></View>
                ) : free ? (
                  <View style={styles.kilitRozet}><Text style={styles.kilitRozetYazi}>{t.kilitRozet}</Text></View>
                ) : null}
              </View>

              <View style={styles.ipucuKutu}>
                <Text style={styles.ipucuYazi}>💡 {bilgi.ipucu}</Text>
              </View>

              {kayit && !free && (
                <View style={styles.mevcutKayit}>
                  <Text style={styles.mevcutSure}>⏱ {formatSure(kayit.sure)}</Text>
                  <Text style={styles.mevcutTarih}>{formatTarih(kayit.tarih)}</Text>
                </View>
              )}

              {buKayitYapiliyor && (
                <View style={styles.kayitAktifKutu}>
                  <View style={styles.kayitNoktaRow}>
                    <View style={styles.kayitNokta} />
                    <Text style={styles.kayitAktifYazi}>{t.kayitYapiliyor(formatSure(kayitSure))}</Text>
                  </View>
                </View>
              )}

              <View style={styles.butonRow}>
                {buKayitYapiliyor ? (
                  <TouchableOpacity style={styles.durdurBtn} onPress={kayitDurdur}>
                    <Text style={styles.durdurBtnYazi}>{t.kayitBitir}</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    style={[styles.kayitBtn, (herhangiYapiliyor || free) && styles.kayitBtnDisabled]}
                    onPress={() => !herhangiYapiliyor && kayitBaslat(tip)}
                    disabled={herhangiYapiliyor}
                  >
                    <Text style={styles.kayitBtnYazi}>
                      {free ? t.premiumGerekli : kayit ? t.yenidenKaydet : t.kayitBaslat}
                    </Text>
                  </TouchableOpacity>
                )}

                {kayit && !buKayitYapiliyor && !free && (
                  <TouchableOpacity style={[styles.calBtn, buCaliniyor && styles.calBtnAktif]} onPress={() => kayitCal(tip)}>
                    <Text style={styles.calBtnYazi}>{buCaliniyor ? '⏹' : '▶️'}</Text>
                  </TouchableOpacity>
                )}

                {kayit && !buKayitYapiliyor && !free && (
                  <TouchableOpacity style={styles.silBtn} onPress={() => kayitSil(tip)}>
                    <Text style={styles.silBtnYazi}>🗑</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          );
        })}

        <View style={styles.bilgiKart}>
          <Text style={styles.bilgiBaslik}>{t.sesimBilgiBaslik}</Text>
          {t.sesimBilgiSatirlar.map((satir, i) => (
            <Text key={i} style={styles.bilgiSatir}>{satir}</Text>
          ))}
        </View>

      </ScrollView>

      <Paywall
        visible={paywallVisible}
        onClose={() => setPaywallVisible(false)}
        onPremium={() => { setPaywallVisible(false); premiumAktifEt(); }}
        baslik={t.paywallSesimBaslik}
        aciklama={t.paywallSesimAcik}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container:           { flex: 1, backgroundColor: '#07101e' },
  scroll:              { flex: 1 },
  scrollContent:       { padding: 16, paddingBottom: 40 },
  headerKart:          { backgroundColor: 'rgba(157,140,239,0.12)', borderRadius: 18, padding: 20, alignItems: 'center', marginBottom: 20, borderWidth: 1, borderColor: 'rgba(157,140,239,0.25)', gap: 8 },
  headerIkon:          { fontSize: 40 },
  headerBaslik:        { color: 'white', fontSize: 20, fontWeight: 'bold' },
  headerAcik:          { color: 'rgba(255,255,255,0.5)', fontSize: 13, textAlign: 'center', lineHeight: 20 },
  premiumBanner:       { backgroundColor: 'rgba(157,140,239,0.15)', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: 'rgba(157,140,239,0.3)', alignItems: 'center', gap: 8, width: '100%' },
  premiumBannerYazi:   { color: '#b8a8f8', fontSize: 12, textAlign: 'center', lineHeight: 18 },
  premiumBannerBtn:    { backgroundColor: '#9d8cef', borderRadius: 10, paddingHorizontal: 20, paddingVertical: 9 },
  premiumBannerBtnYazi:{ color: 'white', fontWeight: '700', fontSize: 13 },
  kayitKart:           { backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', gap: 12 },
  kayitKartKilitli:    { opacity: 0.75 },
  kayitKartUst:        { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  kayitIkon:           { fontSize: 28 },
  kayitBaslik:         { color: 'white', fontSize: 15, fontWeight: 'bold', marginBottom: 3 },
  kayitAcik:           { color: 'rgba(255,255,255,0.45)', fontSize: 11, lineHeight: 16 },
  kayitliRozet:        { backgroundColor: 'rgba(74,222,128,0.15)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: 'rgba(74,222,128,0.3)' },
  kayitliRozetYazi:    { color: '#4ade80', fontSize: 10, fontWeight: 'bold' },
  kilitRozet:          { backgroundColor: 'rgba(157,140,239,0.15)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: 'rgba(157,140,239,0.3)' },
  kilitRozetYazi:      { color: '#b8a8f8', fontSize: 10, fontWeight: 'bold' },
  ipucuKutu:           { backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: 10 },
  ipucuYazi:           { color: 'rgba(255,255,255,0.5)', fontSize: 11, lineHeight: 17 },
  mevcutKayit:         { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: 'rgba(74,222,128,0.08)', borderRadius: 8, padding: 8 },
  mevcutSure:          { color: '#4ade80', fontSize: 13, fontWeight: 'bold' },
  mevcutTarih:         { color: 'rgba(255,255,255,0.4)', fontSize: 11 },
  kayitAktifKutu:      { backgroundColor: 'rgba(239,68,68,0.1)', borderRadius: 10, padding: 10, borderWidth: 1, borderColor: 'rgba(239,68,68,0.3)' },
  kayitNoktaRow:       { flexDirection: 'row', alignItems: 'center', gap: 8 },
  kayitNokta:          { width: 10, height: 10, borderRadius: 5, backgroundColor: '#ef4444' },
  kayitAktifYazi:      { color: '#fca5a5', fontSize: 13, fontWeight: 'bold' },
  butonRow:            { flexDirection: 'row', gap: 8 },
  kayitBtn:            { flex: 1, backgroundColor: 'rgba(157,140,239,0.2)', borderRadius: 12, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(157,140,239,0.4)' },
  kayitBtnDisabled:    { opacity: 0.4 },
  kayitBtnYazi:        { color: '#b8a8f8', fontSize: 13, fontWeight: 'bold' },
  durdurBtn:           { flex: 1, backgroundColor: 'rgba(239,68,68,0.2)', borderRadius: 12, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(239,68,68,0.4)' },
  durdurBtnYazi:       { color: '#fca5a5', fontSize: 13, fontWeight: 'bold' },
  calBtn:              { width: 46, height: 46, borderRadius: 12, backgroundColor: 'rgba(74,222,128,0.15)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(74,222,128,0.3)' },
  calBtnAktif:         { backgroundColor: 'rgba(74,222,128,0.3)', borderColor: '#4ade80' },
  calBtnYazi:          { fontSize: 18 },
  silBtn:              { width: 46, height: 46, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.06)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  silBtnYazi:          { fontSize: 18 },
  bilgiKart:           { backgroundColor: 'rgba(157,140,239,0.08)', borderRadius: 14, padding: 16, borderWidth: 1, borderColor: 'rgba(157,140,239,0.15)', gap: 6 },
  bilgiBaslik:         { color: '#b8a8f8', fontSize: 14, fontWeight: 'bold', marginBottom: 4 },
  bilgiSatir:          { color: 'rgba(255,255,255,0.5)', fontSize: 12, lineHeight: 20 },
});
