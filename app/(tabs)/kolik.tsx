import AsyncStorage from '@react-native-async-storage/async-storage';
import { Audio } from 'expo-av';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

const beyazGurultu = [
  { id: 1, name: 'Saç Kurutma Makinesi', icon: '💨', desc: 'Klasik beyaz gürültü' },
  { id: 2, name: 'Elektrikli Süpürge', icon: '🌀', desc: 'Düzenli ve sakinleştirici' },
  { id: 3, name: 'Piş Piş', icon: '🫧', desc: 'Bebeği sakinleştiren klasik ses' },
  { id: 4, name: 'Fan Sesi', icon: '🌬️', desc: 'Hafif ve sürekli' },
];

const dogaSesleri = [
  { id: 10, name: 'Yağmur Sesi', icon: '🌧️', desc: 'Dingin yağmur damlaları', premium: false },
  { id: 11, name: 'Deniz Dalgaları', icon: '🌊', desc: 'Sahilin huzur veren sesi', premium: false },
  { id: 12, name: 'Orman Sesi', icon: '🌲', desc: 'Kuş sesleri ve yapraklar', premium: true },
  { id: 13, name: 'Şelale', icon: '💧', desc: 'Akan suyun rahatlatıcı sesi', premium: true },
];

const rahatlatici = [
  { id: 20, name: 'Kedi Mırıltısı', icon: '🐱', desc: 'Huzur veren kedi sesi', premium: false },
  { id: 21, name: 'Kalp Atışı', icon: '💗', desc: 'Anne karnındaki sıcak ses', premium: true },
  { id: 22, name: 'Nefes Egzersizi', icon: '🧘', desc: 'Sakinleştirici nefes ritmi', premium: true },
];

