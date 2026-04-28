import { useLang } from '@/hooks/useLang';
import { usePremium } from '@/hooks/usePremium';
import { type SensitivityLevel } from '@/services/cryDetectionEngine';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Nunito_800ExtraBold, useFonts } from '@expo-google-fonts/nunito';
import AsyncStorage from '@react-native-async-storage/async-storage';
import MaskedView from '@react-native-masked-view/masked-view';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { LinearGradient } from 'expo-linear-gradient';
import * as Notifications from 'expo-notifications';
import { Tabs, router } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Linking, Modal, Platform, SafeAreaView, ScrollView,
  StatusBar, StyleSheet, Text, TextInput, TouchableOpacity,
  View,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';

const KEY_MY_TOKEN        = 'lumibaby_my_token';
const KEY_ANNE_TOKEN      = 'lumibaby_anne_token';
const KEY_PARTNER_TOKEN   = 'lumibaby_partner_token';
const KEY_PARTNER_PREMIUM = 'partner_premium';
const { width: SCREEN_W } = Dimensions.get('window');
const QR_SIZE   = SCREEN_W * 0.55;
const isTablet  = SCREEN_W >= 768;

// Foreground'da gelen bildirimleri göster (setNotificationHandler tanımlı olmazsa sessizce düşer)
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function sendAlertToAll(
  type: 'crying' | 'colic' | 'lullaby' | 'silence'
): Promise<void> {
  const anneToken    = await AsyncStorage.getItem(KEY_ANNE_TOKEN);
  const partnerToken = await AsyncStorage.getItem(KEY_PARTNER_TOKEN);
  const myToken      = await AsyncStorage.getItem(KEY_MY_TOKEN);

  let lang = 'tr';
  try {
    const saved = await AsyncStorage.getItem('lumibaby_lang');
    if (saved === 'en' || saved === 'tr') lang = saved;
  } catch {}

  const messagesTR = {
    crying:  { title: '👶 Bebek Ağlıyor',   body: 'LumiBaby ağlama sesi algıladı.' },
    colic:   { title: '😣 Kolik Belirtisi',  body: 'Kolik sesi algılandı, müzik çalınıyor.' },
    lullaby: { title: '🎵 Ninni Çalıyor',    body: 'Bebek sakinleştirilmeye çalışılıyor.' },
    silence: { title: '😴 Bebek Sakinleşti', body: 'Artık ses algılanmıyor.' },
  };
  const messagesEN = {
    crying:  { title: '👶 Baby Crying',      body: 'LumiBaby detected crying sounds.' },
    colic:   { title: '😣 Colic Detected',   body: 'Colic sound detected, playing music.' },
    lullaby: { title: '🎵 Lullaby Playing',  body: 'Trying to soothe the baby.' },
    silence: { title: '😴 Baby Calmed Down', body: 'No more sound detected.' },
  };
  const { title, body } = (lang === 'en' ? messagesEN : messagesTR)[type];
  const targets: { to: string; sound: boolean }[] = [];
  if (anneToken)    targets.push({ to: anneToken,    sound: false }); // baby's phone — silent so Watch sees it
  if (partnerToken) targets.push({ to: partnerToken, sound: true  }); // parent's phone — loud
  // No paired devices → send to own token with sound so Apple/WearOS Watch gets notified
  if (targets.length === 0 && myToken) targets.push({ to: myToken, sound: true });
  if (targets.length === 0) return;
  await Promise.all(targets.map(({ to, sound }) =>
    fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to,
        title,
        body,
        data: { type, timestamp: Date.now() },
        sound: sound ? 'default' : null,
        priority: 'high',
        channelId: 'lumibaby-alerts',
      }),
    }).catch(() => {})
  ));
}

