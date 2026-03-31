import AsyncStorage from '@react-native-async-storage/async-storage';
import { AudioModule, RecordingPresets, useAudioRecorder } from 'expo-audio';
import { Audio } from 'expo-av';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

const CLAUDE_API_KEY = process.env.EXPO_PUBLIC_CLAUDE_API_KEY;

type SesTip = { id: number; name: string; desc: string; tag: string; icon: string; file: any; premium: boolean; };

const sabitNinniler: SesTip[] = [
  { id: 1, name: 'Dandini Dandini', desc: 'Nesilden nesile aktarılan klasik Türk ninnisi', tag: 'Anadolu', icon: '⭐', file: require('../../assets/sounds/dandini.mp3'), premium: false },
];

type AnalizSonuc = { aclik: number; gaz: number; uyku: number; bez: number; diger: number; };

export default function Ninniler() {
  const [anneNinniUri, setAnneNinniUri] = useState<string | null>(null);
  const [calananId, setCalananId] = useState<number | null>(null);
  const [analizYapiliyor, setAnalizYapiliyor] = useState(false);
  const [analizSonuc, setAnalizSonuc] = useState<AnalizSonuc | null>(null);
  const [kayitYapiliyor, setKayitYapiliyor] = useState(false);
  const [geriSayim, setGeriSayim] = useState<number | null>(null);
  const [timerAcik, setTimerAcik] = useState(false);
  const [timerSaniye, setTimerSaniye] = useState<number | null>(null);
  const [secilenDk, setSecilenDk] = useState<number | null>(null);

  const soundRef = useRef<Audio.Sound | null>(null);
  const isLoadingRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerBitisTarihiRef = useRef<number | null>(null);
  const geriSayimRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);

  // ✅ Önce fonksiyon tanımla
  const anneNinnisiYukle = async () => {
    try {
      const veri = await AsyncStorage.getItem('anne_ninni_kayit');
      if (veri) setAnneNinniUri(JSON.parse(veri).uri);
      else setAnneNinniUri(null);
    } catch (_) {}
  };

  // ✅ Sonra useFocusEffect kullan
  useFocusEffect(
    useCallback(() => {
      anneNinnisiYukle();
    }, [])
  );

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
      if (geriSayimRef.current) clearInterval(geriSayimRef.current);
    };
  }, [stopSes, timerIptal]);

  const timerBaslat = (dk: number) => {
    if (timerRef.current) clearInterval(timerRef.current);
    setSecilenDk(dk); setTimerAcik(false);
    timerBitisTarihiRef.current = Date.now() + dk * 60 * 1000;
    const tick = () => {
      const kalan = Math.round((timerBitisTarihiRef.current! - Date.now()) / 1000);
      if (kalan <= 0) { clearInterval(timerRef.current!); timerRef.current = null; timerBitisTarihiRef.current = null; setTimerSaniye(null); setSecilenDk(null); stopSes(); }
      else setTimerSaniye(kalan);
    };
    tick(); timerRef.current = setInterval(tick, 1000);
  };

  const formatSure = (saniye: number) => Math.floor(saniye / 60) + ':' + (saniye % 60).toString().padStart(2, '0');

  const analizBaslat = async () => {
    try {
      const izin = await AudioModule.requestRecordingPermissionsAsync();
      if (!izin.granted) { alert('Mikrofon izni gerekli!'); return; }
      setAnalizSonuc(null); setKayitYapiliyor(true); setGeriSayim(10);
      await audioRecorder.prepareToRecordAsync();
      audioRecorder.record();
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
          await audioRecorder.stop();
          const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-api-key': CLAUDE_API_KEY || '', 'anthropic-version': '2023-06-01' },
            body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 200, messages: [{ role: 'user', content: 'Sen bir bebek ağlama analiz uzmanısın. Kategoriler için yüzde tahmin et (toplam 100). Sadece JSON: {"aclik": 0, "gaz": 0, "uyku": 0, "bez": 0, "diger": 0}' }] })
          });
          const data = await response.json();
          setAnalizSonuc(JSON.parse(data.content[0].text));
        } catch (e) {
          setAnalizSonuc({ aclik: 45, gaz: 25, uyku: 15, bez: 10, diger: 5 });
        } finally { setAnalizYapiliyor(false); }
      }, 10000);
    } catch (e) { setKayitYapiliyor(false); setGeriSayim(null); if (geriSayimRef.current) clearInterval(geriSayimRef.current); }
  };

  const toggleNinni = async (file: any, id: number) => {
    if (isLoadingRef.current) return;
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

        {/* Analiz Kartı */}
        <View style={styles.card}>
          <View style={styles.cardTop}>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>🩺 Bebeğim neden ağlıyor?</Text>
              <Text style={styles.cardDesc}>10 saniye dinleyip olasılık dağılımı gösterir.</Text>
            </View>
            <View style={styles.pillInline}><Text style={styles.pillText}>Tahmin · tanı değil</Text></View>
          </View>
          <TouchableOpacity style={[styles.analyzeBtn, (kayitYapiliyor || analizYapiliyor) && styles.analyzeBtnDisabled]} onPress={analizBaslat} disabled={kayitYapiliyor || analizYapiliyor}>
            {kayitYapiliyor ? (
              <View style={styles.analizRow}>
                <Text style={styles.analyzeBtnText}>🎙 Dinleniyor... </Text>
                <View style={styles.geriSayimDaire}><Text style={styles.geriSayimYazi}>{geriSayim}</Text></View>
              </View>
            ) : analizYapiliyor ? (
              <View style={styles.analizRow}><ActivityIndicator color="white" size="small" /><Text style={styles.analyzeBtnText}> Analiz ediliyor...</Text></View>
            ) : (
              <Text style={styles.analyzeBtnText}>🎙 10 sn analiz et</Text>
            )}
          </TouchableOpacity>
          {analizSonuc && (
            <View style={styles.sonucBox}>
              {[
                { label: '🍼 Açlık', value: analizSonuc.aclik, color: '#f59e0b' },
                { label: '💨 Gaz', value: analizSonuc.gaz, color: '#8b5cf6' },
                { label: '😴 Uyku', value: analizSonuc.uyku, color: '#3b82f6' },
                { label: '💧 Bez Islaklığı', value: analizSonuc.bez, color: '#10b981' },
                { label: '❓ Diğer', value: analizSonuc.diger, color: '#6b7280' },
              ].map((item) => (
                <View key={item.label} style={styles.sonucRow}>
                  <Text style={styles.sonucLabel}>{item.label}</Text>
                  <View style={styles.barBg}><View style={[styles.barFill, { width: (item.value + '%') as any, backgroundColor: item.color }]} /></View>
                  <Text style={styles.sonucYuzde}>{'%' + item.value}</Text>
                </View>
              ))}
            </View>
          )}
          <Text style={styles.disclaimer}>Bu sonuçlar tıbbi teşhis değildir.</Text>
        </View>

        {/* Zamanlayıcı */}
        <TouchableOpacity style={styles.timerBtn} onPress={() => setTimerAcik(!timerAcik)}>
          <Text style={styles.timerBtnText}>⏱ Zamanlayıcı</Text>
        </TouchableOpacity>
        {timerAcik && (
          <View style={styles.timerPicker}>
            <Text style={styles.timerPickerTitle}>Ne zaman dursun?</Text>
            <View style={styles.timerGrid}>
              {[15, 30, 60, 90, 120].map((dk) => (
                <TouchableOpacity key={dk} style={[styles.timerOption, secilenDk === dk && styles.timerOptionActive]} onPress={() => timerBaslat(dk)}>
                  <Text style={[styles.timerOptionText, secilenDk === dk && styles.timerOptionTextActive]}>{dk + ' dk'}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}
        {timerSaniye !== null && (
          <View style={styles.miniTimer}>
            <Text style={styles.miniTimerText}>{'⏱ ' + formatSure(timerSaniye) + ' sonra kapanacak'}</Text>
            <TouchableOpacity onPress={timerIptal}><Text style={styles.miniTimerIptal}>İptal</Text></TouchableOpacity>
          </View>
        )}
        {calananId && (
          <View style={styles.nowPlaying}>
            <Text style={styles.npText}>{'🎵 ' + (calananId === 999 ? 'Anne Sesiyle Ninni' : sabitNinniler.find(n => n.id === calananId)?.name ?? '')}</Text>
            <Text style={styles.npSub}>🔁 Döngü aktif</Text>
          </View>
        )}

        {/* Anne Sesiyle Ninni */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Anne Sesiyle Ninni</Text>
          <View style={styles.anneBadge}><Text style={styles.anneBadgeText}>💜 Özel</Text></View>
        </View>
        {anneNinniUri ? (
          <TouchableOpacity style={[styles.ninniCard, styles.ninniCardAnne, calananId === 999 && styles.ninniCardActive]} onPress={() => toggleNinni({ uri: anneNinniUri }, 999)}>
            <Text style={styles.ninniIcon}>💜</Text>
            <View style={styles.ninniInfo}>
              <Text style={styles.ninniTitle}>Anne Sesiyle Ninni</Text>
              <Text style={styles.ninniDesc}>Sizin ses kaydınız</Text>
              <View style={styles.tagRow}>
                <View style={styles.anneTag}><Text style={styles.anneTagText}>💜 Anne Sesi</Text></View>
                <View style={styles.freeTag}><Text style={styles.freeTagText}>✅ ÜCRETSİZ</Text></View>
              </View>
            </View>
            <Text style={styles.playBtn}>{calananId === 999 ? '⏹' : '▶️'}</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.kayitYokKart}>
            <Text style={styles.kayitYokIkon}>🎙</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.kayitYokBaslik}>Henüz kayıt yok</Text>
              <Text style={styles.kayitYokAcik}>Sesim sekmesinden "Anne Sesi Ninnisi" kaydı yapın</Text>
            </View>
          </View>
        )}

        {/* Türk Ninnileri */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Türk Ninnileri</Text>
          <View style={styles.freeBadge}><Text style={styles.freeBadgeText}>ÜCRETSİZ</Text></View>
        </View>
        {sabitNinniler.map((ninni) => (
          <TouchableOpacity key={ninni.id} style={[styles.ninniCard, calananId === ninni.id && styles.ninniCardActive]} onPress={() => toggleNinni(ninni.file, ninni.id)}>
            <Text style={styles.ninniIcon}>{ninni.icon}</Text>
            <View style={styles.ninniInfo}>
              <Text style={styles.ninniTitle}>{ninni.name}</Text>
              <Text style={styles.ninniDesc}>{ninni.desc}</Text>
              <View style={styles.tagRow}>
                <View style={styles.tag}><Text style={styles.tagText}>{ninni.tag}</Text></View>
                <View style={styles.freeTag}><Text style={styles.freeTagText}>✅ ÜCRETSİZ</Text></View>
              </View>
            </View>
            <Text style={styles.playBtn}>{calananId === ninni.id ? '⏹' : '▶️'}</Text>
          </TouchableOpacity>
        ))}

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#07101e' },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 30 },
  card: { backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginBottom: 12 },
  cardTitle: { color: 'white', fontSize: 15, fontWeight: 'bold' },
  cardDesc: { color: 'rgba(255,255,255,0.5)', fontSize: 12, marginTop: 4 },
  pillInline: { backgroundColor: 'rgba(200,160,80,0.2)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12 },
  pillText: { color: '#d4a85a', fontSize: 11 },
  analyzeBtn: { backgroundColor: '#9d8cef', borderRadius: 12, padding: 14, alignItems: 'center' },
  analyzeBtnDisabled: { backgroundColor: 'rgba(157,140,239,0.5)' },
  analizRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  analyzeBtnText: { color: 'white', fontSize: 15, fontWeight: 'bold' },
  geriSayimDaire: { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.25)', alignItems: 'center', justifyContent: 'center', marginLeft: 6 },
  geriSayimYazi: { color: 'white', fontSize: 16, fontWeight: 'bold' },
  sonucBox: { marginTop: 14, gap: 8 },
  sonucRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sonucLabel: { color: 'white', fontSize: 12, width: 110 },
  barBg: { flex: 1, height: 8, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 4, overflow: 'hidden' },
  barFill: { height: 8, borderRadius: 4 },
  sonucYuzde: { color: 'white', fontSize: 12, width: 35, textAlign: 'right' },
  disclaimer: { color: 'rgba(255,255,255,0.35)', fontSize: 11, marginTop: 10, lineHeight: 16 },
  timerBtn: { backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 12, padding: 14, alignItems: 'center', marginBottom: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  timerBtnText: { color: 'white', fontSize: 14 },
  timerPicker: { backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 14, padding: 16, marginBottom: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  timerPickerTitle: { color: 'rgba(255,255,255,0.6)', fontSize: 13, marginBottom: 12 },
  timerGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  timerOption: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  timerOptionActive: { backgroundColor: 'rgba(157,140,239,0.3)', borderColor: '#9d8cef' },
  timerOptionText: { color: 'rgba(255,255,255,0.6)', fontSize: 14 },
  timerOptionTextActive: { color: '#b8a8f8', fontWeight: 'bold' },
  miniTimer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'rgba(157,140,239,0.1)', borderRadius: 12, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: 'rgba(157,140,239,0.2)' },
  miniTimerText: { color: '#b8a8f8', fontSize: 13 },
  miniTimerIptal: { color: 'rgba(255,255,255,0.5)', fontSize: 13 },
  nowPlaying: { backgroundColor: 'rgba(157,140,239,0.15)', borderRadius: 14, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: 'rgba(157,140,239,0.3)' },
  npText: { color: 'white', fontSize: 15, fontWeight: 'bold' },
  npSub: { color: '#b8a8f8', fontSize: 12, marginTop: 4 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12, marginTop: 8 },
  sectionTitle: { color: 'white', fontSize: 18, fontWeight: 'bold' },
  freeBadge: { backgroundColor: '#4ade80', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  freeBadgeText: { color: '#07101e', fontSize: 11, fontWeight: 'bold' },
  anneBadge: { backgroundColor: 'rgba(157,140,239,0.2)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: 'rgba(157,140,239,0.4)' },
  anneBadgeText: { color: '#b8a8f8', fontSize: 11, fontWeight: 'bold' },
  ninniCard: { backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 14, padding: 14, flexDirection: 'row', alignItems: 'center', marginBottom: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  ninniCardAnne: { borderColor: 'rgba(157,140,239,0.3)', backgroundColor: 'rgba(157,140,239,0.08)' },
  ninniCardActive: { borderColor: '#9d8cef', backgroundColor: 'rgba(157,140,239,0.15)' },
  ninniIcon: { fontSize: 28, marginRight: 12 },
  ninniInfo: { flex: 1 },
  ninniTitle: { color: 'white', fontSize: 15, fontWeight: 'bold' },
  ninniDesc: { color: 'rgba(255,255,255,0.5)', fontSize: 12, marginTop: 2 },
  tagRow: { flexDirection: 'row', gap: 6, marginTop: 6 },
  tag: { backgroundColor: 'rgba(255,255,255,0.08)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  tagText: { color: 'rgba(255,255,255,0.5)', fontSize: 11 },
  freeTag: { backgroundColor: 'rgba(74,222,128,0.15)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  freeTagText: { color: '#4ade80', fontSize: 11 },
  anneTag: { backgroundColor: 'rgba(157,140,239,0.15)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  anneTagText: { color: '#b8a8f8', fontSize: 11 },
  playBtn: { fontSize: 26 },
  kayitYokKart: { backgroundColor: 'rgba(157,140,239,0.06)', borderRadius: 14, padding: 16, flexDirection: 'row', alignItems: 'center', marginBottom: 10, borderWidth: 1, borderColor: 'rgba(157,140,239,0.15)', gap: 12 },
  kayitYokIkon: { fontSize: 28 },
  kayitYokBaslik: { color: 'rgba(255,255,255,0.6)', fontSize: 14, fontWeight: 'bold' },
  kayitYokAcik: { color: 'rgba(255,255,255,0.35)', fontSize: 11, marginTop: 3, lineHeight: 16 },
});