export default function Kolik() {
  const [annePisPisUri, setAnnePisPisUri] = useState<string | null>(null);
  const [calananId, setCalananId] = useState<number | null>(null);
  const soundRef = useRef<Audio.Sound | null>(null);

  // ✅ Önce fonksiyon
  const annePisPisYukle = async () => {
    try {
      const veri = await AsyncStorage.getItem('anne_pispis_kayit');
      if (veri) setAnnePisPisUri(JSON.parse(veri).uri);
      else setAnnePisPisUri(null);
    } catch (_) {}
  };

  // ✅ Sonra useFocusEffect
  useFocusEffect(
    useCallback(() => {
      annePisPisYukle();
      return () => { soundRef.current?.unloadAsync(); };
    }, [])
  );

  const toggleSes = async (file: any, id: number) => {
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

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>

        {/* Anne Sesiyle Pış Pış */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Anne Sesiyle Pış Pış</Text>
          <View style={styles.anneBadge}><Text style={styles.anneBadgeText}>💜 Özel</Text></View>
        </View>
        {annePisPisUri ? (
          <TouchableOpacity
            style={[styles.sesCard, styles.sesCardAnne, calananId === 999 && styles.sesCardActive]}
            onPress={() => toggleSes({ uri: annePisPisUri }, 999)}>
            <View style={[styles.sesIconBox, styles.sesIconBoxAnne]}>
              <Text style={styles.sesIcon}>💜</Text>
            </View>
            <View style={styles.sesInfo}>
              <Text style={styles.sesTitle}>Anne Sesiyle Pış Pış</Text>
              <Text style={styles.sesDesc}>Sizin sesinizle</Text>
              <View style={styles.anneTagRow}>
                <View style={styles.anneTag}><Text style={styles.anneTagText}>💜 Anne Sesi</Text></View>
              </View>
            </View>
            <Text style={styles.playBtn}>{calananId === 999 ? '⏹' : '▶️'}</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.kayitYokKart}>
            <Text style={styles.kayitYokIkon}>🎙</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.kayitYokBaslik}>Henüz kayıt yok</Text>
              <Text style={styles.kayitYokAcik}>Sesim sekmesinden "Anne Sesi Pış Pış" kaydı yapın</Text>
            </View>
          </View>
        )}

        {/* Beyaz Gürültü */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Beyaz Gürültü</Text>
          <View style={styles.freeBadge}><Text style={styles.freeBadgeText}>ÜCRETSİZ</Text></View>
        </View>
        {beyazGurultu.map((ses) => (
          <TouchableOpacity key={ses.id} style={[styles.sesCard, calananId === ses.id && styles.sesCardActive]} onPress={() => toggleSes(null, ses.id)}>
            <View style={styles.sesIconBox}><Text style={styles.sesIcon}>{ses.icon}</Text></View>
            <View style={styles.sesInfo}>
              <Text style={styles.sesTitle}>{ses.name}</Text>
              <Text style={styles.sesDesc}>{ses.desc}</Text>
            </View>
            <Text style={styles.playBtn}>{calananId === ses.id ? '⏹' : '▶️'}</Text>
          </TouchableOpacity>
        ))}

        {/* Doğa Sesleri */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Doğa Sesleri</Text>
        </View>
        {dogaSesleri.map((ses) => (
          <TouchableOpacity key={ses.id} style={[styles.sesCard, calananId === ses.id && styles.sesCardActive]} onPress={() => !ses.premium && toggleSes(null, ses.id)}>
            <View style={styles.sesIconBox}><Text style={styles.sesIcon}>{ses.icon}</Text></View>
            <View style={styles.sesInfo}>
              <Text style={styles.sesTitle}>{ses.name}</Text>
              <Text style={styles.sesDesc}>{ses.desc}</Text>
            </View>
            {ses.premium ? <View style={styles.premiumTag}><Text style={styles.premiumTagText}>👑</Text></View> : <Text style={styles.playBtn}>{calananId === ses.id ? '⏹' : '▶️'}</Text>}
          </TouchableOpacity>
        ))}

        {/* Rahatlatıcı */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Rahatlatıcı Sesler</Text>
        </View>
        {rahatlatici.map((ses) => (
          <TouchableOpacity key={ses.id} style={[styles.sesCard, calananId === ses.id && styles.sesCardActive]} onPress={() => !ses.premium && toggleSes(null, ses.id)}>
            <View style={styles.sesIconBox}><Text style={styles.sesIcon}>{ses.icon}</Text></View>
            <View style={styles.sesInfo}>
              <Text style={styles.sesTitle}>{ses.name}</Text>
              <Text style={styles.sesDesc}>{ses.desc}</Text>
            </View>
            {ses.premium ? <View style={styles.premiumTag}><Text style={styles.premiumTagText}>👑</Text></View> : <Text style={styles.playBtn}>{calananId === ses.id ? '⏹' : '▶️'}</Text>}
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
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12, marginTop: 8 },
  sectionTitle: { color: 'white', fontSize: 18, fontWeight: 'bold' },
  freeBadge: { backgroundColor: '#4ade80', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  freeBadgeText: { color: '#07101e', fontSize: 11, fontWeight: 'bold' },
  anneBadge: { backgroundColor: 'rgba(157,140,239,0.2)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: 'rgba(157,140,239,0.4)' },
  anneBadgeText: { color: '#b8a8f8', fontSize: 11, fontWeight: 'bold' },
  sesCard: { backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 14, padding: 14, flexDirection: 'row', alignItems: 'center', marginBottom: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', gap: 12 },
  sesCardAnne: { borderColor: 'rgba(157,140,239,0.3)', backgroundColor: 'rgba(157,140,239,0.08)' },
  sesCardActive: { borderColor: '#9d8cef', backgroundColor: 'rgba(157,140,239,0.15)' },
  sesIconBox: { width: 46, height: 46, backgroundColor: 'rgba(74,222,128,0.1)', borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  sesIconBoxAnne: { backgroundColor: 'rgba(157,140,239,0.2)' },
  sesIcon: { fontSize: 22 },
  sesInfo: { flex: 1 },
  sesTitle: { color: 'white', fontSize: 15, fontWeight: 'bold' },
  sesDesc: { color: 'rgba(255,255,255,0.5)', fontSize: 12, marginTop: 2 },
  anneTagRow: { flexDirection: 'row', marginTop: 4 },
  anneTag: { backgroundColor: 'rgba(157,140,239,0.15)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  anneTagText: { color: '#b8a8f8', fontSize: 11 },
  playBtn: { fontSize: 24 },
  premiumTag: { backgroundColor: 'rgba(157,140,239,0.15)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10 },
  premiumTagText: { color: '#b8a8f8', fontSize: 14 },
  kayitYokKart: { backgroundColor: 'rgba(157,140,239,0.06)', borderRadius: 14, padding: 16, flexDirection: 'row', alignItems: 'center', marginBottom: 12, borderWidth: 1, borderColor: 'rgba(157,140,239,0.15)', gap: 12 },
  kayitYokIkon: { fontSize: 28 },
  kayitYokBaslik: { color: 'rgba(255,255,255,0.6)', fontSize: 14, fontWeight: 'bold' },
  kayitYokAcik: { color: 'rgba(255,255,255,0.35)', fontSize: 11, marginTop: 3, lineHeight: 16 },
});