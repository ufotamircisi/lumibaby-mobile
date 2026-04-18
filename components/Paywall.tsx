import { useLang } from '@/hooks/useLang';
import { usePremium } from '@/hooks/usePremium';
import React from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface PaywallProps {
  visible: boolean;
  onClose: () => void;
  onPremium: () => void;
  onReklam?: () => void;
  limitMesaji?: string;
  baslik?: string;
  aciklama?: string;
}

export default function Paywall({ visible, onClose, onPremium, onReklam, limitMesaji, baslik, aciklama }: PaywallProps) {
  const { isTrial } = usePremium();
  const { lang, t } = useLang();
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.backdrop}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />
        <View style={[s.sheet, { paddingBottom: Math.max(insets.bottom + 16, 24) }]}>
          <View style={s.handle} />

          <Text style={s.ikon}>👑</Text>
          <Text style={s.baslik}>{baslik || t.paywallPremiumBaslik}</Text>
          <Text style={s.aciklama}>{aciklama || t.paywallPremiumAcik}</Text>

          <TouchableOpacity style={s.premiumBtn} onPress={onPremium}>
            <Text style={s.premiumBtnYazi}>{t.premiulaGec}</Text>
            {isTrial && <Text style={s.premiumBtnAlt}>{t.premiumTrialBanner}</Text>}
          </TouchableOpacity>

          {onReklam ? (
            <>
              <View style={s.ayrac}>
                <View style={s.ayracCizgi} />
                <Text style={s.ayracYazi}>{lang === 'en' ? 'or' : 'veya'}</Text>
                <View style={s.ayracCizgi} />
              </View>
              <TouchableOpacity style={s.reklamBtn} onPress={onReklam}>
                <Text style={s.reklamBtnYazi}>📺 {lang === 'en' ? 'Watch an Ad' : 'Reklam İzle'}</Text>
                <Text style={s.reklamBtnAlt}>{lang === 'en' ? 'Earn +1 free credit' : '+1 ücretsiz hak kazan'}</Text>
              </TouchableOpacity>
            </>
          ) : limitMesaji ? (
            <View style={s.limitBox}>
              <Text style={s.limitYazi}>⏰ {limitMesaji}</Text>
            </View>
          ) : null}

          <TouchableOpacity style={s.kapatBtn} onPress={onClose}>
            <Text style={s.kapatBtnYazi}>{t.simdilikIptal}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop:       { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  sheet:          { backgroundColor: '#0f1e33', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, alignItems: 'center' },
  handle:         { width: 40, height: 4, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 2, marginBottom: 20 },
  ikon:           { fontSize: 48, marginBottom: 12 },
  baslik:         { color: 'white', fontSize: 22, fontWeight: 'bold', textAlign: 'center', marginBottom: 8 },
  aciklama:       { color: 'rgba(255,255,255,0.5)', fontSize: 14, textAlign: 'center', lineHeight: 20, marginBottom: 24, paddingHorizontal: 16 },
  premiumBtn:     { backgroundColor: '#9d8cef', borderRadius: 16, paddingVertical: 16, width: '100%', alignItems: 'center', gap: 4, marginBottom: 8 },
  premiumBtnYazi: { color: 'white', fontSize: 17, fontWeight: 'bold' },
  premiumBtnAlt:  { color: 'rgba(255,255,255,0.7)', fontSize: 12 },
  ayrac:          { flexDirection: 'row', alignItems: 'center', gap: 10, width: '100%', marginVertical: 12 },
  ayracCizgi:     { flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.1)' },
  ayracYazi:      { color: 'rgba(255,255,255,0.3)', fontSize: 12 },
  reklamBtn:      { backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 16, paddingVertical: 16, width: '100%', alignItems: 'center', gap: 4, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', marginBottom: 8 },
  reklamBtnYazi:  { color: 'white', fontSize: 16, fontWeight: '600' },
  reklamBtnAlt:   { color: 'rgba(255,255,255,0.4)', fontSize: 12 },
  limitBox:       { backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 12, paddingVertical: 14, paddingHorizontal: 16, width: '100%', alignItems: 'center', marginBottom: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  limitYazi:      { color: 'rgba(255,255,255,0.45)', fontSize: 13, textAlign: 'center' },
  kapatBtn:       { paddingVertical: 14, width: '100%', alignItems: 'center' },
  kapatBtnYazi:   { color: 'rgba(255,255,255,0.35)', fontSize: 14 },
});