// ─── QR TARAMA ───────────────────────────────────────────────────────────────
function QRTaraEkrani({ onScanned, onClose }: { onScanned: (raw: string) => void; onClose: () => void; }) {
  const { t } = useLang();
  const [permission, requestPermission] = useCameraPermissions();
  const [tarandi, setTarandi] = useState(false);
  useEffect(() => { if (!permission?.granted) requestPermission(); }, []);
  const handleBarcode = ({ data }: { data: string }) => {
    if (tarandi) return;
    if (data.startsWith('ExponentPushToken[') || data.startsWith('LUMIBABY:')) {
      setTarandi(true);
      onScanned(data); // pass full raw string — PartnerModal handles parsing
    }
  };
  if (!permission?.granted) {
    return (
      <View style={qs.izinKutu}>
        <Text style={qs.izinYazi}>{t.partnerKameraIzin}</Text>
        <TouchableOpacity style={qs.izinBtn} onPress={requestPermission}><Text style={qs.izinBtnYazi}>{t.partnerIzinVer}</Text></TouchableOpacity>
        <TouchableOpacity style={qs.kapatBtn} onPress={onClose}><Text style={qs.kapatBtnYazi}>{t.partnerGeriDon}</Text></TouchableOpacity>
      </View>
    );
  }
  return (
    <View style={qs.container}>
      <CameraView style={qs.kamera} facing="back" onBarcodeScanned={tarandi ? undefined : handleBarcode} barcodeScannerSettings={{ barcodeTypes: ['qr'] }} />
      <View style={qs.overlay}>
        <View style={qs.cerceve}>
          <View style={[qs.kose, qs.solUst]} /><View style={[qs.kose, qs.sagUst]} />
          <View style={[qs.kose, qs.solAlt]} /><View style={[qs.kose, qs.sagAlt]} />
        </View>
        <Text style={qs.taramaYazi}>{t.partnerQRYon}</Text>
      </View>
      <TouchableOpacity style={qs.geriBtn} onPress={onClose}><Text style={qs.geriBtnYazi}>{t.partnerQRGeriDon}</Text></TouchableOpacity>
    </View>
  );
}
const qs = StyleSheet.create({
  container:    { flex: 1, backgroundColor: '#000' },
  kamera:       { flex: 1 },
  overlay:      { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', gap: 24 },
  cerceve:      { width: QR_SIZE + 40, height: QR_SIZE + 40, position: 'relative' },
  kose:         { position: 'absolute', width: 28, height: 28, borderColor: '#9d8cef', borderWidth: 3 },
  solUst:       { top: 0, left: 0, borderRightWidth: 0, borderBottomWidth: 0, borderTopLeftRadius: 4 },
  sagUst:       { top: 0, right: 0, borderLeftWidth: 0, borderBottomWidth: 0, borderTopRightRadius: 4 },
  solAlt:       { bottom: 0, left: 0, borderRightWidth: 0, borderTopWidth: 0, borderBottomLeftRadius: 4 },
  sagAlt:       { bottom: 0, right: 0, borderLeftWidth: 0, borderTopWidth: 0, borderBottomRightRadius: 4 },
  taramaYazi:   { color: 'white', fontSize: 13, textAlign: 'center', paddingHorizontal: 32, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 12, padding: 12, lineHeight: 20 },
  geriBtn:      { position: 'absolute', top: 56, left: 20, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10 },
  geriBtnYazi:  { color: 'white', fontSize: 15, fontWeight: '600' },
  izinKutu:     { flex: 1, backgroundColor: '#07101e', alignItems: 'center', justifyContent: 'center', gap: 16, padding: 32 },
  izinYazi:     { color: 'white', fontSize: 16, textAlign: 'center' },
  izinBtn:      { backgroundColor: '#9d8cef', borderRadius: 14, paddingVertical: 14, paddingHorizontal: 32 },
  izinBtnYazi:  { color: 'white', fontWeight: '700', fontSize: 15 },
  kapatBtn:     { paddingVertical: 12 },
  kapatBtnYazi: { color: 'rgba(255,255,255,0.5)', fontSize: 14 },
});

// ─── PARTNER MODAL ────────────────────────────────────────────────────────────
type PartnerEkran = 'menu' | 'qr_goster' | 'qr_tara';
function PartnerModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { t } = useLang();
  const { isPremium, yukle } = usePremium();
  const insets = useSafeAreaInsets();
  const [ekran, setEkran]                 = useState<PartnerEkran>('menu');
  const [myToken, setMyToken]             = useState<string | null>(null);
  const [bagliCihazlar, setBagliCihazlar] = useState<string[]>([]);
  const [loading, setLoading]             = useState(false);
  const [bebekAdi, setBebekAdi]           = useState('');
  const [dogumTarihi, setDogumTarihi]     = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [token, c1, bebekAdi_, dogumTarihi_] = await Promise.all([
        AsyncStorage.getItem(KEY_MY_TOKEN),
        AsyncStorage.getItem(KEY_ANNE_TOKEN),
        AsyncStorage.getItem('bebek_adi'),
        AsyncStorage.getItem('bebek_dogum_tarihi'),
      ]);
      setMyToken(token);
      setBagliCihazlar([c1].filter(Boolean) as string[]);
      setBebekAdi(bebekAdi_ || '');
      setDogumTarihi(dogumTarihi_ || '');
    } catch (e) {
      console.warn('PartnerModal load hatası:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  // 10 saniye zaman aşımı — AsyncStorage erişimi donduğunda spinner takılmasın
  useEffect(() => {
    if (!loading) return;
    const timeout = setTimeout(() => setLoading(false), 10000);
    return () => clearTimeout(timeout);
  }, [loading]);

  useEffect(() => { if (visible) { setEkran('menu'); load(); } }, [visible]);

  const handleScanned = async (raw: string) => {
    // Parse LUMIBABY:{token}:{isPremium}:{bebekAdi}:{dogumTarihi}
    let partnerToken = raw;
    let partnerIsPremium = false;
    let partnerBebekAdi = '';
    let partnerDogumTarihi = '';
    if (raw.startsWith('LUMIBABY:')) {
      const parts = raw.slice('LUMIBABY:'.length).split(':');
      partnerToken       = parts[0] || '';
      partnerIsPremium   = parts[1] === 'true';
      partnerBebekAdi    = parts[2] || '';
      partnerDogumTarihi = parts[3] || '';
    }
    if (!partnerToken) return;
    if (bagliCihazlar.includes(partnerToken)) {
      setEkran('menu');
      Alert.alert(t.partnerZatenBagliBaslik, t.partnerZatenBagliAcik);
      return;
    }
    if (bagliCihazlar.length >= 1) {
      Alert.alert(t.partnerSinirBaslik, t.partnerSinirAcik);
      return;
    }
    // Save partner token
    await AsyncStorage.setItem(KEY_ANNE_TOKEN, partnerToken);
    // Save partner premium status
    if (partnerIsPremium) await AsyncStorage.setItem(KEY_PARTNER_PREMIUM, 'true');
    // Sync baby info (only if local is empty)
    if (partnerBebekAdi && !bebekAdi) await AsyncStorage.setItem('bebek_adi', partnerBebekAdi);
    if (partnerDogumTarihi && !dogumTarihi) await AsyncStorage.setItem('bebek_dogum_tarihi', partnerDogumTarihi);
    setBagliCihazlar([partnerToken]);
    await yukle();
    setEkran('menu');
    Alert.alert(t.partnerBaglandiBaslik, t.partnerBaglandiAcik);
  };

  const handleRemove = (token: string) => {
    Alert.alert(t.partnerKaldirBaslik, t.partnerKaldirAcik, [
      { text: t.iptal, style: 'cancel' },
      { text: t.partnerKaldir, style: 'destructive', onPress: async () => {
        await AsyncStorage.removeItem(KEY_ANNE_TOKEN);
        await AsyncStorage.removeItem(KEY_PARTNER_PREMIUM);
        setBagliCihazlar([]);
        await yukle();
      }},
    ]);
  };

  if (ekran === 'qr_tara') {
    return (
      <Modal visible={visible} transparent={false} animationType="slide" onRequestClose={() => setEkran('menu')} presentationStyle={isTablet ? 'formSheet' : 'overFullScreen'}>
        <QRTaraEkrani onScanned={handleScanned} onClose={() => setEkran('menu')} />
      </Modal>
    );
  }
  if (ekran === 'qr_goster') {
    const isProductionToken = myToken?.startsWith('ExponentPushToken[') ?? false;
    const premiumStr = isPremium ? 'true' : 'false';
    const qrData = isProductionToken
      ? `LUMIBABY:${myToken}:${premiumStr}:${bebekAdi}:${dogumTarihi}`
      : null;
    const cihazVar = bagliCihazlar.length >= 1;
    return (
      <Modal visible={visible} transparent animationType="slide" onRequestClose={() => setEkran('menu')} presentationStyle={isTablet ? 'formSheet' : 'overFullScreen'}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setEkran('menu')} />
          <View style={{ backgroundColor: '#0f1e33', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: Math.max(insets.bottom + 16, 40), alignItems: 'center' }}>
            <View style={{ width: 40, height: 4, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 2, marginBottom: 16 }} />
            <Text style={pm.baslik}>{t.partnerQRBuCihaz}</Text>
            <Text style={pm.alt}>{t.partnerQRTaraIle}</Text>
            <View style={{ alignItems: 'center', paddingVertical: 24, gap: 16, width: '100%' }}>
              {cihazVar ? (
                <View style={pm.uyariBox}>
                  <Text style={{ fontSize: 28 }}>⚠️</Text>
                  <Text style={pm.uyariYazi}>{t.partnerSinirAcik}</Text>
                  <TouchableOpacity style={pm.kapatBtn} onPress={() => setEkran('menu')}><Text style={pm.kapatBtnYazi}>{t.partnerQRGeriDon}</Text></TouchableOpacity>
                </View>
              ) : qrData ? (
                <><QRCode value={qrData} size={QR_SIZE} color="#ffffff" backgroundColor="#0f1e33" /><Text style={pm.qrAcik}>{t.partnerQROku}</Text></>
              ) : (
                <View style={pm.productionBox}>
                  <Text style={{ fontSize: 40 }}>🏗️</Text>
                  <Text style={pm.productionYazi}>{t.bildirimProductionUyari}</Text>
                  <Text style={pm.productionAlt}>{t.partnerQRExpoGo}</Text>
                </View>
              )}
            </View>
            {!cihazVar && <TouchableOpacity style={pm.kapatBtn} onPress={() => setEkran('menu')}><Text style={pm.kapatBtnYazi}>{t.partnerQRGeriDon}</Text></TouchableOpacity>}
          </View>
        </View>
      </Modal>
    );
  }
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} presentationStyle={isTablet ? 'formSheet' : 'overFullScreen'}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />
        <View style={{ backgroundColor: '#0f1e33', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 24, paddingTop: 16, paddingBottom: Math.max(insets.bottom + 8, 16), height: isTablet ? '60%' : '85%' }}>
          <View style={{ width: 40, height: 4, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 2, alignSelf: 'center', marginBottom: 16 }} />
          <Text style={pm.baslik}>{t.partnerBaslik}</Text>
          <Text style={pm.alt}>{t.partnerAlt}</Text>
          {loading ? <ActivityIndicator color="#9d8cef" style={{ flex: 1 }} /> : (
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 16 }} showsVerticalScrollIndicator={false}>
              <View style={pm.aciklamaBox}>
                <Text style={pm.aciklamaBaslik}>{t.partnerNasilBaslik}</Text>
                <View style={pm.kuralKutu}>
                  <Text style={pm.kuralIkon}>👶</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={pm.kuralBaslik}>{t.partnerCihaz1Baslik}</Text>
                    <Text style={pm.kuralAcik}>{t.partnerCihaz1Acik}</Text>
                    <Text style={[pm.kuralAcik, { color: 'rgba(157,140,239,0.7)', marginTop: 4 }]}>{t.partnerCihaz1Not}</Text>
                  </View>
                </View>
                <View style={{ alignItems: 'center', paddingVertical: 4 }}><Text style={{ color: 'rgba(157,140,239,0.6)', fontSize: 20 }}>↕</Text></View>
                <View style={pm.kuralKutu}>
                  <Text style={pm.kuralIkon}>🧑‍🍼</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={pm.kuralBaslik}>{t.partnerCihaz2Baslik}</Text>
                    <Text style={pm.kuralAcik}>{t.partnerCihaz2Acik}</Text>
                    <Text style={[pm.kuralAcik, { color: 'rgba(157,140,239,0.7)', marginTop: 4 }]}>{t.partnerCihaz2Not}</Text>
                  </View>
                </View>
                <View style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.08)', marginVertical: 10 }} />
                <Text style={pm.aciklamaYazi}>{t.partnerRolNot}</Text>
              </View>
              <Text style={pm.bolum}>{t.partnerEslestirmeBolum}</Text>
              <View style={pm.grup}>
                <TouchableOpacity style={pm.satir} onPress={() => setEkran('qr_goster')}>
                  <View style={pm.satirSol}><Text style={pm.satirIkon}>📲</Text><View><Text style={pm.satirYazi}>{t.partnerQRGosterBtn}</Text><Text style={pm.satirAlt}>{t.partnerQRGosterAlt}</Text></View></View>
                  <Text style={pm.ok}>›</Text>
                </TouchableOpacity>
                <View style={pm.ayrac} />
                <TouchableOpacity style={[pm.satir, bagliCihazlar.length >= 1 && { opacity: 0.4 }]} onPress={() => bagliCihazlar.length < 1 && setEkran('qr_tara')} disabled={bagliCihazlar.length >= 1}>
                  <View style={pm.satirSol}><Text style={pm.satirIkon}>📷</Text><View><Text style={pm.satirYazi}>{t.partnerQRTaraBtn}</Text><Text style={pm.satirAlt}>{bagliCihazlar.length >= 1 ? t.partnerMaxCihaz : t.partnerQRTaraAlt}</Text></View></View>
                  <Text style={pm.ok}>›</Text>
                </TouchableOpacity>
              </View>
              <Text style={pm.bolum}>{t.partnerBagliCihazBolum(bagliCihazlar.length)}</Text>
              {bagliCihazlar.length === 0 ? (
                <View style={pm.bosKutu}><Text style={pm.bosYazi}>{t.partnerHenuzYok}</Text></View>
              ) : (
                <View style={pm.grup}>
                  {bagliCihazlar.map((token, i) => (
                    <View key={token}>
                      {i > 0 && <View style={pm.ayrac} />}
                      <View style={pm.cihazSatir}>
                        <View style={pm.satirSol}>
                          <Text style={pm.satirIkon}>📱</Text>
                          <View style={{ flex: 1 }}>
                            <Text style={pm.satirYazi}>{t.partnerCihazAdi}</Text>
                            <Text style={pm.bagliYazi} numberOfLines={1} ellipsizeMode="middle">✅ {token}</Text>
                          </View>
                        </View>
                        <TouchableOpacity onPress={() => handleRemove(token)} style={pm.kaldirBtn}><Text style={pm.kaldirBtnYazi}>{t.partnerKaldir}</Text></TouchableOpacity>
                      </View>
                    </View>
                  ))}
                </View>
              )}
              <View style={[pm.durumBox, bagliCihazlar.length === 1 ? pm.durumAktif : pm.durumPasif]}>
                <Text style={pm.durumYazi}>
                  {bagliCihazlar.length === 1 ? t.partnerDurumAktif : t.partnerDurumPasif}
                </Text>
              </View>
              {myToken && !myToken.startsWith('ExponentPushToken[') && (
                <View style={pm.notBox}>
                  <Text style={pm.notYazi}>⚠️ {t.bildirimProductionUyari}</Text>
                  <Text style={[pm.notYazi, { marginTop: 4, opacity: 0.7 }]}>{t.bildirimProductionAlt}</Text>
                </View>
              )}
            </ScrollView>
          )}
          <TouchableOpacity style={pm.kapatBtn} onPress={onClose}><Text style={pm.kapatBtnYazi}>{t.kapat}</Text></TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}
