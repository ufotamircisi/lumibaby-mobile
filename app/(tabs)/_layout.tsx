import MaskedView from '@react-native-masked-view/masked-view';
import { LinearGradient } from 'expo-linear-gradient';
import { Tabs, router } from 'expo-router';
import React, { useState } from 'react';
import { Modal, Platform, SafeAreaView, ScrollView, StatusBar, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

export default function TabLayout() {
  const [lang, setLang] = useState('tr');
  const [premiumModal, setPremiumModal] = useState(false);
  const [bebekModal, setBebekModal] = useState(false);
  const [fiyatModu, setFiyatModu] = useState('aylik');
  const [bebekAdi, setBebekAdi] = useState('');
  const [dogumTarihi, setDogumTarihi] = useState('');

  return (
    <View style={styles.container}>

      {/* SABİT HEADER */}
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <View style={styles.logoRow}>
            <Text style={styles.moon}>🌙</Text>
            <MaskedView maskElement={<Text style={styles.logoText}>Minik Uyku – LumiBaby</Text>}>
              <LinearGradient colors={['#ff85c0', '#c084fc', '#818cf8']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                <Text style={[styles.logoText, { opacity: 0 }]}>Minik Uyku – LumiBaby</Text>
              </LinearGradient>
            </MaskedView>
          </View>

          <View style={styles.headerButtons}>
            <TouchableOpacity style={styles.headerBtn} onPress={() => setBebekModal(true)}>
              <Text style={styles.headerBtnText}>👶 {bebekAdi || 'Bebek'}</Text>
            </TouchableOpacity>
            <View style={styles.langPill}>
              <TouchableOpacity style={[styles.langChip, lang === 'tr' && styles.langChipActive]} onPress={() => setLang('tr')}>
                <Text style={[styles.langText, lang === 'tr' && styles.langTextActive]}>TR</Text>
              </TouchableOpacity>
              <View style={styles.langDivider} />
              <TouchableOpacity style={[styles.langChip, lang === 'en' && styles.langChipActive]} onPress={() => setLang('en')}>
                <Text style={[styles.langText, lang === 'en' && styles.langTextActive]}>EN</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity style={styles.premiumBtn} onPress={() => setPremiumModal(true)}>
              <Text style={styles.headerBtnText}>👑 Premium</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>

      {/* SEKMELER */}
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarStyle: {
            backgroundColor: '#07101e',
            borderTopColor: 'rgba(255,255,255,0.1)',
            height: 85,
            paddingBottom: 30,
          },
          tabBarActiveTintColor: '#9d8cef',
          tabBarInactiveTintColor: 'rgba(255,255,255,0.4)',
        }}>
        <Tabs.Screen name="index" options={{ title: 'Ninniler', tabBarIcon: () => <Text style={{ fontSize: 20 }}>🎵</Text> }} />
        <Tabs.Screen name="hikayeler" options={{ title: 'Hikayeler', tabBarIcon: () => <Text style={{ fontSize: 20 }}>📖</Text> }} />
        <Tabs.Screen name="kolik" options={{ title: 'Kolik', tabBarIcon: () => <Text style={{ fontSize: 20 }}>🌿</Text> }} />
        <Tabs.Screen name="analiz" options={{ title: 'Analiz/Takip', tabBarIcon: () => <Text style={{ fontSize: 20 }}>📊</Text> }} />
        <Tabs.Screen name="sesim" options={{ title: 'Sesim', tabBarIcon: () => <Text style={{ fontSize: 20 }}>🎙️</Text> }} />
        
      </Tabs>

      {/* BEBEK MODAL */}
      <Modal visible={bebekModal} transparent animationType="slide" onRequestClose={() => setBebekModal(false)}>
        <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={() => setBebekModal(false)}>
          <TouchableOpacity activeOpacity={1} style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Bebek Ayarları</Text>
            <Text style={styles.modalSubtitle}>Kişiselleştirilmiş deneyim için</Text>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Bebeğinizin Adı</Text>
              <TextInput
                style={styles.input}
                placeholder="Ayşe / Emma"
                placeholderTextColor="rgba(255,255,255,0.3)"
                value={bebekAdi}
                onChangeText={setBebekAdi}
                maxLength={15}
              />
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Doğum Tarihi</Text>
              <TextInput
                style={styles.input}
                placeholder="GG/AA/YYYY"
                placeholderTextColor="rgba(255,255,255,0.3)"
                value={dogumTarihi}
                onChangeText={setDogumTarihi}
                keyboardType="numeric"
              />
            </View>
            <TouchableOpacity style={styles.saveBtn} onPress={() => setBebekModal(false)}>
              <Text style={styles.saveBtnText}>💾 Kaydet</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.onboardingBtn}
              onPress={() => {
                setBebekModal(false);
                router.push('/onboarding');
              }}>
              <Text style={styles.onboardingBtnText}>🔄 Karşılama ekranını göster</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* PREMİUM MODAL */}
      <Modal visible={premiumModal} transparent animationType="slide" onRequestClose={() => setPremiumModal(false)}>
        <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={() => setPremiumModal(false)}>
          <TouchableOpacity activeOpacity={1} style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <Text style={styles.premiumIcon}>👑</Text>
            <Text style={styles.premiumTitle}>Minik Uyku – LumiBaby Premium</Text>
            <Text style={styles.premiumSubtitle}>Bebeğiniz için en iyi uyku deneyimi</Text>
            <View style={styles.priceToggle}>
              <TouchableOpacity style={[styles.priceTab, fiyatModu === 'aylik' && styles.priceTabActive]} onPress={() => setFiyatModu('aylik')}>
                <Text style={[styles.priceTabText, fiyatModu === 'aylik' && styles.priceTabTextActive]}>Aylık</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.priceTab, fiyatModu === 'yillik' && styles.priceTabActive]} onPress={() => setFiyatModu('yillik')}>
                <Text style={[styles.priceTabText, fiyatModu === 'yillik' && styles.priceTabTextActive]}>Yıllık</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.priceText}>
              {fiyatModu === 'aylik' ? '49₺ ' : '399₺ '}
              <Text style={styles.priceSub}>{fiyatModu === 'aylik' ? '/aylık' : '/yıllık (aylık 33₺\'ye denk gelir!)'}</Text>
            </Text>
            <ScrollView style={styles.featureList}>
              {[
                { title: 'Sınırsız Ninni Dinleme', desc: '1 dakika sınırı kalkıyor' },
                { title: 'Tüm Masallar', desc: '1 dakika sınırı kalkıyor' },
                { title: 'Gelişmiş Dedektörler', desc: 'Sınırsız ağlama ve kolik tespiti' },
                { title: 'Detaylı Uyku Analizi', desc: 'AI destekli uyku tahminleri' },
                { title: 'Ses Klonlama', desc: 'Annenin sesiyle ninni' },
              ].map((f) => (
                <View key={f.title} style={styles.featureItem}>
                  <View style={styles.featureCheck}>
                    <Text style={styles.featureCheckText}>✓</Text>
                  </View>
                  <View>
                    <Text style={styles.featureTitle}>{f.title}</Text>
                    <Text style={styles.featureDesc}>{f.desc}</Text>
                  </View>
                </View>
              ))}
            </ScrollView>
            <TouchableOpacity style={styles.upgradeBtn}>
              <Text style={styles.upgradeBtnText}>👑 Premium'a Yükselt</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.cancelBtn} onPress={() => setPremiumModal(false)}>
              <Text style={styles.cancelBtnText}>Şimdilik İptal</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#07101e' },
  safeArea: { paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0, backgroundColor: '#07101e' },
  header: { paddingHorizontal: 16, paddingVertical: 12, alignItems: 'center', gap: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  moon: { fontSize: 24 },
  logoText: { fontSize: 20, fontWeight: 'bold', letterSpacing: 0.5 },
  headerButtons: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerBtn: { backgroundColor: 'rgba(255,255,255,0.08)', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' },
  premiumBtn: { backgroundColor: 'rgba(157,140,239,0.2)', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(157,140,239,0.3)' },
  headerBtnText: { color: 'white', fontSize: 12 },
  langPill: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.16)', overflow: 'hidden' },
  langChip: { paddingHorizontal: 12, paddingVertical: 6 },
  langChipActive: { backgroundColor: 'rgba(157,140,239,0.25)', borderRadius: 20 },
  langText: { color: 'rgba(255,255,255,0.45)', fontSize: 12, fontWeight: 'bold' },
  langTextActive: { color: '#b8a8f8' },
  langDivider: { width: 1, height: 16, backgroundColor: 'rgba(255,255,255,0.15)' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: '#0f1e33', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40, alignItems: 'center' },
  modalHandle: { width: 40, height: 4, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 2, marginBottom: 20 },
  modalTitle: { color: 'white', fontSize: 20, fontWeight: 'bold', marginBottom: 6 },
  modalSubtitle: { color: 'rgba(255,255,255,0.5)', fontSize: 13, marginBottom: 20 },
  inputGroup: { width: '100%', marginBottom: 14 },
  inputLabel: { color: 'rgba(255,255,255,0.6)', fontSize: 13, marginBottom: 6 },
  input: { backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 12, padding: 14, color: 'white', fontSize: 15, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', width: '100%' },
  saveBtn: { backgroundColor: '#9d8cef', borderRadius: 14, padding: 16, width: '100%', alignItems: 'center', marginBottom: 10 },
  saveBtnText: { color: 'white', fontSize: 15, fontWeight: 'bold' },
  onboardingBtn: { padding: 12, width: '100%', alignItems: 'center', borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  onboardingBtnText: { color: 'rgba(255,255,255,0.5)', fontSize: 14 },
  premiumIcon: { fontSize: 40, marginBottom: 8 },
  premiumTitle: { color: 'white', fontSize: 18, fontWeight: 'bold', textAlign: 'center' },
  premiumSubtitle: { color: 'rgba(255,255,255,0.5)', fontSize: 13, marginTop: 6, marginBottom: 16 },
  priceToggle: { flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 12, padding: 4, marginBottom: 16 },
  priceTab: { paddingHorizontal: 24, paddingVertical: 8, borderRadius: 10 },
  priceTabActive: { backgroundColor: '#9d8cef' },
  priceTabText: { color: 'rgba(255,255,255,0.5)', fontSize: 14, fontWeight: 'bold' },
  priceTabTextActive: { color: 'white' },
  priceText: { color: 'white', fontSize: 28, fontWeight: 'bold', marginBottom: 16 },
  priceSub: { color: 'rgba(255,255,255,0.5)', fontSize: 14, fontWeight: 'normal' },
  featureList: { width: '100%', marginBottom: 16 },
  featureItem: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 12 },
  featureCheck: { width: 24, height: 24, borderRadius: 12, backgroundColor: 'rgba(157,140,239,0.3)', alignItems: 'center', justifyContent: 'center' },
  featureCheckText: { color: '#b8a8f8', fontSize: 13, fontWeight: 'bold' },
  featureTitle: { color: 'white', fontSize: 14, fontWeight: 'bold' },
  featureDesc: { color: 'rgba(255,255,255,0.5)', fontSize: 12, marginTop: 2 },
  upgradeBtn: { backgroundColor: '#9d8cef', borderRadius: 14, padding: 16, width: '100%', alignItems: 'center', marginBottom: 10 },
  upgradeBtnText: { color: 'white', fontSize: 15, fontWeight: 'bold' },
  cancelBtn: { padding: 12, width: '100%', alignItems: 'center' },
  cancelBtnText: { color: 'rgba(255,255,255,0.4)', fontSize: 14 },
});