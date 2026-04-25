// app/onboarding.tsx
import { translations } from '@/constants/translations';
import { useLang } from '@/hooks/useLang';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Nunito_800ExtraBold, useFonts } from '@expo-google-fonts/nunito';
import MaskedView from '@react-native-masked-view/masked-view';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import React, { useState } from 'react';
import {
  Dimensions, Linking, ScrollView, StyleSheet, Text,
  TouchableOpacity, View
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { ms, vs } from '@/constants/responsive';

const { width } = Dimensions.get('window');

type Lang = 'tr' | 'en';

const buildSlides = (lang: Lang) => {
  const t = translations[lang];
  return [
    {
      id: 1, emoji: '🌍',
      title:   lang === 'tr' ? 'Dil seçin' : 'Choose your language',
      desc:    lang === 'tr' ? "Minik Uyku LumiBaby'yi Türkçe veya English kullanabilirsiniz." : 'You can use Minik Uyku LumiBaby in Turkish or English.',
      note:    lang === 'tr' ? 'Ayarlar bölümünden daha sonra değiştirebilirsiniz.' : 'You can change this later in Settings.',
      showLang: true,
      primaryBtn: lang === 'tr' ? 'Devam et' : 'Continue',
      welcomeTitle:    t.obHosGelBaslik,
      welcomeSubtitle: t.obHosGelAlt,
    },
    {
      id: 2, emoji: '🌙',
      title: t.obUykuBaslik,
      desc:  t.obUykuAlt,
    },
    {
      id: 3, emoji: '🎧',
      title: t.obDedektorBaslik,
      desc:  t.obDedektorAlt,
    },
    {
      id: 4, emoji: '🎙️',
      title: t.obAnneBaslik,
      desc:  t.obAnneAlt,
    },
    {
      id: 5, emoji: '❓',
      title: t.obRehberBaslik,
      desc:  t.obRehberAlt,
    },
    {
      id: 6, emoji: '📈',
      title: t.obBaglantiBaslik,
      desc:  t.obBaglantiAlt,
    },
    {
      id: 7, emoji: '⭐',
      title:   lang === 'tr' ? "Premium'u 7 Gün Ücretsiz Deneyin" : 'Try Premium Free for 7 Days',
      desc:    lang === 'tr' ? "Size özel gelişmiş özellikleri 7 gün boyunca ücretsiz deneyimleyin.\nDevam edip etmemeye deneme sonunda siz karar verin." : "Experience all advanced features free for 7 days.\nYou decide whether to continue after the trial.",
      isLast:     true,
      primaryBtn: lang === 'tr' ? "Premium'u Keşfet" : 'Explore Premium',
      highlight:  lang === 'tr' ? 'Otomatik ücret alınmaz.' : 'No automatic charges.',
    },
  ];
};

export default function Onboarding(): JSX.Element {
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState(0);
  const [selectedLang, setSelectedLang] = useState<Lang>('tr');
  const [fontsLoaded] = useFonts({ Nunito_800ExtraBold });
  const { setLang } = useLang();

  const slides = buildSlides(selectedLang);
  const current = slides[step];
  const progress = ((step + 1) / slides.length) * 100;

  const handleNext = async () => {
    if (step < slides.length - 1) {
      setStep(step + 1);
    } else {
      await setLang(selectedLang);
      await AsyncStorage.setItem('lumibaby_onboarding_done', '1');
      router.replace('/(tabs)/analiz');
    }
  };

  const handleLangSelect = async (l: Lang) => {
    setSelectedLang(l);
  };

  const handleBack = () => { if (step > 0) setStep(step - 1); };
  const handleSkip = () => setStep(slides.length - 1);

  const logoFont = fontsLoaded ? 'Nunito_800ExtraBold' : 'bold';

  const backLabel    = selectedLang === 'en' ? '← Back' : '← Geri';
  const skipLabel    = selectedLang === 'en' ? 'Skip' : 'Atla';
  const cancelLabel  = selectedLang === 'en' ? 'Maybe Later' : 'Şimdilik İptal';
  const privacyLabel = selectedLang === 'en' ? 'Privacy Policy' : 'Gizlilik Politikası';
  const termsLabel   = selectedLang === 'en' ? 'Terms of Use' : 'Kullanım Koşulları';

  return (
    <SafeAreaView edges={['top']} style={styles.container}>

      {/* Logo */}
      <View style={styles.header}>
        <View style={styles.logoRow}>
          <Text style={styles.moon}>🌙</Text>
          {fontsLoaded ? (
            <MaskedView maskElement={<Text style={[styles.logoText, { fontFamily: logoFont }]}>Minik Uyku – LumiBaby</Text>}>
              <LinearGradient colors={['#ff85c0', '#c084fc', '#818cf8']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                <Text style={[styles.logoText, { fontFamily: logoFont, opacity: 0 }]}>Minik Uyku – LumiBaby</Text>
              </LinearGradient>
            </MaskedView>
          ) : (
            <Text style={[styles.logoText, { color: '#c084fc' }]}>Minik Uyku – LumiBaby</Text>
          )}
        </View>
      </View>

      {/* Progress */}
      <View style={styles.progressContainer}>
        <View style={[styles.progressBar, { width: `${progress}%` }]} />
      </View>

      {/* Nav */}
      <View style={styles.navRow}>
        {step > 0 ? (
          <TouchableOpacity onPress={handleBack} style={styles.backBtn}>
            <Text style={styles.backText}>{backLabel}</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.placeholder} />
        )}
        <Text style={styles.pageIndicator}>{step + 1} / {slides.length}</Text>
        {step < slides.length - 3 ? (
          <TouchableOpacity onPress={handleSkip} style={styles.skipBtn}>
            <Text style={styles.skipText}>{skipLabel}</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.placeholder} />
        )}
      </View>

      {/* Content */}
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <View style={styles.titleSection}>
          <Text style={styles.emoji}>{current.emoji}</Text>
          <Text style={styles.title}>{current.title}</Text>
        </View>

        <Text style={styles.desc}>{current.desc}</Text>

        {(current as any).isLast && (current as any).highlight && (
          <View style={styles.highlightBox}>
            <Text style={styles.highlightText}>{(current as any).highlight}</Text>
          </View>
        )}

        {(current as any).note && !(current as any).isLast && (
          <View style={styles.noteBox}>
            <Text style={styles.noteText}>{(current as any).note}</Text>
          </View>
        )}

        {(current as any).items && (
          <View style={styles.listContainer}>
            {((current as any).items as string[]).map((item: string, index: number) => (
              <View key={index} style={styles.listItem}>
                <Text style={styles.bullet}>●</Text>
                <Text style={styles.listText}>{item}</Text>
              </View>
            ))}
          </View>
        )}

        {(current as any).showLang && (
          <View style={styles.langSection}>
            <View style={styles.langRow}>
              <TouchableOpacity
                style={[styles.langBtn, selectedLang === 'tr' && styles.langBtnActive]}
                onPress={() => handleLangSelect('tr')}
              >
                <Text style={styles.langEmoji}>🇹🇷</Text>
                <Text style={[styles.langText, selectedLang === 'tr' && styles.langTextActive]}>Türkçe</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.langBtn, selectedLang === 'en' && styles.langBtnActive]}
                onPress={() => handleLangSelect('en')}
              >
                <Text style={styles.langEmoji}>🇬🇧</Text>
                <Text style={[styles.langText, selectedLang === 'en' && styles.langTextActive]}>English</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {(current as any).welcomeTitle && (
          <View style={styles.welcomeBox}>
            <Text style={styles.welcomeTitle}>{(current as any).welcomeTitle}</Text>
            <Text style={styles.welcomeSubtitle}>{(current as any).welcomeSubtitle}</Text>
          </View>
        )}
      </ScrollView>

      {/* Footer */}
      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) + 20 }]}>
        <TouchableOpacity
          style={[styles.primaryBtn, (current as any).isLast && styles.premiumBtn]}
          onPress={handleNext}
        >
          <Text style={[(current as any).isLast ? styles.premiumBtnText : styles.primaryBtnText]}>
            {(current as any).primaryBtn || (selectedLang === 'en' ? 'Next' : 'İleri')}
          </Text>
        </TouchableOpacity>

        {(current as any).isLast && (
          <View style={styles.linksContainer}>
            <TouchableOpacity onPress={() => Linking.openURL('https://ufotamircisi.github.io/lumibaby-mobile/privacy.html?lang=' + selectedLang)}>
              <Text style={styles.linkText}>{privacyLabel}</Text>
            </TouchableOpacity>
            <Text style={styles.dot}>·</Text>
            <TouchableOpacity onPress={() => Linking.openURL('https://ufotamircisi.github.io/lumibaby-mobile/terms.html?lang=' + selectedLang)}>
              <Text style={styles.linkText}>{termsLabel}</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container:        { flex: 1, backgroundColor: '#07101e' },
  header:           { alignItems: 'center', paddingVertical: 16 },
  logoRow:          { flexDirection: 'row', alignItems: 'center', gap: 8 },
  moon:             { fontSize: 24 },
  logoText:         { fontSize: 20, letterSpacing: 0.3 },
  progressContainer:{ height: 2, backgroundColor: 'rgba(255,255,255,0.1)', marginHorizontal: 24, borderRadius: 1 },
  progressBar:      { height: '100%' as any, backgroundColor: '#9d8cef', borderRadius: 1 },
  navRow:           { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 12 },
  backBtn:          { padding: 8 },
  backText:         { color: 'rgba(255,255,255,0.6)', fontSize: 14 },
  pageIndicator:    { color: 'rgba(255,255,255,0.4)', fontSize: 13 },
  skipBtn:          { padding: 8 },
  skipText:         { color: 'rgba(255,255,255,0.4)', fontSize: 14 },
  placeholder:      { width: 60 },
  scrollView:       { flex: 1 },
  scrollContent:    { paddingHorizontal: 28, paddingTop: 20, paddingBottom: 20 },
  titleSection:     { alignItems: 'center', marginBottom: 24 },
  emoji:            { fontSize: ms(48), marginBottom: 16 },
  title:            { color: 'white', fontSize: 24, fontWeight: 'bold', textAlign: 'center', lineHeight: vs(32) },
  desc:             { color: 'rgba(255,255,255,0.7)', fontSize: 15, lineHeight: 24, textAlign: 'center', marginBottom: 20 },
  highlightBox:     { backgroundColor: 'rgba(157,140,239,0.15)', borderRadius: 12, padding: 16, marginBottom: 24, borderWidth: 1, borderColor: 'rgba(157,140,239,0.3)' },
  highlightText:    { color: '#9d8cef', fontSize: 17, fontWeight: 'bold', textAlign: 'center' },
  noteBox:          { backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 10, padding: 14, marginBottom: 24, borderLeftWidth: 3, borderLeftColor: '#9d8cef' },
  noteText:         { color: 'rgba(255,255,255,0.5)', fontSize: 13, fontStyle: 'italic', textAlign: 'center' },
  listContainer:    { gap: 12, marginBottom: 24 },
  listItem:         { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 4 },
  bullet:           { color: '#9d8cef', fontSize: 8, marginTop: 6 },
  listText:         { color: 'rgba(255,255,255,0.8)', fontSize: 15, flex: 1, lineHeight: 22 },
  langSection:      { marginTop: 8, marginBottom: 0 },
  welcomeBox:       { marginTop: 28, alignItems: 'center' },
  welcomeTitle:     { color: 'white', fontSize: 22, fontWeight: 'bold', textAlign: 'center', marginBottom: 8 },
  welcomeSubtitle:  { color: 'rgba(255,255,255,0.6)', fontSize: 15, textAlign: 'center', lineHeight: 22 },
  langRow:          { flexDirection: 'row', gap: 12 },
  langBtn:          { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, paddingHorizontal: 16, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  langBtnActive:    { backgroundColor: 'rgba(157,140,239,0.2)', borderColor: '#9d8cef' },
  langEmoji:        { fontSize: 18 },
  langText:         { color: 'rgba(255,255,255,0.7)', fontSize: 14, fontWeight: '600' },
  langTextActive:   { color: 'white' },
  footer:           { paddingHorizontal: 24, paddingTop: 16, gap: 14 },
  primaryBtn:       { backgroundColor: '#9d8cef', paddingVertical: 16, borderRadius: 14, alignItems: 'center' },
  primaryBtnText:   { color: 'white', fontSize: 16, fontWeight: 'bold' },
  premiumBtn:       { backgroundColor: '#FFD700' },
  premiumBtnText:   { color: '#07101e', fontSize: 16, fontWeight: 'bold' },
  linksContainer:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  linkText:         { color: 'rgba(255,255,255,0.4)', fontSize: 12 },
  dot:              { color: 'rgba(255,255,255,0.25)', fontSize: 14 },
});