const pm = StyleSheet.create({
  baslik:         { color: 'white', fontSize: 20, fontWeight: 'bold', textAlign: 'center', marginBottom: 4 },
  alt:            { color: 'rgba(255,255,255,0.4)', fontSize: 13, textAlign: 'center', marginBottom: 16, lineHeight: 18 },
  aciklamaBox:    { backgroundColor: 'rgba(157,140,239,0.08)', borderRadius: 14, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: 'rgba(157,140,239,0.15)', gap: 8 },
  aciklamaBaslik: { color: '#b8a8f8', fontSize: 13, fontWeight: '700', marginBottom: 2 },
  aciklamaYazi:   { color: 'rgba(255,255,255,0.45)', fontSize: 12, lineHeight: 18 },
  kuralKutu:      { flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 10, padding: 12 },
  kuralIkon:      { fontSize: 22 },
  kuralBaslik:    { color: 'white', fontSize: 13, fontWeight: '700', marginBottom: 3 },
  kuralAcik:      { color: 'rgba(255,255,255,0.45)', fontSize: 12, lineHeight: 17 },
  bolum:          { color: 'rgba(255,255,255,0.4)', fontSize: 11, fontWeight: 'bold', letterSpacing: 0.8, marginBottom: 8, marginTop: 16, paddingHorizontal: 2 },
  grup:           { backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', overflow: 'hidden' },
  satir:          { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14 },
  cihazSatir:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14 },
  satirSol:       { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  satirIkon:      { fontSize: 22 },
  satirYazi:      { color: 'white', fontSize: 15 },
  satirAlt:       { color: 'rgba(255,255,255,0.35)', fontSize: 11, marginTop: 2 },
  ok:             { color: 'rgba(255,255,255,0.3)', fontSize: 20 },
  ayrac:          { height: 1, backgroundColor: 'rgba(255,255,255,0.06)', marginHorizontal: 16 },
  bagliYazi:      { color: '#7ed96a', fontSize: 11, marginTop: 2, flex: 1 },
  kaldirBtn:      { backgroundColor: 'rgba(229,115,115,0.15)', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: 'rgba(229,115,115,0.25)' },
  kaldirBtnYazi:  { color: '#E57373', fontSize: 13, fontWeight: '600' },
  bosKutu:        { backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 14, padding: 20, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  bosYazi:        { color: 'rgba(255,255,255,0.3)', fontSize: 14 },
  durumBox:       { borderRadius: 12, padding: 12, marginTop: 12 },
  durumAktif:     { backgroundColor: 'rgba(74,222,128,0.08)', borderWidth: 1, borderColor: 'rgba(74,222,128,0.2)' },
  durumSari:      { backgroundColor: 'rgba(250,204,21,0.08)', borderWidth: 1, borderColor: 'rgba(250,204,21,0.2)' },
  durumPasif:     { backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  durumYazi:      { color: 'rgba(255,255,255,0.6)', fontSize: 12, lineHeight: 18, textAlign: 'center' },
  notBox:         { backgroundColor: 'rgba(251,146,60,0.08)', borderRadius: 12, padding: 12, marginTop: 10, borderWidth: 1, borderColor: 'rgba(251,146,60,0.2)' },
  notYazi:        { color: 'rgba(251,146,60,0.8)', fontSize: 11, lineHeight: 17 },
  kapatBtn:       { backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 14, padding: 14, alignItems: 'center', marginTop: 12 },
  kapatBtnYazi:   { color: 'rgba(255,255,255,0.6)', fontSize: 15 },
  qrAcik:         { color: 'rgba(255,255,255,0.45)', fontSize: 13, textAlign: 'center', lineHeight: 20 },
  uyariBox:       { backgroundColor: 'rgba(251,146,60,0.1)', borderRadius: 14, padding: 20, borderWidth: 1, borderColor: 'rgba(251,146,60,0.3)', alignItems: 'center', gap: 12, width: '100%' },
  uyariYazi:      { color: 'rgba(251,200,100,0.9)', fontSize: 14, textAlign: 'center', lineHeight: 21 },
  productionBox:  { alignItems: 'center', gap: 12, padding: 24, backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', width: '100%' },
  productionYazi: { color: 'white', fontSize: 16, fontWeight: 'bold', textAlign: 'center' },
  productionAlt:  { color: 'rgba(255,255,255,0.4)', fontSize: 13, textAlign: 'center', lineHeight: 20 },
});

// ─── ANA LAYOUT ──────────────────────────────────────────────────────────────
export default function TabLayout() {
  const { isTrial, isPremium, trialKalanGun, presentPaywall, restorePurchases, yuklendi } = usePremium();
  const { lang, setLang, t } = useLang();
  const free = !isPremium && !isTrial;
  const insets = useSafeAreaInsets();
  const [fontsLoaded] = useFonts({ Nunito_800ExtraBold });

  const [premiumModal, setPremiumModal]   = useState(false);
  const [ayarlarModal, setAyarlarModal]   = useState(false);
  const [bebekModal, setBebekModal]       = useState(false);
  const [partnerModal, setPartnerModal]   = useState(false);
  const [fiyatModu, setFiyatModu]         = useState<'aylik' | 'yillik'>('aylik');
  const [bebekAdi, setBebekAdi]           = useState('');
  const [dogumTarihi, setDogumTarihi]     = useState('');
  const [bildirimIzni, setBildirimIzni]   = useState<boolean | null>(null);
  const [trial5Popup, setTrial5Popup]     = useState(false);
  const [trial6Popup, setTrial6Popup]     = useState(false);
  const [gizliTapSayisi, setGizliTapSayisi] = useState(0);
  const [devMenuVisible, setDevMenuVisible] = useState(false);
  const [hassasiyet, setHassasiyetState]    = useState<SensitivityLevel>('balanced');

  useEffect(() => {
    AsyncStorage.getItem('bebek_adi').then(v => { if (v) setBebekAdi(v); });
    AsyncStorage.getItem('bebek_dogum_tarihi').then(v => { if (v) setDogumTarihi(v); });
    AsyncStorage.getItem('lumibaby_hassasiyet').then(v => {
      if (v === 'high' || v === 'balanced' || v === 'strict') setHassasiyetState(v);
    });

    // Android notification channels
    if (Platform.OS === 'android') {
      Notifications.setNotificationChannelAsync('lumibaby-alerts', {
        name: 'LumiBaby Alerts',
        importance: Notifications.AndroidImportance.HIGH,
        sound: 'default',
        vibrationPattern: [0, 250, 250, 250],
        enableVibrate: true,
      }).catch(() => {});
      Notifications.setNotificationChannelAsync('wake-window', {
        name: 'Uyanma Penceresi / Wake Window',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#6B4EFF',
        sound: 'default',
      }).catch(() => {});
    }

    // Request notification permission on first launch
    Notifications.requestPermissionsAsync().then(({ status }) => {
      setBildirimIzni(status === 'granted');
    }).catch(() => setBildirimIzni(false));
  }, []);

  // Trial gün popup'ları — yuklendi değişince kontrol et
  useEffect(() => {
    if (!yuklendi || !isTrial) return;
    (async () => {
      // 5. gün: trialKalanGun === 3 (7 - 4 = 3)
      if (trialKalanGun === 3) {
        const shown = await AsyncStorage.getItem('lumibaby_trial5_popup');
        if (!shown) setTrial5Popup(true);
      }
      // 6. gün: trialKalanGun === 2 (7 - 5 = 2)
      if (trialKalanGun === 2) {
        const shown = await AsyncStorage.getItem('lumibaby_trial6_popup');
        if (!shown) setTrial6Popup(true);
      }
    })();
  }, [yuklendi]);

  const handleBebekKaydet = async () => {
    await AsyncStorage.setItem('bebek_adi', bebekAdi);
    await AsyncStorage.setItem('bebek_dogum_tarihi', dogumTarihi);
    setBebekModal(false);
  };

  const logoFont = fontsLoaded ? 'Nunito_800ExtraBold' : 'bold';

  return (
    <View style={s.container}>
      <SafeAreaView style={s.safeArea}>
        <View style={s.header}>
          <View style={s.logoRow}>
            <Text style={s.moon}>🌙</Text>
            <MaskedView maskElement={<Text style={[s.logoText, { fontFamily: logoFont }]}>Minik Uyku – LumiBaby</Text>}>
              <LinearGradient colors={['#ff85c0', '#c084fc', '#818cf8']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                <Text style={[s.logoText, { fontFamily: logoFont, opacity: 0 }]}>Minik Uyku – LumiBaby</Text>
              </LinearGradient>
            </MaskedView>
          </View>
          <View style={s.headerButtons}>
            <TouchableOpacity style={s.headerBtn} onPress={() => setBebekModal(true)}>
              <Text style={s.headerBtnText}>👶 {bebekAdi || t.headerBebek}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.premiumBtn} onPress={() => setPremiumModal(true)}>
              <Text style={s.headerBtnText}>{t.headerPremium}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.headerBtn} onPress={() => setAyarlarModal(true)}>
              <Text style={s.headerBtnText}>{t.headerAyarlar}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {isTrial && !isPremium && (
          <TouchableOpacity style={s.headerTrialBanner} onPress={() => setPremiumModal(true)}>
            <Text style={s.headerTrialBannerYazi}>{t.trialBanner(trialKalanGun)}</Text>
          </TouchableOpacity>
        )}
      </SafeAreaView>

      <Tabs initialRouteName="analiz" screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: '#07101e',
          borderTopColor: 'rgba(255,255,255,0.1)',
          height: 56 + Math.max(insets.bottom, 8),
          paddingBottom: Math.max(insets.bottom, 8),
          paddingTop: 6,
        },
        tabBarActiveTintColor: '#9d8cef',
        tabBarInactiveTintColor: 'rgba(255,255,255,0.4)',
      }}>
        <Tabs.Screen name="analiz"    options={{ title: t.tabAsistan,   tabBarIcon: () => <Text style={{ fontSize: 20 }}>🤖</Text> }} />
        <Tabs.Screen name="index"     options={{ title: t.tabNinniler,  tabBarIcon: () => <Text style={{ fontSize: 20 }}>🎵</Text> }} />
        <Tabs.Screen name="kolik"     options={{ title: t.tabKolik,     tabBarIcon: () => <Text style={{ fontSize: 20 }}>🌿</Text> }} />
        <Tabs.Screen name="hikayeler" options={{ title: t.tabHikayeler, tabBarIcon: () => <Text style={{ fontSize: 20 }}>📖</Text> }} />
        <Tabs.Screen name="sesim"     options={{ title: t.tabSesim,     tabBarIcon: () => <Text style={{ fontSize: 20 }}>🎙️</Text> }} />
      </Tabs>

      {/* BEBEK MODAL */}
      <Modal visible={bebekModal} transparent animationType="slide" onRequestClose={() => setBebekModal(false)} presentationStyle={isTablet ? 'formSheet' : 'overFullScreen'}>
        <TouchableOpacity style={s.modalBackdrop} activeOpacity={1} onPress={() => setBebekModal(false)}>
          <TouchableOpacity activeOpacity={1} style={[s.modalSheet, { paddingBottom: Math.max(insets.bottom + 16, 40) }]}>
            <View style={s.modalHandle} />
            <Text style={s.modalTitle}>{t.bebekBaslik}</Text>
            <Text style={s.modalSubtitle}>{t.bebekAlt}</Text>
            <View style={s.inputGroup}>
              <Text style={s.inputLabel}>{t.bebekAdiLabel}</Text>
              <TextInput style={s.input} placeholder={t.bebekAdiPlaceholder} placeholderTextColor="rgba(255,255,255,0.3)" value={bebekAdi} onChangeText={setBebekAdi} maxLength={15} />
            </View>
            <View style={s.inputGroup}>
              <Text style={s.inputLabel}>{t.dogumTarihiLabel}</Text>
              <TextInput style={s.input} placeholder={t.dogumTarihiPh} placeholderTextColor="rgba(255,255,255,0.3)" value={dogumTarihi} onChangeText={setDogumTarihi} keyboardType="numeric" />
            </View>
            <TouchableOpacity style={s.saveBtn} onPress={handleBebekKaydet}>
              <Text style={s.saveBtnText}>{t.kaydet}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.onboardingBtn} onPress={() => { setBebekModal(false); router.push('/onboarding'); }}>
              <Text style={s.onboardingBtnText}>{t.karsilamaGoster}</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* PREMİUM MODAL */}
      <Modal visible={premiumModal} transparent animationType="slide" onRequestClose={() => setPremiumModal(false)} presentationStyle={isTablet ? 'formSheet' : 'overFullScreen'}>
        <View style={s.modalBackdrop}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setPremiumModal(false)} />
          <View style={[s.premiumSheet, { paddingBottom: Math.max(insets.bottom + 16, 24) }]}>
            <View style={s.modalHandle} />
            <Text style={s.premiumIcon}>👑</Text>
            <Text style={s.premiumTitle}>{t.premiumBaslik}</Text>
            <Text style={s.premiumSubtitle}>{t.premiumAlt}</Text>

            <View style={s.priceToggle}>
              <TouchableOpacity style={[s.priceTab, fiyatModu === 'aylik' && s.priceTabActive]} onPress={() => setFiyatModu('aylik')}>
                <Text style={[s.priceTabText, fiyatModu === 'aylik' && s.priceTabTextActive]}>{t.premiumAylik}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.priceTab, fiyatModu === 'yillik' && s.priceTabActive]} onPress={() => setFiyatModu('yillik')}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={[s.priceTabText, fiyatModu === 'yillik' && s.priceTabTextActive]}>{t.premiumYillik}</Text>
                  <View style={s.indirimRozet}><Text style={s.indirimRozetYazi}>{t.premiumIndirim}</Text></View>
                </View>
              </TouchableOpacity>
            </View>

            <View style={s.fiyatKartTek}>
              <View style={s.lansmanRozetRow}>
                <View style={s.lansmanRozet}><Text style={s.lansmanRozetYazi}>{t.premiumLansmanRozet}</Text></View>
              </View>
              <View style={s.fiyatKartIc}>
                <Text style={s.eskiFiyat}>{fiyatModu === 'aylik' ? t.premiumEskiFiyatAylik : t.premiumEskiFiyatYillik}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 2 }}>
                  <Text style={s.fiyatTutar}>{fiyatModu === 'aylik' ? t.premiumFiyatAylik : t.premiumFiyatYillik}</Text>
                  <Text style={s.fiyatPeriyot}>{fiyatModu === 'aylik' ? t.premiumPerAylik : t.premiumPerYillik}</Text>
                </View>
              </View>
              <Text style={s.lansmanAlt}>{t.premiumLansmanAlt}</Text>
              {fiyatModu === 'yillik' && <Text style={s.fiyatGunluk}>{t.premiumGunluk}</Text>}
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ width: '100%' }} bounces={false} nestedScrollEnabled>
              <View style={s.tabloKutu}>
                <View style={s.tabloBaslikRow}>
                  <Text style={[s.tabloBaslik, { flex: 2 }]}>{t.tabloOzellik}</Text>
                  <Text style={[s.tabloBaslik, { flex: 1, textAlign: 'center' }]}>{t.tabloUcretsiz}</Text>
                  <Text style={[s.tabloBaslik, { flex: 1, textAlign: 'center', color: '#b8a8f8' }]}>{t.tabloPremium}</Text>
                </View>
                <View style={s.tabloAyrac} />
                {t.tablo.map((row, i) => (
                  <View key={i}>
                    {i > 0 && <View style={s.tabloAyrac} />}
                    <View style={s.tabloRow}>
                      <Text style={[s.tabloHucre, { flex: 2 }]}>{row.ozellik}</Text>
                      <Text style={[s.tabloHucre, { flex: 1, textAlign: 'center', color: 'rgba(255,255,255,0.35)' }]}>{row.ucretsiz}</Text>
                      <Text style={[s.tabloHucre, { flex: 1, textAlign: 'center', color: '#4ade80' }]}>{row.premium}</Text>
                    </View>
                  </View>
                ))}
              </View>
              <Text style={s.reklamNot}>{t.premiumReklamNot}</Text>
            </ScrollView>

            <TouchableOpacity style={s.upgradeBtn} onPress={() => { setPremiumModal(false); presentPaywall(); }}>
              <Text style={s.upgradeBtnText}>{t.premiumUpgradeBtn}</Text>
            </TouchableOpacity>
            <Text style={s.iptalNotu}>{t.premiumIptalNotu}</Text>
            <TouchableOpacity style={s.cancelBtn} onPress={() => setPremiumModal(false)}>
              <Text style={s.cancelBtnText}>{t.simdilikIptal}</Text>
            </TouchableOpacity>
            <View style={s.gizlilikRow}>
              <TouchableOpacity onPress={() => Linking.openURL('https://ufotamircisi.github.io/lumibaby-mobile/privacy.html?lang=' + lang)}>
                <Text style={s.gizlilikLink}>{t.ayarlarGizlilik}</Text>
              </TouchableOpacity>
              <Text style={s.gizlilikAyrac}>·</Text>
              <TouchableOpacity onPress={() => Linking.openURL('https://ufotamircisi.github.io/lumibaby-mobile/terms.html?lang=' + lang)}>
                <Text style={s.gizlilikLink}>{t.ayarlarKullanim}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <PartnerModal visible={partnerModal} onClose={() => setPartnerModal(false)} />

      {/* AYARLAR MODAL */}
      <Modal visible={ayarlarModal} transparent animationType="slide" onRequestClose={() => setAyarlarModal(false)} presentationStyle={isTablet ? 'formSheet' : 'overFullScreen'}>
        <TouchableOpacity style={s.modalBackdrop} activeOpacity={1} onPress={() => setAyarlarModal(false)}>
          <TouchableOpacity activeOpacity={1} style={[s.ayarlarSheet, { paddingBottom: Math.max(insets.bottom + 16, 16) }]}>
            <View style={s.modalHandle} />
            <Text style={s.ayarlarBaslik}>{t.ayarlarBaslik}</Text>
            <ScrollView
              decelerationRate="normal"
              scrollEventThrottle={16}
              showsVerticalScrollIndicator={false}
              bounces={true}
              overScrollMode="always"
              nestedScrollEnabled={true}
            >

              <Text style={s.bolumBaslik}>{t.ayarlarPremiumBolum}</Text>
              <View style={s.grup}>
                <TouchableOpacity style={s.satir} onPress={() => { setAyarlarModal(false); setPremiumModal(true); }}>
                  <Text style={s.satirYazi}>{t.ayarlarAbonelik}</Text><Text style={s.ok}>›</Text>
                </TouchableOpacity>
                <View style={s.ayrac} />
                <TouchableOpacity style={s.satir} onPress={async () => {
                  setAyarlarModal(false);
                  const ok = await restorePurchases();
                  Alert.alert(
                    ok
                      ? (lang === 'en' ? 'Your subscription has been restored' : 'Aboneliğiniz geri yüklendi')
                      : (lang === 'en' ? 'No subscription found to restore' : 'Geri yüklenecek abonelik bulunamadı')
                  );
                }}>
                  <Text style={s.satirYazi}>{t.ayarlarGeriYukle}</Text><Text style={s.ok}>›</Text>
                </TouchableOpacity>
              </View>

              <Text style={s.bolumBaslik}>{t.ayarlarBildirimBolum}</Text>
              <View style={s.grup}>
                <TouchableOpacity style={s.satir} onPress={() => { setAyarlarModal(false); if (free) setPremiumModal(true); else setPartnerModal(true); }}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.satirYazi}>{t.ayarlarEbeveyn}</Text>
                    <Text style={s.satirAlt}>{t.ayarlarEbeveynAlt}</Text>
                  </View>
                  <Text style={s.ok}>{free ? '🔒' : '›'}</Text>
                </TouchableOpacity>
              </View>
              {bildirimIzni === false && (
                <TouchableOpacity style={s.bildirimUyariBox} onPress={() => Linking.openSettings()}>
                  <Text style={s.bildirimUyariYazi}>{t.bildirimIzniUyari}</Text>
                </TouchableOpacity>
              )}

              <Text style={s.bolumBaslik}>{t.hassasiyetBaslik}</Text>
              <View style={s.grup}>
                {(['high', 'balanced', 'strict'] as SensitivityLevel[]).map((level, i) => {
                  const labels: Record<SensitivityLevel, { baslik: string; alt: string }> = {
                    high:     { baslik: t.hassasiyetYuksek,  alt: t.hassasiyetYuksekAlt  },
                    balanced: { baslik: t.hassasiyetDengeli, alt: t.hassasiyetDengaliAlt },
                    strict:   { baslik: t.hassasiyetKati,    alt: t.hassasiyetKatiAlt    },
                  };
                  return (
                    <View key={level}>
                      {i > 0 && <View style={s.ayrac} />}
                      <TouchableOpacity style={s.satir} onPress={async () => {
                        setHassasiyetState(level);
                        await AsyncStorage.setItem('lumibaby_hassasiyet', level);
                      }}>
                        <View style={{ flex: 1 }}>
                          <Text style={s.satirYazi}>{labels[level].baslik}</Text>
                          <Text style={s.satirAlt}>{labels[level].alt}</Text>
                        </View>
                        {hassasiyet === level && <Text style={s.tik}>✓</Text>}
                      </TouchableOpacity>
                    </View>
                  );
                })}
              </View>

              <Text style={s.bolumBaslik}>{t.ayarlarDilBolum}</Text>
              <View style={s.grup}>
                <TouchableOpacity style={s.satir} onPress={() => setLang('tr')}>
                  <Text style={s.satirYazi}>🇹🇷 Türkçe</Text>
                  {lang === 'tr' && <Text style={s.tik}>✓</Text>}
                </TouchableOpacity>
                <View style={s.ayrac} />
                <TouchableOpacity style={s.satir} onPress={() => setLang('en')}>
                  <Text style={s.satirYazi}>🇬🇧 English</Text>
                  {lang === 'en' && <Text style={s.tik}>✓</Text>}
                </TouchableOpacity>
              </View>

              <Text style={s.bolumBaslik}>{t.ayarlarGizlilikBolum}</Text>
              <View style={s.grup}>
                <TouchableOpacity style={s.satir} onPress={() => Linking.openURL('https://ufotamircisi.github.io/lumibaby-mobile/privacy.html?lang=' + lang)}>
                  <Text style={s.satirYazi}>{t.ayarlarGizlilik}</Text><Text style={s.ok}>›</Text>
                </TouchableOpacity>
                <View style={s.ayrac} />
                <TouchableOpacity style={s.satir} onPress={() => Linking.openURL('https://ufotamircisi.github.io/lumibaby-mobile/terms.html?lang=' + lang)}>
                  <Text style={s.satirYazi}>{t.ayarlarKullanim}</Text><Text style={s.ok}>›</Text>
                </TouchableOpacity>
              </View>

              <Text style={s.bolumBaslik}>{t.ayarlarGeriBildirim}</Text>
              <View style={s.grup}>
                <TouchableOpacity style={s.satir} onPress={() => Linking.openURL(Platform.OS === 'ios' ? 'https://apps.apple.com/app/id000000000' : 'https://play.google.com/store/apps/details?id=com.lumibaby')}>
                  <Text style={s.satirYazi}>{t.ayarlarDegerlendir}</Text><Text style={s.ok}>›</Text>
                </TouchableOpacity>
                <View style={s.ayrac} />
                <TouchableOpacity style={s.satir} onPress={() => Linking.openURL(lang === 'en' ? 'mailto:lumisoftstudio@gmail.com?subject=Support' : 'mailto:lumisoftstudio@gmail.com?subject=Destek')}>
                  <Text style={s.satirYazi}>{t.ayarlarIletisim}</Text><Text style={s.ok}>›</Text>
                </TouchableOpacity>
              </View>

              <Text style={s.bolumBaslik}>{t.ayarlarHakkinda}</Text>
              <View style={s.grup}>
                {__DEV__ ? (
                  <TouchableOpacity style={s.satir} onPress={() => {
                    const yeni = gizliTapSayisi + 1;
                    if (yeni >= 5) { setGizliTapSayisi(0); setDevMenuVisible(true); }
                    else setGizliTapSayisi(yeni);
                  }}>
                    <Text style={s.satirYazi}>{t.ayarlarVersiyon}</Text>
                    <Text style={s.deger}>1.0.0</Text>
                  </TouchableOpacity>
                ) : (
                  <View style={s.satir}><Text style={s.satirYazi}>{t.ayarlarVersiyon}</Text><Text style={s.deger}>1.0.0</Text></View>
                )}
                <View style={s.ayrac} />
                <View style={s.satir}><Text style={s.satirYazi}>{t.ayarlarGelistirici}</Text><Text style={s.deger}>Lumisoft Studio</Text></View>
              </View>

              <Text style={s.alt}>Minik Uyku – LumiBaby © 2026</Text>
            </ScrollView>
            <TouchableOpacity style={s.kapatBtn} onPress={() => setAyarlarModal(false)}>
              <Text style={s.kapatBtnYazi}>{t.kapat}</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* TRİAL 5. GÜN POPUP — değerlendirme */}
      <Modal visible={trial5Popup} transparent animationType="fade" onRequestClose={() => setTrial5Popup(false)} presentationStyle={isTablet ? 'formSheet' : 'overFullScreen'}>
        <View style={s.popupBackdrop}>
          <View style={s.popupKart}>
            <Text style={s.popupIkon}>⭐</Text>
            <Text style={s.popupBaslik}>{t.trial5Baslik}</Text>
            <Text style={s.popupMetin}>{t.trial5Metin}</Text>
            <TouchableOpacity style={s.popupPrimaryBtn} onPress={async () => {
              await AsyncStorage.setItem('lumibaby_trial5_popup', '1');
              setTrial5Popup(false);
              const url = Platform.OS === 'ios'
                ? 'itms-apps://itunes.apple.com/app/id000000000?action=write-review'
                : 'https://play.google.com/store/apps/details?id=com.lumibaby&showAllReviews=true';
              Linking.openURL(url).catch(() => {});
            }}>
              <Text style={s.popupPrimaryBtnYazi}>{t.trial5Evet}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.popupSecondaryBtn} onPress={async () => {
              await AsyncStorage.setItem('lumibaby_trial5_popup', '1');
              setTrial5Popup(false);
            }}>
              <Text style={s.popupSecondaryBtnYazi}>{t.trial5Hayir}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* TRİAL 6. GÜN POPUP — premium hatırlatma */}
      <Modal visible={trial6Popup} transparent animationType="fade" onRequestClose={() => setTrial6Popup(false)} presentationStyle={isTablet ? 'formSheet' : 'overFullScreen'}>
        <View style={s.popupBackdrop}>
          <View style={s.popupKart}>
            <Text style={s.popupIkon}>👑</Text>
            <Text style={s.popupBaslik}>{t.trial6Baslik}</Text>
            <Text style={s.popupMetin}>{t.trial6Metin}</Text>
            <Text style={s.popupAlt}>{t.trial6Alt}</Text>
            <TouchableOpacity style={s.popupPrimaryBtn} onPress={async () => {
              await AsyncStorage.setItem('lumibaby_trial6_popup', '1');
              setTrial6Popup(false);
              setPremiumModal(true);
            }}>
              <Text style={s.popupPrimaryBtnYazi}>{t.trial6Upgrade}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.popupSecondaryBtn} onPress={async () => {
              await AsyncStorage.setItem('lumibaby_trial6_popup', '1');
              setTrial6Popup(false);
            }}>
              <Text style={s.popupSecondaryBtnYazi}>{t.trial6Sonra}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* DEV MENU — sadece __DEV__ modunda, production'da hiç render edilmez */}
      {__DEV__ && (
        <Modal visible={devMenuVisible} transparent animationType="fade" onRequestClose={() => setDevMenuVisible(false)} presentationStyle={isTablet ? 'formSheet' : 'overFullScreen'}>
          <View style={s.devMenuBackdrop}>
            <View style={s.devMenuKutu}>
              <Text style={s.devMenuBaslik}>🛠️ Dev Menu</Text>

              <TouchableOpacity style={[s.devMenuBtn, s.devMenuBtnTrial]} onPress={async () => {
                await AsyncStorage.setItem('lumibaby_trial_start', String(Date.now()));
                await AsyncStorage.removeItem('partner_premium');
                setDevMenuVisible(false);
                require('react-native').DevSettings.reload();
              }}>
                <Text style={s.devMenuBtnYazi}>▶️  Trial Başlat</Text>
              </TouchableOpacity>

              <TouchableOpacity style={[s.devMenuBtn, s.devMenuBtnPremium]} onPress={async () => {
                await AsyncStorage.setItem('partner_premium', 'true');
                setDevMenuVisible(false);
                require('react-native').DevSettings.reload();
              }}>
                <Text style={s.devMenuBtnYazi}>👑  Premium Yap</Text>
              </TouchableOpacity>

              <TouchableOpacity style={[s.devMenuBtn, s.devMenuBtnFree]} onPress={async () => {
                // Tüm premium/trial anahtarlarını temizle
                await AsyncStorage.multiRemove([
                  'partner_premium',
                  'lumibaby_detektor_kullanim',
                  'lumibaby_analiz_kullanim',
                  'lumibaby_detektor_ekstra',
                  'lumibaby_analiz_ekstra',
                  'detectorDailyUsage',
                  'cryHelperDailyUsage',
                ]);
                // Trial başlangıcını 8 gün öncesine set et → trial süresi dolmuş → free mode
                await AsyncStorage.setItem(
                  'lumibaby_trial_start',
                  String(Date.now() - 8 * 24 * 60 * 60 * 1000),
                );
                setDevMenuVisible(false);
                require('react-native').DevSettings.reload();
              }}>
                <Text style={s.devMenuBtnYazi}>🆓  Ücretsize Dön</Text>
              </TouchableOpacity>

              <TouchableOpacity style={s.devMenuKapatBtn} onPress={() => setDevMenuVisible(false)}>
                <Text style={s.devMenuKapatYazi}>Kapat</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}

    </View>
  );
}

