import AsyncStorage from '@react-native-async-storage/async-storage';
import { Audio } from 'expo-av';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

const sabitMasallar = [
  { id: 1, name: 'Ay Işığında Uyku', desc: 'Küçük bir yıldızın uyku yolculuğu', duration: '8 dk', premium: false },
  { id: 2, name: 'Bulut Bebek', desc: 'Pamuk bulutların arasında tatlı rüyalar', duration: '10 dk', premium: false },
  { id: 3, name: 'Orman Ninnicisi', desc: 'Ormanın sakin seslerinde uyuyan tavşan', duration: '12 dk', premium: true },
  { id: 4, name: 'Deniz Kızının Şarkısı', desc: 'Dalgaların ritmiyle gelen uyku', duration: '9 dk', premium: true },
  { id: 5, name: 'Yıldız Toplayıcı', desc: 'Geceleri yıldız toplayan küçük çocuk', duration: '11 dk', premium: true },
];

export default function Hikayeler() {
  const [anneHikayeUri, setAnneHikayeUri] = useState<string | null>(null);
  const [anneHikayeSure, setAnneHikayeSure] = useState<number>(0);
  const [calananId, setCalananId] = useState<number | null>(null);
  const soundRef = useRef<Audio.Sound | null>(null);

  // ✅ Önce fonksiyon
  const anneHikayesiYukle = async () => {
    try {
      const veri = await AsyncStorage.getItem('anne_hikaye_kayit');
      if (veri) {
        const kayit = JSON.parse(veri);
        setAnneHikayeUri(kayit.uri);
        setAnneHikayeSure(kayit.sure || 0);
      } else {
        setAnneHikayeUri(null);
        setAnneHikayeSure(0);
      }
    } catch (_) {}
  };

  // ✅ Sonra useFocusEffect
  useFocusEffect(
    useCallback(() => {
      anneHikayesiYukle();
      return () => { soundRef.current?.unloadAsync(); };
    }, [])
  );

  const toggleSes = async (uri: string, id: number) => {
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
      const { sound } = await Audio.Sound.createAsync({ uri }, { shouldPlay: true });
      soundRef.current = sound; setCalananId(id);
      sound.setOnPlaybackStatusUpdate((s) => { if (s.isLoaded && s.didJustFinish) { soundRef.current = null; setCalananId(null); } });
    } catch (e) { console.log('Ses hatası:', e); }
  };

  const formatSure = (s: number) => {
    const dk = Math.floor(s / 60);
    return dk > 0 ? dk + ' dk' : s + ' sn';
  };

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>

        {/* Anne Sesiyle Hikaye */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Anne Sesiyle Hikaye</Text>
          <View style={styles.anneBadge}><Text style={styles.anneBadgeText}>💜 Özel</Text></View>
        </View>
        {anneHikayeUri ? (
          <TouchableOpacity
            style={[styles.masalCard, styles.masalCardAnne, calananId === 999 && styles.masalCardActive]}
            onPress={() => toggleSes(anneHikayeUri, 999)}>
            <View style={[styles.masalIconBox, styles.masalIconBoxAnne]}>
              <Text style={styles.masalIcon}>💜</Text>
            </View>
            <View style={styles.masalInfo}>
              <Text style={styles.masalTitle}>Anne Sesiyle Hikaye</Text>
              <Text style={styles.masalDesc}>Sizin ses kaydınız</Text>
              <View style={styles.tagRow}>
                <View style={styles.tag}><Text style={styles.tagText}>{'⏱ ' + formatSure(anneHikayeSure)}</Text></View>
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
              <Text style={styles.kayitYokAcik}>Sesim sekmesinden "Anne Sesi Hikayesi" kaydı yapın</Text>
            </View>
          </View>
        )}

        {/* Uyku Masalları */}
        <Text style={styles.sectionBaslik}>Uyku Masalları</Text>
        {sabitMasallar.map((masal) => (
          <TouchableOpacity key={masal.id} style={styles.masalCard}>
            <View style={styles.masalIconBox}>
              <Text style={styles.masalIcon}>📚</Text>
            </View>
            <View style={styles.masalInfo}>
              <Text style={styles.masalTitle}>{masal.name}</Text>
              <Text style={styles.masalDesc}>{masal.desc}</Text>
              <View style={styles.tagRow}>
                <View style={styles.tag}><Text style={styles.tagText}>{'⏱ ' + masal.duration}</Text></View>
                {masal.premium
                  ? <View style={styles.premiumTag}><Text style={styles.premiumTagText}>👑 Premium</Text></View>
                  : <View style={styles.freeTag}><Text style={styles.freeTagText}>✅ ÜCRETSİZ</Text></View>}
              </View>
            </View>
            <Text style={styles.playBtn}>{masal.premium ? '🔒' : '▶️'}</Text>
          </TouchableOpacity>
        ))}

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#07101e' },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingTop: 16, paddingBottom: 30 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  sectionBaslik: { color: 'white', fontSize: 20, fontWeight: 'bold', marginBottom: 16, marginTop: 8 },
  sectionTitle: { color: 'white', fontSize: 20, fontWeight: 'bold' },
  anneBadge: { backgroundColor: 'rgba(157,140,239,0.2)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: 'rgba(157,140,239,0.4)' },
  anneBadgeText: { color: '#b8a8f8', fontSize: 11, fontWeight: 'bold' },
  masalCard: { backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 14, padding: 14, flexDirection: 'row', alignItems: 'center', marginBottom: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', gap: 12 },
  masalCardAnne: { borderColor: 'rgba(157,140,239,0.3)', backgroundColor: 'rgba(157,140,239,0.08)' },
  masalCardActive: { borderColor: '#9d8cef', backgroundColor: 'rgba(157,140,239,0.15)' },
  masalIconBox: { width: 48, height: 48, backgroundColor: 'rgba(157,140,239,0.15)', borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  masalIconBoxAnne: { backgroundColor: 'rgba(157,140,239,0.25)' },
  masalIcon: { fontSize: 24 },
  masalInfo: { flex: 1 },
  masalTitle: { color: 'white', fontSize: 15, fontWeight: 'bold' },
  masalDesc: { color: 'rgba(255,255,255,0.5)', fontSize: 12, marginTop: 2 },
  tagRow: { flexDirection: 'row', gap: 6, marginTop: 6, flexWrap: 'wrap' },
  tag: { backgroundColor: 'rgba(255,255,255,0.08)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  tagText: { color: 'rgba(255,255,255,0.5)', fontSize: 11 },
  premiumTag: { backgroundColor: 'rgba(157,140,239,0.15)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  premiumTagText: { color: '#b8a8f8', fontSize: 11 },
  freeTag: { backgroundColor: 'rgba(74,222,128,0.15)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  freeTagText: { color: '#4ade80', fontSize: 11 },
  anneTag: { backgroundColor: 'rgba(157,140,239,0.15)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  anneTagText: { color: '#b8a8f8', fontSize: 11 },
  playBtn: { fontSize: 24 },
  kayitYokKart: { backgroundColor: 'rgba(157,140,239,0.06)', borderRadius: 14, padding: 16, flexDirection: 'row', alignItems: 'center', marginBottom: 16, borderWidth: 1, borderColor: 'rgba(157,140,239,0.15)', gap: 12 },
  kayitYokIkon: { fontSize: 28 },
  kayitYokBaslik: { color: 'rgba(255,255,255,0.6)', fontSize: 14, fontWeight: 'bold' },
  kayitYokAcik: { color: 'rgba(255,255,255,0.35)', fontSize: 11, marginTop: 3, lineHeight: 16 },
});