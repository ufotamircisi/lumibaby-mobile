import AsyncStorage from '@react-native-async-storage/async-storage';
import { AudioModule, RecordingPresets, useAudioRecorder } from 'expo-audio';
import { Audio } from 'expo-av';
import React, { useEffect, useRef, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

type KayitTip = 'ninni' | 'hikaye' | 'pispis';

type KayitBilgi = {
  uri: string;
  sure: number;
  tarih: string;
};

const KAYIT_KEYS: Record<KayitTip, string> = {
  ninni: 'anne_ninni_kayit',
  hikaye: 'anne_hikaye_kayit',
  pispis: 'anne_pispis_kayit',
};

const KAYIT_BILGI: Record<KayitTip, { baslik: string; ikon: string; aciklama: string; ipucu: string }> = {
  ninni: {
    baslik: 'Anne Sesi Ninnisi',
    ikon: '🎵',
    aciklama: 'Ninniler bölümünde "Anne Sesi" olarak görünür ve dedektörde çalar',
    ipucu: 'Yumuşak ve sakin bir sesle ninni söyleyin. Tekrar eden melodiler daha iyi çalışır.',
  },
  hikaye: {
    baslik: 'Anne Sesi Hikayesi',
    ikon: '📖',
    aciklama: 'Hikayeler bölümünde "Anne Sesi Hikayesi" olarak görünür',
    ipucu: 'Kitap okur gibi sakin ve akıcı bir tonla anlatın.',
  },
  pispis: {
    baslik: 'Anne Sesi Pış Pış',
    ikon: '🤫',
    aciklama: 'Kolik bölümünde "Anne Sesi Pış Pış" olarak görünür ve dedektörde çalar',
    ipucu: '"Pışşş... pışşş... sakin ol yavrucuğum..." gibi sakinleştirici sesler kaydedin.',
  },
};

export default function Sesim() {
  const [aktifKayit, setAktifKayit] = useState<KayitTip | null>(null);
  const [kayitSure, setKayitSure] = useState(0);
  const [kayitlar, setKayitlar] = useState<Partial<Record<KayitTip, KayitBilgi>>>({});
  const [calananTip, setCalananTip] = useState<KayitTip | null>(null);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const soundRef = useRef<Audio.Sound | null>(null);

  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);

  useEffect(() => {
    kayitlariYukle();
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      soundRef.current?.unloadAsync();
    };
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
    const izin = await AudioModule.requestRecordingPermissionsAsync();
    if (!izin.granted) { Alert.alert('İzin gerekli', 'Mikrofon izni vermeniz gerekiyor.'); return; }

    // Çalan ses varsa durdur
    if (soundRef.current) {
      try { await soundRef.current.stopAsync(); await soundRef.current.unloadAsync(); } catch (_) {}
      soundRef.current = null;
      setCalananTip(null);
    }

    try {
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      await audioRecorder.prepareToRecordAsync();
      audioRecorder.record();
      setAktifKayit(tip);
      setKayitSure(0);
      timerRef.current = setInterval(() => setKayitSure(s => s + 1), 1000);
    } catch (e) {
      Alert.alert('Hata', 'Kayıt başlatılamadı.');
    }
  };

  const kayitDurdur = async () => {
    if (!aktifKayit) return;
    if (timerRef.current) clearInterval(timerRef.current);

    try {
      await audioRecorder.stop();
      const uri = audioRecorder.uri;
      if (!uri) { setAktifKayit(null); setKayitSure(0); return; }

      const bilgi: KayitBilgi = {
        uri,
        sure: kayitSure,
        tarih: new Date().toISOString(),
      };

      await AsyncStorage.setItem(KAYIT_KEYS[aktifKayit], JSON.stringify(bilgi));
      setKayitlar(prev => ({ ...prev, [aktifKayit]: bilgi }));
      setAktifKayit(null);
      setKayitSure(0);
      Alert.alert('✅ Kaydedildi!', KAYIT_BILGI[aktifKayit].baslik + ' başarıyla kaydedildi.');
    } catch (e) {
      Alert.alert('Hata', 'Kayıt kaydedilemedi.');
      setAktifKayit(null);
      setKayitSure(0);
    }
  };

  const kayitCal = async (tip: KayitTip) => {
    const kayit = kayitlar[tip];
    if (!kayit) return;

    if (calananTip === tip) {
      // Zaten çalıyorsa durdur
      try { await soundRef.current?.stopAsync(); await soundRef.current?.unloadAsync(); } catch (_) {}
      soundRef.current = null;
      setCalananTip(null);
      return;
    }

    // Başka ses çalıyorsa durdur
    if (soundRef.current) {
      try { await soundRef.current.stopAsync(); await soundRef.current.unloadAsync(); } catch (_) {}
      soundRef.current = null;
    }

    try {
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true });
      const { sound } = await Audio.Sound.createAsync(
        { uri: kayit.uri },
        { shouldPlay: true }
      );
      soundRef.current = sound;
      setCalananTip(tip);
      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) {
          soundRef.current = null;
          setCalananTip(null);
        }
      });
    } catch (e) {
      Alert.alert('Hata', 'Ses çalınamadı.');
      setCalananTip(null);
    }
  };

  const kayitSil = (tip: KayitTip) => {
    Alert.alert(
      'Kaydı Sil',
      KAYIT_BILGI[tip].baslik + ' kaydını silmek istiyor musunuz?',
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Sil',
          style: 'destructive',
          onPress: async () => {
            await AsyncStorage.removeItem(KAYIT_KEYS[tip]);
            setKayitlar(prev => {
              const yeni = { ...prev };
              delete yeni[tip];
              return yeni;
            });
            if (calananTip === tip) {
              try { await soundRef.current?.stopAsync(); } catch (_) {}
              soundRef.current = null;
              setCalananTip(null);
            }
          },
        },
      ]
    );
  };

  const tipler: KayitTip[] = ['ninni', 'hikaye', 'pispis'];

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>

        {/* Başlık */}
        <View style={styles.headerKart}>
          <Text style={styles.headerIkon}>💜</Text>
          <Text style={styles.headerBaslik}>Anne Sesi Kaydı</Text>
          <Text style={styles.headerAcik}>
            Sesinizi kaydedin. Bebeğiniz ağladığında kendi sesiniz çalsın.
          </Text>
        </View>

        {/* 3 Kayıt Bölümü */}
        {tipler.map((tip) => {
          const bilgi = KAYIT_BILGI[tip];
          const kayit = kayitlar[tip];
          const buKayitYapiliyor = aktifKayit === tip;
          const buCaliniyor = calananTip === tip;
          const herhangiKayitYapiliyor = aktifKayit !== null;

          return (
            <View key={tip} style={styles.kayitKart}>
              {/* Başlık */}
              <View style={styles.kayitKartUst}>
                <Text style={styles.kayitIkon}>{bilgi.ikon}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.kayitBaslik}>{bilgi.baslik}</Text>
                  <Text style={styles.kayitAcik}>{bilgi.aciklama}</Text>
                </View>
                {kayit && (
                  <View style={styles.kayitliRozet}>
                    <Text style={styles.kayitliRozetYazi}>✓ Kayıtlı</Text>
                  </View>
                )}
              </View>

              {/* İpucu */}
              <View style={styles.ipucuKutu}>
                <Text style={styles.ipucuYazi}>💡 {bilgi.ipucu}</Text>
              </View>

              {/* Mevcut Kayıt Bilgisi */}
              {kayit && (
                <View style={styles.mevcutKayit}>
                  <Text style={styles.mevcutSure}>⏱ {formatSure(kayit.sure)}</Text>
                  <Text style={styles.mevcutTarih}>{formatTarih(kayit.tarih)}</Text>
                </View>
              )}

              {/* Kayıt Aktifse Timer */}
              {buKayitYapiliyor && (
                <View style={styles.kayitAktifKutu}>
                  <View style={styles.kayitNoktaRow}>
                    <View style={styles.kayitNokta} />
                    <Text style={styles.kayitAktifYazi}>Kayıt yapılıyor... {formatSure(kayitSure)}</Text>
                  </View>
                </View>
              )}

              {/* Butonlar */}
              <View style={styles.butonRow}>
                {/* Kayıt Başlat / Durdur */}
                {buKayitYapiliyor ? (
                  <TouchableOpacity style={styles.durdurBtn} onPress={kayitDurdur}>
                    <Text style={styles.durdurBtnYazi}>⏹ Kaydı Bitir</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    style={[styles.kayitBtn, herhangiKayitYapiliyor && styles.kayitBtnDisabled]}
                    onPress={() => !herhangiKayitYapiliyor && kayitBaslat(tip)}
                    disabled={herhangiKayitYapiliyor}>
                    <Text style={styles.kayitBtnYazi}>
                      {kayit ? '🔄 Yeniden Kaydet' : '🎙 Kayıt Başlat'}
                    </Text>
                  </TouchableOpacity>
                )}

                {/* Çal / Durdur */}
                {kayit && !buKayitYapiliyor && (
                  <TouchableOpacity
                    style={[styles.calBtn, buCaliniyor && styles.calBtnAktif]}
                    onPress={() => kayitCal(tip)}>
                    <Text style={styles.calBtnYazi}>{buCaliniyor ? '⏹' : '▶️'}</Text>
                  </TouchableOpacity>
                )}

                {/* Sil */}
                {kayit && !buKayitYapiliyor && (
                  <TouchableOpacity style={styles.silBtn} onPress={() => kayitSil(tip)}>
                    <Text style={styles.silBtnYazi}>🗑</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          );
        })}

        {/* Nasıl Çalışır */}
        <View style={styles.bilgiKart}>
          <Text style={styles.bilgiBaslik}>ℹ️ Nasıl Çalışır?</Text>
          <Text style={styles.bilgiSatir}>• Ninni kaydınız → Ninniler ekranında "Anne Sesi" olarak görünür</Text>
          <Text style={styles.bilgiSatir}>• Ninni & Pış Pış kaydı → Dedektörde bebek ağlayınca otomatik çalar</Text>
          <Text style={styles.bilgiSatir}>• Hikaye kaydınız → Hikayeler ekranında dinlenebilir</Text>
          <Text style={styles.bilgiSatir}>• İstediğiniz zaman yeniden kayıt yapabilirsiniz</Text>
        </View>

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#07101e' },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 40 },

  headerKart: { backgroundColor: 'rgba(157,140,239,0.12)', borderRadius: 18, padding: 20, alignItems: 'center', marginBottom: 20, borderWidth: 1, borderColor: 'rgba(157,140,239,0.25)', gap: 8 },
  headerIkon: { fontSize: 40 },
  headerBaslik: { color: 'white', fontSize: 20, fontWeight: 'bold' },
  headerAcik: { color: 'rgba(255,255,255,0.5)', fontSize: 13, textAlign: 'center', lineHeight: 20 },

  kayitKart: { backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', gap: 12 },
  kayitKartUst: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  kayitIkon: { fontSize: 28 },
  kayitBaslik: { color: 'white', fontSize: 15, fontWeight: 'bold', marginBottom: 3 },
  kayitAcik: { color: 'rgba(255,255,255,0.45)', fontSize: 11, lineHeight: 16 },
  kayitliRozet: { backgroundColor: 'rgba(74,222,128,0.15)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: 'rgba(74,222,128,0.3)' },
  kayitliRozetYazi: { color: '#4ade80', fontSize: 10, fontWeight: 'bold' },

  ipucuKutu: { backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: 10 },
  ipucuYazi: { color: 'rgba(255,255,255,0.5)', fontSize: 11, lineHeight: 17 },

  mevcutKayit: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: 'rgba(74,222,128,0.08)', borderRadius: 8, padding: 8 },
  mevcutSure: { color: '#4ade80', fontSize: 13, fontWeight: 'bold' },
  mevcutTarih: { color: 'rgba(255,255,255,0.4)', fontSize: 11 },

  kayitAktifKutu: { backgroundColor: 'rgba(239,68,68,0.1)', borderRadius: 10, padding: 10, borderWidth: 1, borderColor: 'rgba(239,68,68,0.3)' },
  kayitNoktaRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  kayitNokta: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#ef4444' },
  kayitAktifYazi: { color: '#fca5a5', fontSize: 13, fontWeight: 'bold' },

  butonRow: { flexDirection: 'row', gap: 8 },
  kayitBtn: { flex: 1, backgroundColor: 'rgba(157,140,239,0.2)', borderRadius: 12, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(157,140,239,0.4)' },
  kayitBtnDisabled: { opacity: 0.4 },
  kayitBtnYazi: { color: '#b8a8f8', fontSize: 13, fontWeight: 'bold' },
  durdurBtn: { flex: 1, backgroundColor: 'rgba(239,68,68,0.2)', borderRadius: 12, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(239,68,68,0.4)' },
  durdurBtnYazi: { color: '#fca5a5', fontSize: 13, fontWeight: 'bold' },
  calBtn: { width: 46, height: 46, borderRadius: 12, backgroundColor: 'rgba(74,222,128,0.15)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(74,222,128,0.3)' },
  calBtnAktif: { backgroundColor: 'rgba(74,222,128,0.3)', borderColor: '#4ade80' },
  calBtnYazi: { fontSize: 18 },
  silBtn: { width: 46, height: 46, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.06)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  silBtnYazi: { fontSize: 18 },

  bilgiKart: { backgroundColor: 'rgba(157,140,239,0.08)', borderRadius: 14, padding: 16, borderWidth: 1, borderColor: 'rgba(157,140,239,0.15)', gap: 6 },
  bilgiBaslik: { color: '#b8a8f8', fontSize: 14, fontWeight: 'bold', marginBottom: 4 },
  bilgiSatir: { color: 'rgba(255,255,255,0.5)', fontSize: 12, lineHeight: 20 },
});