const s = StyleSheet.create({
  container:           { flex: 1, backgroundColor: '#07101e' },
  safeArea:            { paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0, backgroundColor: '#07101e' },
  header:              { paddingHorizontal: 16, paddingVertical: 12, alignItems: 'center', gap: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' },
  logoRow:             { flexDirection: 'row', alignItems: 'center', gap: 8 },
  moon:                { fontSize: 24 },
  logoText:            { fontSize: 20, letterSpacing: 0.3 },
  headerButtons:       { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerBtn:           { backgroundColor: 'rgba(255,255,255,0.08)', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' },
  premiumBtn:          { backgroundColor: 'rgba(157,140,239,0.2)', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(157,140,239,0.3)' },
  headerBtnText:       { color: 'white', fontSize: 12 },
  headerTrialBanner:   { backgroundColor: 'rgba(212,175,55,0.12)', paddingVertical: 6, paddingHorizontal: 16, alignItems: 'center', borderBottomWidth: 1, borderBottomColor: 'rgba(212,175,55,0.25)' },
  headerTrialBannerYazi: { color: '#D4AF37', fontSize: 11, fontWeight: '600' },
  modalBackdrop:       { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end', flexDirection: 'column' },
  modalSheet:          { backgroundColor: '#0f1e33', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40, alignItems: 'center' },
  modalHandle:         { width: 40, height: 4, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 2, marginBottom: 20 },
  modalTitle:          { color: 'white', fontSize: 20, fontWeight: 'bold', marginBottom: 6 },
  modalSubtitle:       { color: 'rgba(255,255,255,0.5)', fontSize: 13, marginBottom: 20 },
  inputGroup:          { width: '100%', marginBottom: 14 },
  inputLabel:          { color: 'rgba(255,255,255,0.6)', fontSize: 13, marginBottom: 6 },
  input:               { backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 12, padding: 14, color: 'white', fontSize: 15, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', width: '100%' },
  saveBtn:             { backgroundColor: '#9d8cef', borderRadius: 14, padding: 16, width: '100%', alignItems: 'center', marginBottom: 10 },
  saveBtnText:         { color: 'white', fontSize: 15, fontWeight: 'bold' },
  onboardingBtn:       { padding: 12, width: '100%', alignItems: 'center', borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  onboardingBtnText:   { color: 'rgba(255,255,255,0.5)', fontSize: 14 },
  premiumSheet:        { backgroundColor: '#0f1e33', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 24, height: '90%', alignItems: 'center', width: '100%' },
  premiumIcon:         { fontSize: 40, marginBottom: 8 },
  premiumTitle:        { color: 'white', fontSize: 18, fontWeight: 'bold', textAlign: 'center' },
  premiumSubtitle:     { color: 'rgba(255,255,255,0.5)', fontSize: 13, marginTop: 6, marginBottom: 16 },
  priceToggle:         { flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 12, padding: 4, marginBottom: 16, width: '100%' },
  priceTab:            { flex: 1, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  priceTabActive:      { backgroundColor: '#9d8cef' },
  priceTabText:        { color: 'rgba(255,255,255,0.5)', fontSize: 14, fontWeight: 'bold' },
  priceTabTextActive:  { color: 'white' },
  indirimRozet:        { backgroundColor: 'rgba(74,222,128,0.2)', borderRadius: 6, paddingHorizontal: 5, paddingVertical: 2 },
  indirimRozetYazi:    { color: '#4ade80', fontSize: 9, fontWeight: 'bold' },
  fiyatKartTek:        { width: '100%', backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 14, paddingVertical: 14, paddingHorizontal: 24, borderWidth: 1, borderColor: 'rgba(157,140,239,0.3)', marginBottom: 16, alignItems: 'center', gap: 4 },
  lansmanRozetRow:     { width: '100%', alignItems: 'flex-start' },
  lansmanRozet:        { backgroundColor: 'rgba(251,191,36,0.18)', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-start' },
  lansmanRozetYazi:    { color: '#fbbf24', fontSize: 10, fontWeight: 'bold', letterSpacing: 0.3 },
  eskiFiyat:           { color: 'rgba(255,255,255,0.35)', fontSize: 14, textDecorationLine: 'line-through', textDecorationStyle: 'solid' },
  fiyatKartIc:         { flexDirection: 'column', alignItems: 'center', gap: 0 },
  fiyatTutar:          { color: 'white', fontSize: 30, fontWeight: 'bold' },
  fiyatPeriyot:        { color: 'rgba(255,255,255,0.5)', fontSize: 14 },
  lansmanAlt:          { color: 'rgba(255,255,255,0.4)', fontSize: 11, textAlign: 'center' },
  fiyatGunluk:         { color: '#4ade80', fontSize: 11, fontWeight: '600' },
  iptalNotu:           { color: 'rgba(255,255,255,0.35)', fontSize: 12, textAlign: 'center', marginBottom: 4 },
  tabloKutu:           { backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', overflow: 'hidden', width: '100%', marginBottom: 12 },
  tabloBaslikRow:      { flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 10, backgroundColor: 'rgba(157,140,239,0.1)' },
  tabloBaslik:         { color: 'rgba(255,255,255,0.5)', fontSize: 11, fontWeight: 'bold', flex: 1 },
  tabloAyrac:          { height: 1, backgroundColor: 'rgba(255,255,255,0.05)' },
  tabloRow:            { flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 9, alignItems: 'center' },
  tabloHucre:          { color: 'rgba(255,255,255,0.7)', fontSize: 12, flex: 1 },
  reklamNot:           { color: 'rgba(255,255,255,0.35)', fontSize: 11, textAlign: 'center', lineHeight: 16, marginBottom: 16, paddingHorizontal: 8 },
  upgradeBtn:          { backgroundColor: '#9d8cef', borderRadius: 14, padding: 16, width: '100%', alignItems: 'center', marginBottom: 8 },
  upgradeBtnText:      { color: 'white', fontSize: 15, fontWeight: 'bold' },
  cancelBtn:           { padding: 10, width: '100%', alignItems: 'center' },
  cancelBtnText:       { color: 'rgba(255,255,255,0.4)', fontSize: 14 },
  gizlilikRow:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingTop: 4, paddingBottom: 4 },
  gizlilikLink:        { color: 'rgba(255,255,255,0.3)', fontSize: 11 },
  gizlilikAyrac:       { color: 'rgba(255,255,255,0.2)', fontSize: 11 },
  ayarlarSheet:        { backgroundColor: '#0f1e33', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 16, maxHeight: '85%' },
  ayarlarBaslik:       { color: 'white', fontSize: 20, fontWeight: 'bold', marginBottom: 20, textAlign: 'center' },
  bolumBaslik:         { color: 'rgba(255,255,255,0.4)', fontSize: 11, fontWeight: 'bold', letterSpacing: 0.8, marginBottom: 8, marginTop: 20, paddingHorizontal: 4 },
  grup:                { backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', overflow: 'hidden' },
  satir:               { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14 },
  satirYazi:           { color: 'white', fontSize: 15 },
  satirAlt:            { color: 'rgba(255,255,255,0.35)', fontSize: 11, marginTop: 2 },
  ok:                  { color: 'rgba(255,255,255,0.3)', fontSize: 20 },
  tik:                 { color: '#9d8cef', fontSize: 18, fontWeight: 'bold' },
  deger:               { color: 'rgba(255,255,255,0.4)', fontSize: 14 },
  ayrac:               { height: 1, backgroundColor: 'rgba(255,255,255,0.06)', marginHorizontal: 16 },
  alt:                 { color: 'rgba(255,255,255,0.2)', fontSize: 11, textAlign: 'center', marginTop: 24, marginBottom: 8 },
  kapatBtn:            { backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 14, padding: 14, alignItems: 'center', marginTop: 12 },
  kapatBtnYazi:        { color: 'rgba(255,255,255,0.6)', fontSize: 15 },
  bildirimUyariBox:    { backgroundColor: 'rgba(251,146,60,0.08)', borderRadius: 12, padding: 10, marginTop: 6, borderWidth: 1, borderColor: 'rgba(251,146,60,0.25)' },
  bildirimUyariYazi:   { color: 'rgba(251,146,60,0.85)', fontSize: 11, lineHeight: 17 },
  popupBackdrop:       { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  popupKart:           { backgroundColor: '#0f1e33', borderRadius: 24, padding: 28, alignItems: 'center', width: '100%', borderWidth: 1, borderColor: 'rgba(157,140,239,0.2)', gap: 10 },
  popupIkon:           { fontSize: 44, marginBottom: 4 },
  popupBaslik:         { color: 'white', fontSize: 20, fontWeight: 'bold', textAlign: 'center', lineHeight: 26 },
  popupMetin:          { color: 'rgba(255,255,255,0.6)', fontSize: 14, textAlign: 'center', lineHeight: 22 },
  popupAlt:            { color: 'rgba(255,255,255,0.35)', fontSize: 12, textAlign: 'center', lineHeight: 18 },
  popupPrimaryBtn:     { backgroundColor: '#9d8cef', borderRadius: 14, paddingVertical: 14, paddingHorizontal: 24, width: '100%', alignItems: 'center', marginTop: 6 },
  popupPrimaryBtnYazi: { color: 'white', fontSize: 15, fontWeight: 'bold' },
  popupSecondaryBtn:   { paddingVertical: 10, width: '100%', alignItems: 'center' },
  popupSecondaryBtnYazi: { color: 'rgba(255,255,255,0.4)', fontSize: 14 },
  // Dev menu
  devMenuBackdrop:     { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', alignItems: 'center', justifyContent: 'center', padding: 32 },
  devMenuKutu:         { backgroundColor: '#1a1a2e', borderRadius: 20, padding: 24, width: '100%', gap: 12, borderWidth: 2, borderColor: '#9d8cef' },
  devMenuBaslik:       { color: '#9d8cef', fontSize: 18, fontWeight: 'bold', textAlign: 'center', marginBottom: 4 },
  devMenuBtn:          { borderRadius: 12, padding: 14, alignItems: 'center', borderWidth: 1 },
  devMenuBtnTrial:     { backgroundColor: 'rgba(157,140,239,0.15)', borderColor: 'rgba(157,140,239,0.4)' },
  devMenuBtnPremium:   { backgroundColor: 'rgba(245,166,35,0.15)', borderColor: 'rgba(245,166,35,0.4)' },
  devMenuBtnFree:      { backgroundColor: 'rgba(255,255,255,0.06)', borderColor: 'rgba(255,255,255,0.15)' },
  devMenuBtnYazi:      { color: 'white', fontSize: 15, fontWeight: '600' },
  devMenuKapatBtn:     { backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 12, padding: 12, alignItems: 'center', marginTop: 4 },
  devMenuKapatYazi:    { color: 'rgba(255,255,255,0.45)', fontSize: 14 },
});
