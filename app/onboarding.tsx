import { router } from 'expo-router';
import React, { useState } from 'react';
import { Platform, SafeAreaView, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export default function Onboarding() {
  const [step, setStep] = useState(0);
  const [lang, setLang] = useState('tr');

  const slides = [
    {
      emoji: '🌙',
      title: 'Dilini seç',
      desc: 'Uygulamayı Türkçe ya da English olarak başlat.',
    },
    {
      emoji: '🩺',
      title: 'Ağlamayı daha iyi anla',
      desc: '10 saniyelik dinleme ile ağlamayı olasılık olarak yorumla.',
      cards: [
        { title: 'Açlık mı?', desc: 'Önce en olası nedeni gösterir.' },
        { title: 'Tek dokunuşla çözüm', desc: 'Sonuçtan sonra ninni veya rahatlatıcı ses başlat.' },
      ],
    },
    {
      emoji: '🎙️',
      title: 'Kendi sesinle uyut',
      desc: 'Ses kaydı al, klonunu hazırla ve bebeğin ninnileri senin sesinle dinlesin.',
      cards: [
        { title: 'Ses kaydı', desc: 'Sessiz ortamda yaklaşık 1 dakika önerilir.' },
        { title: 'Kişisel bağ', desc: 'İsimle hitap edilen ninniler daha sıcak hissettirir.' },
      ],
    },
    {
      emoji: '🌙',
      title: 'Gece Takibi',
      desc: 'Anne başlatır, uygulama geceyi takip eder, sabah rapor verir.',
      cards: [
        { title: '😴 Bebeğim Uyudu', desc: 'Butona bas, oturum başlar.' },
        { title: '🎙 Dedektör seç', desc: 'Ağlama veya kolik dedektörünü seç.' },
        { title: '📊 Gece takibi', desc: 'Uygulama gece boyu izler ve rapor tutar.' },
        { title: '🌅 Sabah özeti', desc: 'Bebeğim Uyandı ile gece özeti gelir.' },
      ],
    },
  ];

  const current = slides[step];

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea}>

        {/* Dil Seçimi - Sadece ilk adımda */}
        {step === 0 && (
          <View style={styles.langRow}>
            <TouchableOpacity
              style={[styles.langBtn, lang === 'tr' && styles.langBtnActive]}
              onPress={() => setLang('tr')}>
              <Text style={styles.langBtnText}>🇹🇷 Türkçe</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.langBtn, lang === 'en' && styles.langBtnActive]}
              onPress={() => setLang('en')}>
              <Text style={styles.langBtnText}>🇬🇧 English</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Dots */}
        <View style={styles.dots}>
          {slides.map((_, i) => (
            <View key={i} style={[styles.dot, i === step && styles.dotActive]} />
          ))}
        </View>

        {/* İçerik */}
        <View style={styles.content}>
          <Text style={styles.emoji}>{current.emoji}</Text>
          <Text style={styles.title}>{current.title}</Text>
          <Text style={styles.desc}>{current.desc}</Text>

          {current.cards && (
            <View style={styles.cards}>
              {current.cards.map((card) => (
                <View key={card.title} style={styles.card}>
                  <Text style={styles.cardTitle}>{card.title}</Text>
                  <Text style={styles.cardDesc}>{card.desc}</Text>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Butonlar */}
        <View style={styles.buttons}>
          {step > 0 && (
            <TouchableOpacity style={styles.backBtn} onPress={() => setStep(step - 1)}>
              <Text style={styles.backBtnText}>Geri</Text>
            </TouchableOpacity>
          )}
          {step < slides.length - 1 ? (
            <TouchableOpacity style={styles.nextBtn} onPress={() => setStep(step + 1)}>
              <Text style={styles.nextBtnText}>İleri</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.nextBtn} onPress={() => router.replace('/')}>
              <Text style={styles.nextBtnText}>Başla 🚀</Text>
            </TouchableOpacity>
          )}
        </View>

      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#07101e' },
  safeArea: { flex: 1, paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0, padding: 24 },
  langRow: { flexDirection: 'row', gap: 12, marginBottom: 24 },
  langBtn: { flex: 1, padding: 12, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.06)', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  langBtnActive: { backgroundColor: 'rgba(157,140,239,0.2)', borderColor: '#9d8cef' },
  langBtnText: { color: 'white', fontSize: 15, fontWeight: 'bold' },
  dots: { flexDirection: 'row', gap: 8, marginBottom: 32 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.2)' },
  dotActive: { backgroundColor: '#9d8cef', width: 24 },
  content: { flex: 1, alignItems: 'center' },
  emoji: { fontSize: 64, marginBottom: 20 },
  title: { color: 'white', fontSize: 24, fontWeight: 'bold', textAlign: 'center', marginBottom: 12 },
  desc: { color: 'rgba(255,255,255,0.6)', fontSize: 15, textAlign: 'center', lineHeight: 22, marginBottom: 24 },
  cards: { width: '100%', gap: 10 },
  card: { backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  cardTitle: { color: 'white', fontSize: 14, fontWeight: 'bold' },
  cardDesc: { color: 'rgba(255,255,255,0.5)', fontSize: 13, marginTop: 4 },
  buttons: { flexDirection: 'row', gap: 12, marginTop: 24 },
  backBtn: { flex: 1, padding: 16, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.06)', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  backBtnText: { color: 'rgba(255,255,255,0.6)', fontSize: 15, fontWeight: 'bold' },
  nextBtn: { flex: 2, padding: 16, borderRadius: 14, backgroundColor: '#9d8cef', alignItems: 'center' },
  nextBtnText: { color: 'white', fontSize: 15, fontWeight: 'bold' },
});